"""Pin agreement between the two curated JLPT band maps.

The bridge (`_COMMON_JLPT_WORDS` in `app/services/vocab_freq.py`) and the extension
(`COMMON_JLPT_WORDS` in `extension/shared/vocab_style.js`) are separate lists.
Nothing compared them, so one side could re-band a word and the other would keep
painting the old band.

The test loads the extension's real map in Node and asserts that every bridge key
also present in the extension map carries the same band. Keys that exist on only
one side are reported, not asserted: today's count is 60 bridge keys, 53 shared,
0 mismatches, and the 7 bridge-only keys stay a documented (not enforced) gap.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

from app.services.vocab_freq import _COMMON_JLPT_WORDS

ROOT = Path(__file__).resolve().parent.parent.parent
PARSER = ROOT / "extension" / "shared" / "vocab_style.js"

# Bridge-only today: 日本, にほん, 何, なに, なん, チョコ, チョコレート.
# They resolve through the extension's bilingual/de-inflection layers instead of
# its curated map; adding them there is a product decision, not this test's job.
KNOWN_BRIDGE_ONLY = {"日本", "にほん", "何", "なに", "なん", "チョコ", "チョコレート"}


def _extension_map() -> dict[str, str]:
    node = shutil.which("node")
    if not node:
        pytest.skip("node is required to read the extension map")
    script = (
        "require(process.argv[1]);"
        "process.stdout.write(JSON.stringify(globalThis.HardsubVocab.COMMON_JLPT_WORDS));"
    )
    proc = subprocess.run(
        [node, "-e", script, str(PARSER)], capture_output=True, text=True, check=True
    )
    return json.loads(proc.stdout)


def test_curated_bands_agree_on_shared_keys():
    ext = _extension_map()
    shared = [k for k in _COMMON_JLPT_WORDS if k in ext]
    assert len(shared) >= 50, f"the overlap collapsed to {len(shared)}"
    mismatches = [
        (k, _COMMON_JLPT_WORDS[k], ext[k]) for k in shared if _COMMON_JLPT_WORDS[k] != ext[k]
    ]
    assert mismatches == [], f"band drift on {len(mismatches)} words: {mismatches[:8]}"


def test_bridge_only_keys_stay_documented():
    ext = _extension_map()
    bridge_only = {k for k in _COMMON_JLPT_WORDS if k not in ext}
    assert bridge_only == KNOWN_BRIDGE_ONLY, (
        f"bridge-only set changed: added={sorted(bridge_only - KNOWN_BRIDGE_ONLY)} "
        f"removed={sorted(KNOWN_BRIDGE_ONLY - bridge_only)}"
    )


def test_every_extension_curated_key_resolves_identically():
    """Reverse direction: the bridge must honor the shared curated table.

    The extension's map is the source of truth (see _COMMON_JLPT_WORDS header);
    this locks the unification so a future dataset/freq change cannot silently
    re-band a curated word.
    """
    from app.services.vocab_freq import jlpt_of

    ext = _extension_map()
    assert len(ext) >= 400, f"extension map collapsed to {len(ext)}"
    bad = [
        (key, band, jlpt_of(None, lemma=key, reading="", surface=key))
        for key, band in ext.items()
        if jlpt_of(None, lemma=key, reading="", surface=key) != band
    ]
    assert bad == [], f"{len(bad)} curated words re-banded by dataset/freq: {bad[:8]}"
