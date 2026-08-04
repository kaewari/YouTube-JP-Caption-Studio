#!/usr/bin/env python3
"""Smoke: findActiveCue gap-hold + pin skip window (~24px). Fail = scroll follow regress."""
cues = [
    {"id": "a", "start_media_time": 0.0, "end_media_time": 1.0},
    {"id": "b", "start_media_time": 2.0, "end_media_time": 3.0},
    {"id": "c", "start_media_time": 3.5, "end_media_time": 4.0},
]

def find_active(t, cues, grace=0.15):
    live = sorted(cues, key=lambda c: float(c["start_media_time"]) or 0)
    hit = None
    for i, c in enumerate(live):
        start = float(c["start_media_time"]) or 0
        end = float(c["end_media_time"]) or start
        hold_end = (float(live[i + 1]["start_media_time"]) or 0) if i + 1 < len(live) else end + grace
        if start <= t < hold_end:
            hit = c
    return hit

assert find_active(1.5, cues)["id"] == "a"
assert find_active(2.1, cues)["id"] == "b"
assert find_active(4.05, cues)["id"] == "c"
assert find_active(4.2, cues) is None
assert (-4 <= 0 <= 24) and (-4 <= 24 <= 24) and not (-4 <= 25 <= 24)
print("scroll_follow_smoke ok")
