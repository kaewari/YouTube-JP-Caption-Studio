"""PASS: post-import token enrich keeps EN/VI and fills reading + jlpt/freq.

Simulates import replace (locked EN/VI, empty tokens) then /tokenize_batch.
Run from the repository root: cd local-bridge && python3 tests/test_tokenize_import_enrich.py
Requires bridge on 127.0.0.1:8765.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

BRIDGE = os.environ.get("BRIDGE_URL", "http://127.0.0.1:8765").rstrip("/")
KANJI_RE = __import__("re").compile(r"[\u3400-\u9fff]")


def post(path: str, body: dict) -> dict:
    req = urllib.request.Request(
        f"{BRIDGE}{path}",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        if resp.status != 200:
            raise RuntimeError(f"POST {path} returned HTTP {resp.status}")
        print(f"HTTP {resp.status} POST {path}")
        return json.loads(resp.read().decode("utf-8"))


def get(path: str) -> dict:
    with urllib.request.urlopen(f"{BRIDGE}{path}", timeout=5) as resp:
        if resp.status != 200:
            raise RuntimeError(f"GET {path} returned HTTP {resp.status}")
        print(f"HTTP {resp.status} GET {path}")
        return json.loads(resp.read().decode("utf-8"))


def tokens_need_enrich(cue: dict) -> bool:
    toks = cue.get("tokens") or []
    if not toks:
        return True
    return "freq_rank" not in toks[0]


def simulate_import_replace(rows: list[dict]) -> list[dict]:
    """Mirror extension importCuesReplace: lock EN/VI, keep file tokens or []."""
    out = []
    for row in rows:
        en = str(row.get("en") or "")
        vi = str(row.get("vi") or "")
        has_mt = bool(en.strip() or vi.strip())
        source = str(row.get("source") or row.get("text") or "")
        tokens = list(row.get("tokens") or []) if has_mt else []
        cue = {
            "id": str(row.get("id") or f"c{len(out)}"),
            "source": source,
            "en": en if has_mt else "",
            "vi": vi if has_mt else "",
            "tokens": tokens,
            "translated": bool(has_mt),
            "mt_locked": False,
            "translation_source": "",
        }
        if has_mt:
            cue["mt_locked"] = True
            cue["translation_source"] = "import"
        out.append(cue)
    return out


def enrich_after_import(cues: list[dict]) -> int:
    """Mirror enrichTokensAfterImport via /tokenize_batch (fallback /tokenize)."""
    targets = [c for c in cues if (c.get("source") or "").strip() and tokens_need_enrich(c)]
    if not targets:
        return 0
    snaps = {
        c["id"]: {
            "en": c["en"],
            "vi": c["vi"],
            "mt_locked": c["mt_locked"],
            "translation_source": c["translation_source"],
            "source": c["source"],
        }
        for c in targets
    }
    try:
        data = post(
            "/tokenize_batch",
            {"cues": [{"id": c["id"], "text": c["source"]} for c in targets]},
        )
        results = data.get("results") or []
    except urllib.error.HTTPError as exc:
        if exc.code != 404:
            raise
        results = []
        for c in targets:
            one = post("/tokenize", {"text": c["source"]})
            results.append({"id": c["id"], "tokens": one.get("tokens") or []})

    wrote = 0
    by_id = {c["id"]: c for c in cues}
    for d in results:
        tid = d.get("id")
        target = by_id.get(tid)
        snap = snaps.get(tid)
        if not target or not snap:
            continue
        toks = d.get("tokens") or []
        if not toks:
            continue
        target["tokens"] = toks
        target["en"] = snap["en"]
        target["vi"] = snap["vi"]
        target["mt_locked"] = snap["mt_locked"]
        target["translation_source"] = snap["translation_source"]
        wrote += 1
    return wrote


def assert_pass(cues: list[dict], original: list[dict]) -> None:
    for c, orig in zip(cues, original):
        assert c["en"] == orig["en"], f"EN changed for {c['id']}: {c['en']!r} vs {orig['en']!r}"
        assert c["vi"] == orig["vi"], f"VI changed for {c['id']}"
        assert c["mt_locked"] is True
        assert c["translation_source"] == "import"
        assert c["tokens"], f"empty tokens for {c['id']}"
        assert "freq_rank" in c["tokens"][0], f"missing freq_rank on {c['id']}"
        # At least one kanji token should carry a reading when source has kanji.
        if KANJI_RE.search(c["source"]):
            with_reading = [
                t for t in c["tokens"] if KANJI_RE.search(t.get("surface") or "") and (t.get("reading") or "").strip()
            ]
            assert with_reading, f"no kanji readings for {c['id']}: {c['tokens']}"
        # jlpt used by HardsubVocab (n5…n1 or null → level-unknown)
        for t in c["tokens"]:
            jlpt = t.get("jlpt")
            assert jlpt is None or jlpt in ("n5", "n4", "n3", "n2", "n1"), jlpt


def main() -> int:
    # Verify readiness, then exercise the lazy tokenizer before checking health again.
    try:
        health = get("/health")
        if health.get("ready") is not True:
            print("FAIL: bridge health is not ready")
            return 1
        probe = post("/tokenize", {"text": "日本語"})
        if not probe.get("tokens"):
            print("FAIL: tokenize returned empty")
            return 1
        health = get("/health")
    except Exception as exc:
        if isinstance(exc, urllib.error.HTTPError):
            body = exc.read().decode("utf-8", errors="replace")
            print(f"FAIL: bridge HTTP {exc.code}: {body}")
        else:
            print(f"FAIL: bridge request at {BRIDGE}: {exc}")
        return 1
    if not health.get("models_loaded", {}).get("sudachi"):
        print("FAIL: tokenize endpoint did not load sudachi")
        return 1

    sample = [
        {
            "id": "imp1",
            "source": "日本語を勉強する",
            "en": "I study Japanese",
            "vi": "Tôi học tiếng Nhật",
        },
        {
            "id": "imp2",
            "source": "今日は良い天気です",
            "en": "The weather is nice today",
            "vi": "Hôm nay thời tiết đẹp",
        },
    ]
    cues = simulate_import_replace(sample)
    assert all(tokens_need_enrich(c) for c in cues), "import should leave tokens empty"
    original = [{"en": c["en"], "vi": c["vi"]} for c in cues]

    n = enrich_after_import(cues)
    if n < len(cues):
        print(f"FAIL: enriched {n}/{len(cues)}")
        return 1
    assert_pass(cues, original)

    # Idempotent: second enrich should no-op
    n2 = enrich_after_import(cues)
    assert n2 == 0, f"second enrich wrote {n2}"

    print("PASS: import enrich → tokens with reading+jlpt/freq; EN/VI locked unchanged")
    for c in cues:
        sample_tok = next(
            (t for t in c["tokens"] if (t.get("reading") or "").strip()),
            c["tokens"][0],
        )
        print(
            f"  {c['id']}: {len(c['tokens'])} toks "
            f"e.g. {sample_tok.get('surface')}({sample_tok.get('reading')}) "
            f"jlpt={sample_tok.get('jlpt')} freq={sample_tok.get('freq_rank')}"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
