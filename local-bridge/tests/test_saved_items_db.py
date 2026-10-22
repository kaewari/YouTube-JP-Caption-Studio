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


def test_saved_items_api_routes(tmp_path, monkeypatch):
    # The API must not write into the developer's real data/saved_items.db.
    import app.api.saved_items as saved_items_api
    import app.db.saved_items_db as saved_items_db

    monkeypatch.setattr(saved_items_db, "ROOT", tmp_path)
    monkeypatch.setattr(saved_items_api, "_schema_ready", False)

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


def test_a_request_connection_stays_with_its_own_thread(tmp_path, monkeypatch):
    """The connection of a request must not be usable by another thread.

    The API hands out one connection per request, so it belongs to the thread
    that opened it - a shared connection would raise "SQLite objects created
    in a thread can only be used in that same thread".
    """
    import app.api.saved_items as saved_items_api
    import app.db.saved_items_db as saved_items_db

    monkeypatch.setattr(saved_items_db, "ROOT", tmp_path)
    monkeypatch.setattr(saved_items_api, "_schema_ready", False)

    opened = []
    real_connect = saved_items_api.connect_db

    def counting_connect(*args, **kwargs):
        conn = real_connect(*args, **kwargs)
        opened.append(conn)
        return conn

    monkeypatch.setattr(saved_items_api, "connect_db", counting_connect)

    with saved_items_api.db_conn() as conn:
        pass
    assert opened, "the request must open a connection"

    errors = []

    def worker() -> None:
        try:
            opened[0].execute("SELECT 1").fetchone()
        except sqlite3.ProgrammingError:
            return  # expected: the handle belongs to the request thread
        except Exception as exc:  # pragma: no cover - failure path
            errors.append(exc)
            return
        errors.append(RuntimeError("the connection was used from another thread"))

    thread = threading.Thread(target=worker)
    thread.start()
    thread.join()
    assert not errors, f"cross-thread use must not succeed: {errors}"


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


def test_sync_endpoint_rejects_oversized_payload(tmp_path, monkeypatch):
    """A payload beyond the cap is refused instead of being written row by row."""
    import app.api.saved_items as saved_items_api
    import app.db.saved_items_db as saved_items_db

    monkeypatch.setattr(saved_items_db, "ROOT", tmp_path)
    monkeypatch.setattr(saved_items_api, "_schema_ready", False)

    client = TestClient(app)
    res = client.post("/saved/sync", json={
        "items": [{"id": f"too_many_{i}", "type": "word", "source": "w"} for i in range(5001)],
        "since": 0.0,
    })
    assert res.status_code == 413


def test_sync_paging_keeps_rows_that_share_a_timestamp(test_db: sqlite3.Connection):
    """Rows sharing the page boundary timestamp must not be skipped.

    A bare "updated_at > since" cursor drops every row whose timestamp equals
    the last row of the previous page.
    """
    page_limit = 5000
    total = page_limit + 10
    with test_db:
        # ALL rows share one timestamp: a cursor of "updated_at > since" would
        # deliver the first page and then never the rest.
        for i in range(total):
            test_db.execute(
                "INSERT INTO saved_items(id, type, source, created_at, updated_at)"
                " VALUES(?,?,?,?,?)",
                (f"tie_{i}", "cue", "s", 1.0, 1.0),
            )

    delivered: set[str] = set()
    since, since_rowid = 0.0, 0
    for _ in range(10):
        res = sync_items(test_db, [], since_timestamp=since, since_rowid=since_rowid)
        delivered.update(item["id"] for item in res["server_items"])
        if not res["has_more"]:
            break
        since, since_rowid = res["next_since"], res["next_rowid"]

    assert len(delivered) == total, (
        f"paging lost {total - len(delivered)} rows that share a timestamp"
    )


def test_connection_recovers_when_the_database_file_is_replaced(tmp_path, monkeypatch):
    """A replaced database file must not break the next request.

    The stale connection keeps a lock on the old file, so the new one has to
    be opened after the old handles are released.
    """
    import app.api.saved_items as saved_items_api
    import app.db.saved_items_db as saved_items_db

    monkeypatch.setattr(saved_items_db, "ROOT", tmp_path)
    monkeypatch.setattr(saved_items_api, "_schema_ready", False)

    # A worker thread holds a connection to the current file.
    def worker():
        with saved_items_api.db_conn() as conn:
            upsert_item(conn, {"id": "before", "type": "cue", "source": "s"})

    thread = threading.Thread(target=worker)
    thread.start()
    thread.join()

    # Replace the file (a restore or a wipe).
    db_file = saved_items_db.get_db_path()
    assert db_file.exists(), f"the database must exist before the wipe: {db_file}"
    for path in db_file.parent.glob("saved_items.db*"):
        path.unlink()

    result = []

    def second_worker():
        try:
            with saved_items_api.db_conn() as conn:
                upsert_item(conn, {"id": "after", "type": "cue", "source": "s"})
            result.append("ok")
        except Exception as exc:
            result.append(f"{type(exc).__name__}: {exc}")

    thread2 = threading.Thread(target=second_worker)
    thread2.start()
    thread2.join()
    assert result == ["ok"], f"the next request must recover, got {result}"


