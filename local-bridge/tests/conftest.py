from __future__ import annotations

from pathlib import Path

import pytest

from app.services import script_store


@pytest.fixture
def root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setattr(script_store, "SCRIPTS_DIR", tmp_path)
    monkeypatch.setattr(script_store, "scripts_root", lambda: tmp_path)
    monkeypatch.setattr(script_store, "_DEVICE_ID_PATH", tmp_path / "device_id.txt")
    monkeypatch.setattr(script_store, "_device_id", "")
    return tmp_path


@pytest.fixture
def tmp(tmp_path: Path) -> Path:
    return tmp_path
