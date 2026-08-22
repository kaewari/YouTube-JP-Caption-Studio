"""Smoke: bootstrap _download never leaves a truncated file at the final path.

Run from local-bridge:
  PYTHONPATH=. .venv/bin/python tests/test_bootstrap.py
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.scripts.bootstrap import _download  # noqa: E402


class FakeResp:
    def __init__(self, chunks, error_after=None):
        self._chunks = list(chunks)
        self._error_after = error_after
        self._sent = 0

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def read(self, size):
        if self._error_after is not None and self._sent >= self._error_after:
            raise OSError("connection dropped")
        if not self._chunks:
            return b""
        self._sent += 1
        return self._chunks.pop(0)


def test_interrupted_download_leaves_no_final_file(tmp: Path) -> None:
    dest = tmp / "JMdict_e.gz"
    with mock.patch("urllib.request.urlopen", return_value=FakeResp([b"partial", b"data"], error_after=1)):
        try:
            _download("https://example.invalid/x.gz", dest)
            raise AssertionError("download should have raised")
        except OSError:
            pass
    assert not dest.exists(), "interrupted download must not leave final file"
    assert not list(tmp.glob("*.part")), "no .part litter after failure"

    with mock.patch("urllib.request.urlopen", return_value=FakeResp([b"full", b"data"])):
        _download("https://example.invalid/x.gz", dest)
    assert dest.read_bytes() == b"fulldata", "retry after failure must succeed"


def main() -> None:
    with tempfile.TemporaryDirectory() as d:
        test_interrupted_download_leaves_no_final_file(Path(d))
    print("[test_bootstrap] ok")


if __name__ == "__main__":
    main()
