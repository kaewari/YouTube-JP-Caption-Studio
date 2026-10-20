"""Unit tests for Saved Items SQLite database (WAL mode, trigram FTS5, tombstone sync)."""

import sqlite3
import threading
import time
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from app.db.saved_items_db import (
    init_db,
    upsert_item,
    get_item,
    list_items,
    delete_item,
    search_items,
    sync_items,
)
from app.main import app


@pytest.fixture
def test_db(tmp_path: Path):
    db_file = tmp_path / "test_saved_items.db"
    conn = init_db(db_file)
    yield conn
    conn.close()


def test_wal_mode_and_pragmas(test_db: sqlite3.Connection):
    cur = test_db.execute("PRAGMA journal_mode;")
    mode = cur.fetchone()[0]
    assert mode.lower() == "wal"

    cur = test_db.execute("PRAGMA busy_timeout;")
    timeout = cur.fetchone()[0]
    assert timeout >= 5000


def test_upsert_and_retrieve_word_and_cue(test_db: sqlite3.Connection):
    word = {
        "id": "word:約束",
        "type": "word",
        "video_id": "test_vid_1",
        "source": "約束",
        "reading": "やくそく",
        "translation_vi": "Lời hứa, ước hẹn",
        "metadata": {"jlpt": "N4", "hanviet": "Ước Thúc"},
    }
    saved_w = upsert_item(test_db, word)
    assert saved_w["id"] == "word:約束"
    assert saved_w["source"] == "約束"
    assert saved_w["metadata"]["hanviet"] == "Ước Thúc"

    cue = {
        "id": "cue:c101",
        "type": "cue",
        "video_id": "test_vid_1",
        "source": "約束を守ることは大切です。",
        "translation_vi": "Việc giữ lời hứa là rất quan trọng.",
        "start_time": 10.5,
        "end_time": 14.2,
    }
    saved_c = upsert_item(test_db, cue)
    assert saved_c["id"] == "cue:c101"
    assert saved_c["start_time"] == 10.5

    # Retrieve
    retrieved = get_item(test_db, "cue:c101")
    assert retrieved is not None
    assert retrieved["source"] == "約束を守ることは大切です。"


def test_trigram_fts5_japanese_search(test_db: sqlite3.Connection):
    upsert_item(test_db, {
        "id": "c1",
        "type": "cue",
        "source": "どこ行くんですか？",
        "translation_vi": "Bạn đang đi đâu thế?",
    })
    upsert_item(test_db, {
        "id": "c2",
        "type": "cue",
        "source": "これから東京駅に向かいます。",
        "translation_vi": "Bây giờ tôi đi về hướng ga Tokyo.",
    })
    upsert_item(test_db, {
        "id": "c3",
        "type": "cue",
        "source": "約束の場所へ行きましょう。",
        "translation_vi": "Hãy đến điểm hẹn nào.",
    })

    # Search with trigram FTS5 (>= 3 chars)
    results = search_items(test_db, "東京駅")
    assert len(results) == 1
    assert results[0]["id"] == "c2"

    results = search_items(test_db, "どこ行く")
    assert len(results) == 1
    assert results[0]["id"] == "c1"

    # Search with Vietnamese substring
    results_vi = search_items(test_db, "đi đâu")
    assert len(results_vi) == 1
    assert results_vi[0]["id"] == "c1"

    # Short query (< 3 chars) falls back to LIKE seamlessly
    results_short = search_items(test_db, "東京")
    assert len(results_short) == 1
    assert results_short[0]["id"] == "c2"


def test_soft_delete_and_tombstone(test_db: sqlite3.Connection):
    item = {
        "id": "del_me",
        "type": "cue",
        "source": "消える予定の文",
    }
    upsert_item(test_db, item)

    # Active items list should include it
    active = list_items(test_db, include_deleted=False)
    assert any(x["id"] == "del_me" for x in active)

    # Soft delete
    ok = delete_item(test_db, "del_me", hard=False)
    assert ok is True

    # Active items should NOT include it
    active_after = list_items(test_db, include_deleted=False)
    assert not any(x["id"] == "del_me" for x in active_after)

    # But list with include_deleted=True should have it with is_deleted=1
    all_items = list_items(test_db, include_deleted=True)
    deleted_item = next(x for x in all_items if x["id"] == "del_me")
    assert deleted_item["is_deleted"] == 1


