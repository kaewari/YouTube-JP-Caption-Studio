from __future__ import annotations

import sys
from pathlib import Path
import pytest

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


from unittest import mock


@pytest.fixture
def root(tmp_path: Path):
    with mock.patch("app.services.script_store.scripts_root", lambda: tmp_path):
        with mock.patch("app.services.script_store.SCRIPTS_DIR", tmp_path):
            yield tmp_path


@pytest.fixture
def tmp(tmp_path: Path) -> Path:
    return tmp_path
