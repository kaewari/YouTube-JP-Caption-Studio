"""Unit and integration tests for scripts/slice_gold_audio.py.

Verifies:
- 16 kHz mono resampling invariant.
- Multi-channel stereo downmix behavior.
- Precise millisecond boundary calculation.
- Edge case guards (empty audio, negative start, inverted bounds, out-of-range start).
- Window clamping when end exceeds audio length.
- Manifest schema validation on testdata/audio-gold/manifest.json.
- End-to-end synthetic audio slice, export, and read-back verification.
"""

import json
import tempfile
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

from scripts.slice_gold_audio import (
    TARGET_SAMPLE_RATE,
    load_audio,
    process_manifest,
    resample_audio,
    save_audio,
    slice_audio,
    to_mono,
    validate_manifest_window,
)


def test_to_mono_from_1d():
    """1D array should pass through unchanged as contiguous float32."""
    arr = np.array([0.1, 0.2, -0.3], dtype=np.float32)
    mono = to_mono(arr)
    assert mono.ndim == 1
    assert mono.dtype == np.float32
    np.testing.assert_allclose(mono, arr)


def test_to_mono_from_stereo():
    """2D stereo (N, 2) array should be averaged across channels."""
    left = np.array([0.2, 0.4, 0.6], dtype=np.float32)
    right = np.array([0.4, 0.6, 0.8], dtype=np.float32)
    stereo = np.column_stack([left, right])
    mono = to_mono(stereo)

    assert mono.ndim == 1
    assert mono.dtype == np.float32
    assert len(mono) == 3
    expected = (left + right) / 2.0
    np.testing.assert_allclose(mono, expected)


def test_to_mono_empty_raises():
    """Empty audio should raise ValueError."""
    with pytest.raises(ValueError, match="cannot be empty"):
        to_mono(np.array([], dtype=np.float32))


def test_to_mono_invalid_dims_raises():
    """3D array should raise ValueError."""
    arr = np.zeros((2, 2, 2), dtype=np.float32)
    with pytest.raises(ValueError, match="Expected 1D or 2D"):
        to_mono(arr)


def test_resample_identity():
    """Resampling 16kHz to 16kHz should return identical data."""
    arr = np.linspace(-1.0, 1.0, 16000, dtype=np.float32)
    res = resample_audio(arr, orig_sr=16000, target_sr=16000)
    assert len(res) == 16000
    np.testing.assert_allclose(res, arr)


def test_resample_from_48k():
    """Resampling 48kHz (YouTube Opus standard) to 16kHz (factor 1/3)."""
    # 1 second of 48kHz audio = 48000 samples
    arr = np.sin(2 * np.pi * 440 * np.linspace(0, 1.0, 48000)).astype(np.float32)
    res = resample_audio(arr, orig_sr=48000, target_sr=16000)
    assert len(res) == 16000
    assert res.dtype == np.float32


def test_resample_from_44k1():
    """Resampling 44.1kHz (CD standard) to 16kHz."""
    arr = np.zeros(44100, dtype=np.float32)
    res = resample_audio(arr, orig_sr=44100, target_sr=16000)
    assert len(res) == 16000


def test_resample_invalid_inputs_raise():
    """Invalid rates or empty arrays should raise ValueError."""
    arr = np.array([0.1, 0.2], dtype=np.float32)
    with pytest.raises(ValueError, match="positive"):
        resample_audio(arr, orig_sr=0, target_sr=16000)
    with pytest.raises(ValueError, match="positive"):
        resample_audio(arr, orig_sr=16000, target_sr=-1)
    with pytest.raises(ValueError, match="empty"):
        resample_audio(np.array([], dtype=np.float32), orig_sr=16000, target_sr=16000)


def test_slice_audio_exact_boundaries():
    """Slice 1000ms audio from 200ms to 500ms (300ms duration = 4800 samples at 16kHz)."""
    sr = 16000
    # 1000ms = 16000 samples
    audio = np.arange(16000, dtype=np.float32)
    sliced = slice_audio(audio, sr=sr, start_ms=200, end_ms=500)

    expected_len = int(round(300 * sr / 1000.0))
    assert len(sliced) == expected_len
    assert len(sliced) == 4800
    assert sliced[0] == 3200  # 200 * 16
    assert sliced[-1] == 7999  # 500 * 16 - 1


