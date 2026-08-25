import pytest
from app.data.hanviet_data import get_hanviet_reading
from app.schemas.models import DictResponse


def test_hanviet_lookup():
    assert get_hanviet_reading("約束") == "Ước Thúc"
    assert get_hanviet_reading("日本語") == "Nhật Bản Ngữ"
    assert get_hanviet_reading("食べる") == "Thực"
    assert get_hanviet_reading("あいつ") == ""


def test_dict_response_schema_hanviet():
    resp = DictResponse(surface="約束", reading="やくそく", hanviet="Ước Thúc")
    assert resp.hanviet == "Ước Thúc"
