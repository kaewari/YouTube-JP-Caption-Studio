"""Parity between the extension's TXT export parser and the bridge's port.

`parse_script_txt()` says in its docstring that it is "a port of extension
import_parse.parseExportTxt". Nothing checked that, so the two could drift and a
script imported through the bridge would not be what the extension exported.

This runs the real JavaScript parser in Node and compares it with the real Python
parser on the same fixtures.

Documented, intentional difference: the bridge materialises `end_media_time`
(missing end -> equal to start) because its wire model requires a float, while the
extension leaves it undefined and lets the cue-timing layer fill it. Only the
first four fields are compared, and that difference is asserted explicitly so it
cannot change silently.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

from app.services.script_store import parse_script_txt

ROOT = Path(__file__).resolve().parent.parent.parent
PARSER = ROOT / "extension" / "shared" / "import_parse.js"

FIXTURES = [
    "[1] 0:01 → 0:03\nJA: 日本語\nEN: Japanese\nVI: tiếng Nhật",
    "[1] 0:01 -> 0:03\nJA: あ\n[2] 0:05 - 0:06\nJA: い\n----------\n[3] 1:02:03 → 1:02:04\nJA: う",
    "[7] 0:00-0:02\nJA: きょう\nEN: today",
    "[1] 0.5 → 1.25\nJA: はんびょう\nVI: nửa giây",
    "[1] 0:01 → 0:02\nEN: no japanese line",
    "[1] 0:01 → 0:02\nJA: まえ\n\nJA: あと",
    "JA: だけあって時刻なし",
]

COMPARED_FIELDS = ("start_media_time", "source", "en", "vi")


def _node_parse(texts: list[str]) -> list[list[dict]]:
    node = shutil.which("node")
    if not node:
        pytest.skip("node is required to run the extension parser")
    script = (
        "const P = require(process.argv[1]);"
        "const cases = JSON.parse(process.argv[2]);"
        "process.stdout.write(JSON.stringify(cases.map((t) => P.parseExportTxt(t))));"
    )
    proc = subprocess.run(
        [node, "-e", script, str(PARSER), json.dumps(texts)],
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(proc.stdout)


def _normalise(rows: list[dict]) -> list[tuple]:
    out = []
    for row in rows:
        start = row.get("start_media_time")
        out.append(
            (
                None if start is None else round(float(start), 6),
                row.get("source") or "",
                row.get("en") or "",
                row.get("vi") or "",
            )
        )
    return out


def test_the_bridge_port_matches_the_extension_parser():
    js = _node_parse(FIXTURES)
    assert len(js) == len(FIXTURES)
    for text, js_rows in zip(FIXTURES, js):
        py_rows = parse_script_txt(text)
        assert _normalise(py_rows) == _normalise(js_rows), (
            f"parsers disagree for {text!r}:\n  bridge  {_normalise(py_rows)}\n  extension {_normalise(js_rows)}"
        )


def test_the_documented_end_time_difference_holds():
    """The bridge fills a missing end; the extension leaves it to CueTiming."""
    text = "[1] 0:01 → 0:02\nJA: あ\n----------\n[2] 0:05 → 0:06\nJA: い"
    js = _node_parse([text])[0]
    py = parse_script_txt(text)
    assert all("end_media_time" in row for row in py), py
    assert js[0].get("end_media_time") == 2, js
    # An end-less block: bridge materialises it, the extension does not.
    no_end = "[1] 0:07\nJA: う"
    js_no_end = _node_parse([no_end])[0]
    py_no_end = parse_script_txt(no_end)
    assert py_no_end[0]["end_media_time"] == pytest.approx(py_no_end[0]["start_media_time"])
    assert "end_media_time" not in js_no_end[0], js_no_end
