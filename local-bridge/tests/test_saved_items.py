"""Tests for saved cues and extension state sync in local bridge."""

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_saved_items_roundtrip():
    # 1. Post a saved item
    sample_cue = {
        "id": "cue-test-101",
        "source": "昨日は美味しいご飯を食べました。",
        "vi": "Hôm qua tôi đã ăn bữa cơm ngon.",
        "en": "Yesterday I ate delicious food.",
        "start_media_time": 12.5,
        "end_media_time": 15.0,
        "videoId": "abc12345",
        "savedAt": 1700000000000,
    }
    post_res = client.post("/api/saved-items", json=sample_cue)
    assert post_res.status_code == 200, post_res.text
    data = post_res.json()
    assert data["ok"] is True
    assert data["id"] == "cue-test-101"

    # 2. Get saved items
    get_res = client.get("/api/saved-items")
    assert get_res.status_code == 200
    saved_data = get_res.json()
    assert saved_data["ok"] is True
    cues = saved_data["savedCues"]
    assert any(c["id"] == "cue-test-101" for c in cues)

    # 3. Verify /extension_state contains savedCues
    state_res = client.get("/extension_state")
    assert state_res.status_code == 200
    st = state_res.json()
    assert "cue-test-101" in st["savedCues"]