def test_each_request_uses_its_own_connection(tmp_path, monkeypatch):
    """Every request opens its own connection.

    A connection shared between requests breaks as soon as a second request is
    served by another worker thread ("SQLite objects created in a thread can
    only be used in that same thread").
    """
    import app.api.saved_items as saved_items_api
    import app.db.saved_items_db as saved_items_db

    monkeypatch.setattr(saved_items_db, "ROOT", tmp_path)
    monkeypatch.setattr(saved_items_api, "_schema_ready", False)

    opened = []
    real_connect = saved_items_api.connect_db

    def counting_connect(*args, **kwargs):
        conn = real_connect(*args, **kwargs)
        opened.append(conn)
        return conn

    monkeypatch.setattr(saved_items_api, "connect_db", counting_connect)

    # The requests run in different threads, like the FastAPI thread pool does:
    # a connection shared between them fails with "SQLite objects created in a
    # thread can only be used in that same thread".
    statuses = []
    errors = []

    def request():
        client = TestClient(app)
        try:
            statuses.append(client.get("/saved/items?limit=5").status_code)
        except Exception as exc:
            errors.append(f"{type(exc).__name__}: {exc}")

    threads = [threading.Thread(target=request) for _ in range(4)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert not errors, errors
    assert statuses == [200] * 4, f"every request must succeed, got {statuses}"

    # A sequential request opens its own connection as well - a connection
    # cached between requests would break the next request served by another
    # worker thread.
    assert TestClient(app).get("/saved/items?limit=5").status_code == 200
    assert len(opened) == 5, f"every request needs its own connection, got {len(opened)}"
    # Every connection was released when the request ended.
    for conn in opened:
        try:
            conn.execute("SELECT 1")
        except sqlite3.ProgrammingError:
            continue
        raise AssertionError("the connection of a finished request is still open")


def test_the_schema_is_created_only_once(tmp_path, monkeypatch):
    """Concurrent first requests must not create the schema at the same time.

    journal_mode=WAL needs an exclusive lock, so two threads running it at
    once make the request fail with "database is locked".
    """
    import threading

    import app.api.saved_items as saved_items_api
    import app.db.saved_items_db as saved_items_db

    monkeypatch.setattr(saved_items_db, "ROOT", tmp_path)
    monkeypatch.setattr(saved_items_api, "_schema_ready", False)

    calls = []
    concurrent = 0
    peak = 0
    lock = threading.Lock()
    real_init = saved_items_api.init_db

    def counting_init(*args, **kwargs):
        nonlocal concurrent, peak
        with lock:
            concurrent += 1
            peak = max(peak, concurrent)
            calls.append(1)
        try:
            return real_init(*args, **kwargs)
        finally:
            with lock:
                concurrent -= 1

    monkeypatch.setattr(saved_items_api, "init_db", counting_init)

    errors = []

    def worker():
        try:
            with saved_items_api.db_conn() as conn:
                conn.execute("SELECT 1")
        except Exception as exc:
            errors.append(f"{type(exc).__name__}: {exc}")

    threads = [threading.Thread(target=worker) for _ in range(8)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert not errors, errors
    assert len(calls) == 1, f"the schema must be created once, got {len(calls)}"
    assert peak == 1, f"the schema creation must not overlap, peak was {peak}"

def test_sync_writes_a_page_in_one_transaction(test_db: sqlite3.Connection):
    """A page of client items must not cost one commit per item."""
    statements: list[str] = []
    test_db.set_trace_callback(statements.append)
    items = [
        {"id": f"page-{i}", "type": "cue", "source": f"s{i}", "updated_at": 1000.0 + i}
        for i in range(200)
    ]
    result = sync_items(test_db, items)
    commits = [s for s in statements if s.strip().upper().startswith("COMMIT")]
    assert result["applied"] == 200, result
    assert len(commits) == 1, f"{len(commits)} commits for 200 items"
    rows = test_db.execute("SELECT COUNT(*) FROM saved_items").fetchone()[0]
    assert rows == 200, rows

def test_sync_still_applies_the_last_write_wins_rule(test_db: sqlite3.Connection):
    """Batching must not change which row wins."""
    sync_items(test_db, [{"id": "lww", "type": "cue", "source": "old", "updated_at": 10.0}])
    sync_items(test_db, [{"id": "lww", "type": "cue", "source": "new", "updated_at": 20.0}])
    assert get_item(test_db, "lww")["source"] == "new"
    # An older client row must not overwrite the newer server row.
    sync_items(test_db, [{"id": "lww", "type": "cue", "source": "stale", "updated_at": 5.0}])
    assert get_item(test_db, "lww")["source"] == "new"
