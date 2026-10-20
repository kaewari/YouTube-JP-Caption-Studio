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

    Each worker thread keeps its own read-only connection; closing only the
    caller's left the other threads reading the replaced dict.sqlite.
    """
    import threading

    from app.services import dictionary as dictionary_service

    handles = []

    def worker():
        conn = dictionary_service._get_db()
        if conn is not None:
            handles.append(conn)

    threads = [threading.Thread(target=worker) for _ in range(3)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    if not handles:
        pytest.skip("dict.sqlite is not available in this environment")

    dictionary_service.close_dictionary()
    for conn in handles:
        with pytest.raises(sqlite3.ProgrammingError):
            conn.execute("SELECT 1")
