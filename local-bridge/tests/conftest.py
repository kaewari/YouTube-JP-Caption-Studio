import tempfile
from pathlib import Path
import pytest
from unittest import mock

@pytest.fixture
def tmp():
    with tempfile.TemporaryDirectory() as d:
        yield Path(d)

@pytest.fixture
def root(tmp_path):
    root_path = Path(tmp_path)
    with mock.patch("app.services.script_store.scripts_root", lambda: root_path):
        with mock.patch("app.services.script_store.SCRIPTS_DIR", root_path):
            yield root_path
