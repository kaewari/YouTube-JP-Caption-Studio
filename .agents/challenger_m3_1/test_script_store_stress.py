"""Empirical stress test harness for local-bridge script_store.py."""

import json
import random
import shutil
import sys
import threading
import time
from pathlib import Path

# Add local-bridge to sys.path
BRIDGE_DIR = Path(__file__).resolve().parent.parent.parent / "local-bridge"
sys.path.insert(0, str(BRIDGE_DIR))

from script_store import (
    _safe_video_id,
    save_script,
    load_script,
    delete_script,
    render_script_txt,
    video_dir,
    scripts_root,
)

def run_tests():
    print("--- 1. Testing Path Traversal & Invalid video_id ---")
    invalid_ids = [
        "../etc/passwd",
        "../../root",
        "../",
        "short",  # <6 chars
        "a" * 65, # >64 chars
        "<script>",
        "vid with spaces",
        "vid.with.dots",
        "vid$dollar",
    ]
    for vid in invalid_ids:
        try:
            _safe_video_id(vid)
            print(f"[FAIL] Should have rejected video_id: {vid!r}")
        except ValueError as err:
            print(f"[PASS] Correctly rejected video_id {vid!r}: {err}")

    valid_ids = [
        "abcDEF123456",
        "video_id-123",
        "A" * 64,
        "123456",
    ]
    for vid in valid_ids:
        try:
            res = _safe_video_id(vid)
            print(f"[PASS] Accepted valid video_id: {res!r}")
        except Exception as err:
            print(f"[FAIL] Unexpected rejection of valid video_id {vid!r}: {err}")

    print("\n--- 2. Testing Data Integrity & Edge-Case Cues ---")
    test_vid = "stress_test_vid_001"
    
    # Mock cues with malformed / dirty data
    mock_cues = [
        # Normal cue (1)
        {
            "id": "c1",
            "start": 0.5,
            "end": 3.2,
            "source": "こんにちは！",
            "en": "Hello!",
            "vi": "Xin chào!",
            "tokens": [{"surface": "こんにちは", "reading": "こんにちは"}],
            "text_source": "yt",
        },
        # Dirty non-dict items mixed in (save_script should filter them out)
        None,
        "string item",
        12345,
        # Cue with missing fields (2)
        {"id": "c2", "source": "日本語"},
        # Draft cue with ID (3)
        {"id": "c3", "source": "", "en": "", "vi": "", "text_source": "manual"},
        # Draft cue with ID (4) -> KEPT because cue_id is present
        {"id": "c4", "source": "", "en": "", "vi": "", "text_source": "yt"},
        # Draft cue WITHOUT ID and yt text_source -> SKIPPED
        {"id": "", "source": "", "en": "", "vi": "", "text_source": "yt"},
        # Draft cue WITHOUT ID and manual text_source (5) -> KEPT because text_source is manual
        {"id": "", "source": "", "en": "", "vi": "", "text_source": "manual"},
        # Heavy cue with special chars, git conflict lookalikes, HTML, Emojis, Unicode (6)
        {
            "id": "c5",
            "start": 10.0,
            "end": 15.0,
            "source": "======= Git Conflict Marker & -------------------- Separator & 𠮷野家 😊",
            "en": "<script>alert('xss')</script> & \"quotes\" & \\slashes",
            "vi": "Cầu tự do & 'đơn' & \n newlines \r returns",
            "tokens": [{"surface": "𠮷野家", "reading": "のえ"}],
        },
    ]

    res = save_script(test_vid, mock_cues, url="https://youtube.com/watch?v=stress_test_vid_001", title="Test Title & Special Chars < >")
    print(f"save_script result: {res}")

    loaded = load_script(test_vid)
    assert loaded is not None, "Failed to load saved script"
    cues_loaded = loaded["cues"]
    print(f"Loaded cue count: {len(cues_loaded)}")

    # Verify filtering: expected 6 valid cues kept
    assert len(cues_loaded) == 6, f"Expected 6 cues, got {len(cues_loaded)}"
    print("[PASS] Dirty cue filtering & draft cue preservation logic verified!")

    # Check script.txt content for bare ===== lines
    v_folder = video_dir(test_vid)
    txt_content = (v_folder / "script.txt").read_text(encoding="utf-8")
    for line in txt_content.splitlines():
        assert line != "======", f"Found dangerous bare conflict marker line in script.txt: {line}"
    print("[PASS] script.txt contains no bare '=======' conflict markers")

    # Clean up test script
    delete_script(test_vid)
    print("[PASS] delete_script succeeded")

    print("\n--- 3. Testing High-Concurrency Atomic Writes (Race Conditions & Corruptions) ---")
    concurrent_vid = "stress_test_vid_concurrent"
    num_threads = 15
    iterations_per_thread = 20

    errors = []
    read_corruptions = []

    def writer_thread(thread_id):
        for i in range(iterations_per_thread):
            cues = [
                {
                    "id": f"t{thread_id}_{i}_{j}",
                    "start": j * 1.5,
                    "end": (j + 1) * 1.5,
                    "source": f"Thread {thread_id} Iter {i} Cue {j}: テスト",
                    "en": f"Thread {thread_id} Iter {i} Cue {j} EN",
                    "vi": f"Thread {thread_id} Iter {i} Cue {j} VI",
                }
                for j in range(10)
            ]
            try:
                save_script(concurrent_vid, cues, title=f"Thread {thread_id} Iter {i}")
            except Exception as e:
                errors.append(f"Writer T{thread_id} iter {i} error: {e}")

    def reader_thread():
        v_folder = video_dir(concurrent_vid)
        cues_path = v_folder / "cues.json"
        txt_path = v_folder / "script.txt"
        meta_path = v_folder / "meta.json"

        for _ in range(100):
            time.sleep(0.005)
            if cues_path.exists():
                try:
                    content = cues_path.read_bytes()
                    if len(content) == 0:
                        read_corruptions.append("cues.json read 0 bytes (truncated file exposed!)")
                    else:
                        json.loads(content.decode("utf-8"))
                except Exception as e:
                    read_corruptions.append(f"cues.json corrupted read: {e}")

            if txt_path.exists():
                try:
                    content = txt_path.read_bytes()
                    if len(content) == 0:
                        read_corruptions.append("script.txt read 0 bytes (truncated file exposed!)")
                except Exception as e:
                    read_corruptions.append(f"script.txt corrupted read: {e}")

            if meta_path.exists():
                try:
                    content = meta_path.read_bytes()
                    if len(content) == 0:
                        read_corruptions.append("meta.json read 0 bytes (truncated file exposed!)")
                    else:
                        json.loads(content.decode("utf-8"))
                except Exception as e:
                    read_corruptions.append(f"meta.json corrupted read: {e}")

    threads = []
    # Start reader thread
    r_thread = threading.Thread(target=reader_thread)
    r_thread.start()

    # Start writer threads
    for tid in range(num_threads):
        t = threading.Thread(target=writer_thread, args=(tid,))
        threads.append(t)
        t.start()

    for t in threads:
        t.join()
    r_thread.join()

    # Check for dangling .tmp files
    v_folder = video_dir(concurrent_vid)
    tmp_files = list(v_folder.glob("*.tmp"))
    
    print(f"Concurrent write errors: {len(errors)}")
    print(f"Read corruption / truncation events detected: {len(read_corruptions)}")
    print(f"Dangling .tmp files: {len(tmp_files)}")

    if errors:
        print("Writer errors:", errors[:5])
    if read_corruptions:
        print("Read corruptions:", read_corruptions[:5])

    assert len(errors) == 0, "Concurrent writers encountered errors!"
    assert len(read_corruptions) == 0, "Concurrent readers detected corrupted or 0-byte files!"
    assert len(tmp_files) == 0, f"Found dangling temp files: {tmp_files}"

    # Verify final script state is valid
    final_load = load_script(concurrent_vid)
    assert final_load is not None and final_load["ok"] is True
    print(f"[PASS] Concurrency test passed! Final cue count: {final_load['cue_count']}")

    delete_script(concurrent_vid)
    print("--- Completed script_store stress test ---")

if __name__ == "__main__":
    run_tests()
