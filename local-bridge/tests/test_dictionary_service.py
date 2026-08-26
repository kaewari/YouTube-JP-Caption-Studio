import pytest
from app.services.dictionary import lookup, lookup_word, load_dictionary, _query_hanviet
from app.schemas.models import DictResponse
from app.core.cache import dict_cache


@pytest.fixture(autouse=True)
def init_dict():
    load_dictionary()
    dict_cache.clear()


def test_lookup_accuracy_and_hanviet():
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
