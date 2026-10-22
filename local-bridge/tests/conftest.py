from __future__ import annotations

import sys
from pathlib import Path
import pytest
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


@pytest.fixture(autouse=True)
def _isolated_errors_log(tmp_path: Path, monkeypatch):
    """The suite must not append to the real local-bridge/errors.log.

    Without this every test run pollutes the developer's log with fixture
    messages (the audit found hundreds of repeated lines).
    """
    from app.utils import logging_utils

    monkeypatch.setattr(logging_utils, "_ERRORS_LOG", tmp_path / "errors.log")


@pytest.fixture
def root(tmp_path: Path):
    with mock.patch("app.services.script_store.scripts_root", lambda: tmp_path):
        with mock.patch("app.services.script_store.SCRIPTS_DIR", tmp_path):
            yield tmp_path


@pytest.fixture
def tmp(tmp_path: Path) -> Path:
    return tmp_path
