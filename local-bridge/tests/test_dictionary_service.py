import sqlite3

import pytest
from app.services.dictionary import lookup, lookup_word, load_dictionary, _query_hanviet
from app.schemas.models import DictResponse
from app.core.cache import dict_cache


@pytest.fixture(autouse=True)
def init_dict():
    load_dictionary()
    dict_cache.clear()


def _require_dictionary_corpus() -> None:
    """Skip when the full dictionary corpus is not present.

    JMdict / Mazii are downloaded by POST /bootstrap and are not committed, so a
    clean checkout (CI) only has the seed. Without them these assertions would
    fail for a missing-data reason, not for a code reason.
    """
    import sqlite3

    from app.services.dictionary import SQLITE_DB

    if not SQLITE_DB.is_file():
        pytest.skip("dictionary corpus is not built (run the bootstrap)")
    try:
        conn = sqlite3.connect(str(SQLITE_DB))
        try:
            row = conn.execute("SELECT COUNT(*) FROM jmdict").fetchone()
        finally:
            conn.close()
    except sqlite3.Error as exc:
        pytest.skip(f"dictionary corpus is not usable: {exc}")
    if not row or not row[0]:
        pytest.skip("dictionary corpus is empty (run the bootstrap)")


def test_lookup_accuracy_and_hanviet():
    _require_dictionary_corpus()
    res = lookup_word("約束")
    assert res is not None
    assert res.found is True
    assert res.surface == "約束"
    assert res.hanviet == "Ước Thúc"
    assert res.reading == "やくそく"
    assert len(res.glosses_vi) > 0
    assert any("hứa" in g.lower() for g in res.glosses_vi)
    # Ensure no dirty English bridge markers
    assert not any("gốc tiếng anh" in g.lower() for g in res.glosses_vi)
    assert not any("vnedict" in g.lower() for g in res.glosses_vi)


def test_lookup_fallback_rare_word():
    _require_dictionary_corpus()
    # Word with no direct JA-VI definitions should retain clean JMdict EN senses
    res = lookup_word("頑な")
    assert res is not None
    assert res.found is True
    assert res.hanviet == "Ngoan"
    assert len(res.senses) > 0
    assert len(res.senses[0].gloss_en) > 0
    # No broken machine translation generated into empty senses
    for sense in res.senses:
        for g in sense.gloss_vi:
            assert "gốc tiếng anh" not in g.lower()


def test_hanviet_query():
    assert _query_hanviet("約束") == "Ước Thúc"
    assert _query_hanviet("日本語") == "Nhật Bản Ngữ"
    assert _query_hanviet("食べる") == "Thực"
    assert _query_hanviet("あいつ") == ""


def test_curated_seed_words():
    res = lookup_word("あいつ")
    assert res.found is True
    assert any("gã đó" in g or "cô ta" in g for g in res.glosses_vi)
    assert res.hanviet == ""


def test_greedy_idiom_lookup():
    _require_dictionary_corpus()
    # Greedy multi-token lookup using context_tokens
    res = lookup("気", context_tokens=["気", "に", "する"])
    assert res.found is True
    assert res.matched == "気にする"

    # Direct multi-word idiom lookup
    res_direct = lookup("足がつく")
    assert res_direct.found is True
    assert res_direct.matched == "足がつく"
    assert res_direct.hanviet == "Túc"


def test_cache_behavior():
    _require_dictionary_corpus()
    dict_cache.clear()
    res1 = lookup("約束")
    assert res1.found is True

    # Inspect cache
    cached = dict_cache.get("約束||")
    assert cached is not None
    assert cached["hanviet"] == "Ước Thúc"

    # Subsequent lookup should return cached equivalent
    res2 = lookup("約束")
    assert res2.hanviet == res1.hanviet
    assert res2.reading == res1.reading
    assert res2.glosses_vi == res1.glosses_vi


@pytest.mark.parametrize('context', [
    ['水', '。', '色'], ['水。', '色'], ['水', '。色'],
    ['水', '・', '色'], ['水', '!', '色'], ['水', '色。'],
])
def test_context_lookup_keeps_punctuation_boundaries(context):
    result = lookup('水', context_tokens=context)
    assert result.found and result.matched == '水'


def test_context_lookup_requires_unambiguous_target():
    _require_dictionary_corpus()
    result = lookup('気', context_tokens=['気', 'に', 'なる', '気', 'に', 'する'])
    assert result.found and result.matched == '気'


def test_exact_spelling_keeps_rare_mazii_hanviet():
    _require_dictionary_corpus()
    result = lookup('剕')
    assert result.found and result.matched == '剕'
    assert result.hanviet == 'PHÍ'


def test_context_cache_keeps_token_boundaries():
    _require_dictionary_corpus()
    joined = lookup('水', context_tokens=['水', '色'])
    assert joined.matched == '水色'
    separated = lookup('水', context_tokens=['水,色'])
    assert separated.matched == '水'


def test_close_dictionary_closes_every_thread_handle():
    """A rebuild must close the handles of all threads, not only the caller's.

    The handle is created in a worker thread and closed from the main thread,
    so the check runs in the owning thread afterwards.
    """
    import threading

    from app.services import dictionary as dictionary_service

    ready = threading.Event()
    handles = []

    def worker():
        conn = dictionary_service._get_db()
        if conn is not None:
            handles.append(conn)
        ready.set()

    thread = threading.Thread(target=worker)
    thread.start()
    ready.wait(5)
    thread.join()

    if not handles:
        pytest.skip("dict.sqlite is not available in this environment")

    # Closed from ANOTHER thread than the one that opened the handle.
    dictionary_service.close_dictionary()

    results = []

    def use_after_close():
        try:
            for conn in handles:
                conn.execute("SELECT 1")
            results.append("still-open")
        except sqlite3.ProgrammingError as exc:
            results.append(f"closed: {exc}")

    owner = threading.Thread(target=use_after_close)
    owner.start()
    owner.join()

    assert results and results[0].startswith("closed"), (
        f"the handle must be closed for its owning thread, got {results}"
    )


def test_worker_thread_opens_a_new_handle_after_the_dictionary_is_closed():
    """A thread must not keep using the handle that close_dictionary() closed.

    The base kept one handle per thread and closed only the caller's, so the
    other threads kept reading the replaced file (stale dictionary) until the
    bridge restarted.
    """
    import threading

    from app.services import dictionary as dictionary_service

    ready = threading.Event()
    go = threading.Event()
    handles = []

    def worker():
        handles.append(dictionary_service._get_db())
        ready.set()
        go.wait(5)
        handles.append(dictionary_service._get_db())

    thread = threading.Thread(target=worker)
    thread.start()
    ready.wait(5)
    # The rebuild runs in another thread (as it does on /bootstrap).
    dictionary_service.close_dictionary()
    go.set()
    thread.join()

    if not handles or handles[0] is None:
        pytest.skip("dict.sqlite is not available in this environment")

    assert handles[0] is not handles[1], (
        "the thread must open a new handle after the dictionary was closed"
    )