def test_two_way_sync_last_write_wins(test_db: sqlite3.Connection):
    t0 = time.time()
    upsert_item(test_db, {
        "id": "sync_item_1",
        "type": "word",
        "source": "古い情報",
        "updated_at": t0 - 10,
    })

    # Client syncs a newer version of sync_item_1 and a new sync_item_2
    client_items = [
        {
            "id": "sync_item_1",
            "type": "word",
            "source": "新しい情報",
            "updated_at": t0 + 5,
        },
        {
            "id": "sync_item_2",
            "type": "cue",
            "source": "クライアント側の新文",
            "updated_at": t0 + 2,
        },
    ]

    res = sync_items(test_db, client_items, since_timestamp=t0 - 1)
    assert res["applied"] == 2
    server_items = {x["id"]: x for x in res["server_items"]}

    # Server should reflect newer info
    assert server_items["sync_item_1"]["source"] == "新しい情報"
    assert "sync_item_2" in server_items

    # Stale client edit must NOT overwrite newer server data
    stale_client = [
        {
            "id": "sync_item_1",
            "type": "word",
            "source": "非常に古い情報",
            "updated_at": t0 - 50,
        }
    ]
    sync_items(test_db, stale_client, since_timestamp=0)
    current = get_item(test_db, "sync_item_1")
    assert current["source"] == "新しい情報"


def test_saved_items_api_routes():
    client = TestClient(app)

    # Create item via API
    res = client.post("/saved/items", json={
        "id": "api_test_cue",
        "type": "cue",
        "video_id": "vid_api",
        "source": "API経由で保存された文",
        "translation_vi": "Câu lưu qua API",
    })
    assert res.status_code == 200
    assert res.json()["id"] == "api_test_cue"

    # Get item
    res_get = client.get("/saved/items/api_test_cue")
    assert res_get.status_code == 200
    assert res_get.json()["source"] == "API経由で保存された文"

    # Search
    res_search = client.get("/saved/search?q=API経由")
    assert res_search.status_code == 200
    results = res_search.json()
    assert len(results) >= 1
    assert any(x["id"] == "api_test_cue" for x in results)

    # Sync endpoint
    res_sync = client.post("/saved/sync", json={
        "items": [
            {"id": "sync_api_1", "type": "word", "source": "言葉", "updated_at": time.time()}
        ],
        "since": 0.0,
    })
    assert res_sync.status_code == 200
    sync_data = res_sync.json()
    assert sync_data["applied"] == 1
    assert any(x["id"] == "sync_api_1" for x in sync_data["server_items"])

    # Delete
    res_del = client.delete("/saved/items/api_test_cue")
    assert res_del.status_code == 200
    assert res_del.json()["ok"] is True


def test_connection_is_usable_from_another_thread(test_db: sqlite3.Connection):
    """A request served by another worker thread must not raise ProgrammingError.

    sqlite3 connections are bound to their creating thread unless
    check_same_thread=False; the API hands out one connection per thread.
    """
    errors: list[Exception] = []

    def worker() -> None:
        try:
            test_db.execute("SELECT 1").fetchone()
        except Exception as exc:  # pragma: no cover - failure path
            errors.append(exc)

    thread = threading.Thread(target=worker)
    thread.start()
    thread.join()
    assert not errors, f"cross-thread use failed: {errors}"


def test_sync_response_is_capped(test_db: sqlite3.Connection):
    """A sync response must not ship the whole table (iOS sync would download GB)."""
    with test_db:
        for i in range(5100):
            test_db.execute(
                "INSERT INTO saved_items(id, type, source, created_at, updated_at)"
                " VALUES(?,?,?,?,?)",
                (f"cap_{i}", "cue", "s", 1.0, 1.0 + i),
            )
    result = sync_items(test_db, [], since_timestamp=0.0)
    assert len(result["server_items"]) == 5000


def test_sync_endpoint_rejects_oversized_payload():
    """A payload beyond the cap is refused instead of being written row by row."""
    client = TestClient(app)
    res = client.post("/saved/sync", json={
        "items": [{"id": f"too_many_{i}", "type": "word", "source": "w"} for i in range(5001)],
        "since": 0.0,
    })
    assert res.status_code == 413