def test_slice_audio_boundary_guards():
    """Boundary conditions must raise appropriate ValueErrors."""
    audio = np.ones(16000, dtype=np.float32)
    sr = 16000

    # Negative start
    with pytest.raises(ValueError, match="non-negative"):
        slice_audio(audio, sr=sr, start_ms=-50, end_ms=500)

    # Inverted or equal start/end
    with pytest.raises(ValueError, match="greater than start_ms"):
        slice_audio(audio, sr=sr, start_ms=500, end_ms=500)
    with pytest.raises(ValueError, match="greater than start_ms"):
        slice_audio(audio, sr=sr, start_ms=600, end_ms=500)

    # Start exceeds audio duration
    with pytest.raises(ValueError, match="exceeds audio length"):
        slice_audio(audio, sr=sr, start_ms=2000, end_ms=3000)

    # Empty audio
    with pytest.raises(ValueError, match="empty"):
        slice_audio(np.array([], dtype=np.float32), sr=sr, start_ms=0, end_ms=100)


def test_slice_audio_clamps_end_to_length():
    """End beyond audio length should cleanly clamp to the audio end."""
    audio = np.ones(16000, dtype=np.float32)  # 1.0s = 1000ms
    sr = 16000
    sliced = slice_audio(audio, sr=sr, start_ms=500, end_ms=2000)
    # Clamps to remaining 500ms (8000 samples)
    assert len(sliced) == 8000


def test_validate_manifest_window_valid():
    """Valid window definition must pass without exception."""
    window = {
      "id": "gold-01",
      "videoId": "ylnxFdPhLCo",
      "startMs": 1000,
      "endMs": 3000,
      "durationMs": 2000,
      "sourceAsr": "テスト",
    }
    validate_manifest_window(window)


def test_validate_manifest_window_invalid():
    """Mismatched duration or missing fields must fail validation."""
    with pytest.raises(ValueError, match="missing required"):
        validate_manifest_window({"id": "gold-01"})

    with pytest.raises(ValueError, match="durationMs"):
        validate_manifest_window({
            "id": "gold-01",
            "videoId": "ylnxFdPhLCo",
            "startMs": 1000,
            "endMs": 3000,
            "durationMs": 5000,  # Mismatch: 3000 - 1000 = 2000 != 5000
            "sourceAsr": "テスト",
        })


def test_process_manifest_dry_run():
    """Dry run on testdata/audio-gold/manifest.json must validate all 20 windows."""
    manifest_path = Path("testdata/audio-gold/manifest.json")
    assert manifest_path.is_file(), "manifest.json must exist"

    stats = process_manifest(
        manifest_path=manifest_path,
        output_dir="testdata/audio-gold/wavs",
        cache_dir=".cache/audio",
        dry_run=True,
    )

    assert stats["totalWindows"] == 20
    assert stats["validWindows"] == 20
    assert stats["dryRun"] is True


def test_end_to_end_slice_and_io():
    """End-to-end synthetic audio test: create stereo 48kHz WAV, load, slice, export, read back."""
    sr_orig = 48000
    duration_s = 2.0
    num_samples = int(duration_s * sr_orig)

    # Synthetic stereo signal (frequency 440 Hz)
    t = np.linspace(0, duration_s, num_samples, endpoint=False, dtype=np.float32)
    left = 0.5 * np.sin(2 * np.pi * 440 * t)
    right = 0.5 * np.cos(2 * np.pi * 440 * t)
    stereo = np.column_stack([left, right])

    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir)
        source_wav = tmp_path / "synthetic_source.wav"
        sliced_wav = tmp_path / "slice_500_1500.wav"

        # 1. Write 48kHz stereo source
        sf.write(str(source_wav), stereo, sr_orig, subtype="PCM_16")

        # 2. Load and resample to 16kHz mono
        audio_16k, sr_loaded = load_audio(source_wav, target_sr=TARGET_SAMPLE_RATE)
        assert sr_loaded == 16000
        assert audio_16k.ndim == 1
        assert len(audio_16k) == int(duration_s * 16000)  # 32000 samples

        # 3. Slice 1000ms window (from 500ms to 1500ms)
        sliced = slice_audio(audio_16k, sr=sr_loaded, start_ms=500, end_ms=1500)
        assert len(sliced) == 16000  # exactly 1.0s at 16kHz

        # 4. Save sliced audio
        save_audio(sliced, sr_loaded, sliced_wav)
        assert sliced_wav.is_file()

        # 5. Read back from disk and verify WAV headers
        read_back, read_sr = sf.read(str(sliced_wav), dtype="float32")
        assert read_sr == 16000
        assert read_back.ndim == 1
        assert len(read_back) == 16000
        # Tolerances for 16-bit PCM quantization
        np.testing.assert_allclose(read_back, sliced, atol=1e-4)
