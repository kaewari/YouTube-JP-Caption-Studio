"""Comprehensive regression benchmark for Japanese-Vietnamese dictionary subsystem.

Verifies:
1. 50 core JLPT N5-N1 vocabulary items with accurate Vietnamese glosses & Hán-Việt readings.
2. Idioms and compound verbs (greedy multi-token matching and single-token compound entries).
3. No machine-translation artifacts (no "gốc tiếng anh", "vnedict", etc.).
4. Clean JMdict English fallback for rare terms.
"""

from __future__ import annotations

import pytest
from app.services.dictionary import lookup, lookup_word, load_dictionary
from app.core.cache import dict_cache


@pytest.fixture(autouse=True)
def _setup_dict():
    load_dictionary()
    dict_cache.clear()


# 50 common Japanese words spanning JLPT N5 to N1
JLPT_VOCAB_50: list[tuple[str, str, str]] = [
    # (word, expected_hanviet, expected_vi_substring)
    ("約束", "Ước Thúc", "hứa"),
    ("勉強", "Miễn Cường", "học"),
    ("東京", "Đông Kinh", "đông kinh"),
    ("会社", "Hội Xã", "công ty"),
    ("食べる", "Thực", "ăn"),
    ("飲む", "Ẩm", "uống"),
    ("行く", "Hành", "đi"),
    ("見る", "Kiến", "nhìn"),
    ("聞く", "Văn", "nghe"),
    ("話す", "Thoại", "nói"),
    ("買う", "Mãi", "mua"),
    ("先生", "Tiên Sinh", "thầy"),
    ("学生", "Học Sinh", "học sinh"),
    ("学校", "Học Hiệu", "trường"),
    ("日本語", "Nhật Bản Ngữ", "tiếng nhật"),
    ("友達", "Hữu Đạt", "bạn"),
    ("時間", "Thời Gian", "thời gian"),
    ("電話", "Điện Thoại", "điện thoại"),
    ("電車", "Điện Xa", "tàu"),
    ("病院", "Bệnh Viện", "bệnh viện"),
    ("旅行", "Lữ Hành", "du lịch"),
    ("家族", "Gia Tộc", "gia đình"),
    ("天気", "Thiên Khí", "thời tiết"),
    ("音楽", "Âm Nhạc", "âm nhạc"),
    ("写真", "Tả Chân", "ảnh"),
    ("料理", "Liệu Lý", "nấu"),
    ("映画", "Ánh Họa", "phim"),
    ("仕事", "Sĩ Sự", "công việc"),
    ("問題", "Vấn Đề", "vấn đề"),
    ("質問", "Chất Vấn", "câu hỏi"),
    ("説明", "Thuyết Minh", "giải thích"),
    ("計画", "Kế Họa", "kế hoạch"),
    ("経験", "Kinh Nghiệm", "kinh nghiệm"),
    ("経済", "Kinh Tế", "kinh tế"),
    ("政治", "Chính Trị", "chính trị"),
    ("社会", "Xã Hội", "xã hội"),
    ("文化", "Văn Hóa", "văn hóa"),
    ("歴史", "Lịch Sử", "lịch sử"),
    ("法律", "Pháp Luật", "luật"),
    ("環境", "Hoàn Cảnh", "môi trường"),
    ("関係", "Quan Hệ", "quan hệ"),
    ("連絡", "Liên Lạc", "liên lạc"),
    ("相談", "Tương Đàm", "thảo luận"),
    ("準備", "Chuẩn Bị", "chuẩn bị"),
    ("確認", "Xác Nhận", "xác nhận"),
    ("成功", "Thành Công", "thành công"),
    ("失敗", "Thất Bại", "thất bại"),
    ("必要", "Tất Yếu", "cần thiết"),
    ("簡単", "Giản Đơn", "đơn giản"),
    ("複雑", "Phức Tạp", "phức tạp"),
]


def test_jlpt_vocab_50_accuracy_and_hanviet():
    for word, expected_hv, expected_vi in JLPT_VOCAB_50:
        res = lookup_word(word)
        assert res is not None, f"Lookup failed for {word}"
        assert res.found is True, f"Word not found: {word}"
        assert res.hanviet == expected_hv, f"Hán-Việt mismatch for {word}: got '{res.hanviet}', expected '{expected_hv}'"
        assert len(res.glosses_vi) > 0, f"Missing VI glosses for {word}"
        assert any(expected_vi in g.lower() for g in res.glosses_vi), (
            f"Expected '{expected_vi}' in glosses for {word}, got {res.glosses_vi}"
        )


def test_no_broken_en_vi_translation_artifacts():
    for word, _, _ in JLPT_VOCAB_50:
        res = lookup_word(word)
        assert res is not None
        for g in res.glosses_vi:
            assert "gốc tiếng anh" not in g.lower()
            assert "vnedict" not in g.lower()
        for sense in res.senses:
            for g in sense.gloss_vi:
                assert "gốc tiếng anh" not in g.lower()
                assert "vnedict" not in g.lower()


def test_idioms_and_compound_verbs():
    # Greedy multi-token idiom
    r1 = lookup("気", context_tokens=["気", "に", "する"])
    assert r1.found is True
    assert r1.matched == "気にする"

    # Direct idiom lookup
    r2 = lookup("足がつく")
    assert r2.found is True
    assert r2.matched == "足がつく"
    assert r2.hanviet == "Túc"

    # Compound verbs
    r3 = lookup_word("思い出す")
    assert r3.found is True
    assert r3.hanviet == "Tư Xuất"
    assert any("nhớ" in g.lower() for g in r3.glosses_vi) or len(r3.senses) > 0

    r4 = lookup_word("話し合う")
    assert r4.found is True
    assert r4.hanviet == "Thoại Hợp"


def test_clean_jmdict_en_fallback():
    # Rare word that only has JMdict EN definitions
    res = lookup_word("頑な")
    assert res is not None
    assert res.found is True
    assert res.hanviet == "Ngoan"
    assert len(res.senses) > 0
    assert len(res.senses[0].gloss_en) > 0
    for sense in res.senses:
        for g in sense.gloss_vi:
            assert "gốc tiếng anh" not in g.lower()
