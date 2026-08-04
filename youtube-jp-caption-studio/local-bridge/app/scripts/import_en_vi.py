"""Import VNEDICT (VI→EN) → inverted en_vi.json for JMdict gloss bridging.

Source (CC BY 3.0 — attribute Paul Denisowski / www.denisowski.org):
  http://www.denisowski.org/Vietnamese/vnedict.txt

When JA→VI (seed / Yomitan) misses, dictionary lookup maps gloss_en lemmas
through this index. Not machine translation.
"""

from __future__ import annotations

import json
import logging
import re
import zipfile
from pathlib import Path
from typing import Callable

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).resolve().parent.parent.parent.parent / "data" / "dict"
EN_VI_JSON = DATA_DIR / "en_vi.json"
EN_VI_META = DATA_DIR / "en_vi.meta.json"
VNEDICT_TXT = DATA_DIR / "vnedict.txt"
VNEDICT_ZIP = DATA_DIR / "vnedict-v4.zip"
INDEX_FORMAT = 2
MIN_EN_KEYS = 5000

VNEDICT_TXT_URL = "http://www.denisowski.org/Vietnamese/vnedict.txt"
VNEDICT_ZIP_URL = (
    "https://raw.githubusercontent.com/thu-tram/viet-yomitan/"
    "main/dictionaries/vnedict-v4.zip"
)

_RE_WORD = re.compile(r"[a-zA-Z']+")
_RE_SENSE_SPLIT = re.compile(r"\s*;\s*|\s*\(\d+\)\s*")
_RE_VI_DIAC = re.compile(
    r"[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]",
    re.I,
)


def _sense_clauses(en_def: str) -> list[str]:
    """Split VNEDICT English side into sense clauses."""
    s = (en_def or "").strip()
    if not s:
        return []
    parts = _RE_SENSE_SPLIT.split(s)
    return [p.strip().strip(",.") for p in parts if p and p.strip().strip(",.")]


def _en_lemmas_from_clause(clause: str) -> list[str]:
    """Extract EN lookup keys from one sense clause."""
    out: list[str] = []
    seen: set[str] = set()
    part = re.sub(r"\([^)]*\)", " ", clause or "")
    part = re.sub(r"\s+", " ", part).strip()
    part = re.sub(r"^(to|a|an|the)\s+", "", part, flags=re.I)
    chunks = [c.strip() for c in re.split(r"[,/]", part) if c.strip()]
    for chunk in chunks or [part]:
        chunk = re.sub(r"^(to|a|an|the)\s+", "", chunk, flags=re.I)
        words = _RE_WORD.findall(chunk.lower())
        if not words:
            continue
        if words[0] in {"see", "cf", "also", "etc", "eg", "ie", "abbr", "syn"}:
            continue
        for key in (words[0], " ".join(words[:2]) if len(words) >= 2 else ""):
            if not key or key in seen or len(key) < 2:
                continue
            seen.add(key)
            out.append(key)
    return out


def _clean_vi_head(vi: str) -> str | None:
    vi = (vi or "").strip()
    if not vi or vi.startswith("#"):
        return None
    vi = re.sub(r"\s+", " ", vi).strip()
    if len(vi) < 1 or len(vi) > 40:
        return None
    if not _RE_VI_DIAC.search(vi) and not re.fullmatch(r"[A-Za-zÀ-ỹđĐ' \-]+", vi):
        return None
    return vi


def _add_mapping(
    index: dict[str, list[tuple]],
    en_key: str,
    vi: str,
    *,
    primary: bool,
) -> None:
    """Store (score_tuple, vi); lower score is better."""
    diac = 0 if _RE_VI_DIAC.search(vi) else 1
    score = (
        0 if primary else 1,
        diac,
        len(vi.split()),
        len(vi),
        vi.casefold(),
    )
    bucket = index.setdefault(en_key, [])
    for i, (old_score, old_vi) in enumerate(bucket):
        if old_vi == vi:
            if score < old_score:
                bucket[i] = (score, vi)
            return
    bucket.append((score, vi))


def _finalize_index(raw_index: dict[str, list[tuple]]) -> dict[str, list[str]]:
    index: dict[str, list[str]] = {}
    for en_key, scored in raw_index.items():
        scored.sort(key=lambda x: x[0])
        out: list[str] = []
        seen: set[str] = set()
        for _score, vi in scored:
            k = vi.casefold()
            if k in seen:
                continue
            seen.add(k)
            out.append(vi)
            if len(out) >= 8:
                break
        index[en_key] = out
    return index


def _index_entry(raw_index: dict[str, list[tuple]], vi: str, en_raw: str) -> None:
    for clause in _sense_clauses(en_raw):
        lemmas = _en_lemmas_from_clause(clause)
        if not lemmas:
            continue
        primary_lemma = lemmas[0]
        for en_key in lemmas:
            _add_mapping(raw_index, en_key, vi, primary=(en_key == primary_lemma))


def parse_vnedict_text(text: str) -> dict[str, list[str]]:
    """Parse VNEDICT UTF-8 text → en_lemma → [vi, …]."""
    raw_index: dict[str, list[tuple]] = {}
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if " : " in line:
            vi_raw, en_raw = line.split(" : ", 1)
        elif ":" in line:
            vi_raw, en_raw = line.split(":", 1)
        else:
            continue
        vi = _clean_vi_head(vi_raw)
        if not vi:
            continue
        _index_entry(raw_index, vi, en_raw)
    return _finalize_index(raw_index)


def parse_vnedict_yomitan_zip(zip_path: Path) -> dict[str, list[str]]:
    """Fallback: Yomitan VI→EN term banks (expression=VI, glossary=EN)."""
    raw_index: dict[str, list[tuple]] = {}
    with zipfile.ZipFile(zip_path, "r") as zf:
        banks = sorted(
            n
            for n in zf.namelist()
            if Path(n).name.startswith("term_bank") and n.endswith(".json")
        )
        for name in banks:
            try:
                rows = json.loads(zf.read(name).decode("utf-8"))
            except Exception as exc:
                logger.warning("Skip %s: %s", name, exc)
                continue
            if not isinstance(rows, list):
                continue
            for row in rows:
                if not isinstance(row, list) or len(row) < 6:
                    continue
                vi = _clean_vi_head(str(row[0] or ""))
                if not vi:
                    continue
                gloss_bits: list[str] = []
                g = row[5]
                if isinstance(g, str):
                    gloss_bits.append(g)
                elif isinstance(g, list):
                    for item in g:
                        if isinstance(item, str):
                            gloss_bits.append(item)
                        elif isinstance(item, dict) and isinstance(item.get("text"), str):
                            gloss_bits.append(item["text"])
                _index_entry(raw_index, vi, " ; ".join(gloss_bits))
    return _finalize_index(raw_index)


def import_vnedict(
    *,
    txt_path: Path | None = None,
    zip_path: Path | None = None,
    out_path: Path | None = None,
) -> int:
    """Build en_vi.json from local VNEDICT text (preferred) or Yomitan zip."""
    txt_path = txt_path or VNEDICT_TXT
    zip_path = zip_path or VNEDICT_ZIP
    out_path = out_path or EN_VI_JSON

    if txt_path.exists():
        index = parse_vnedict_text(txt_path.read_text(encoding="utf-8-sig"))
        source = "vnedict.txt"
    elif zip_path.exists():
        index = parse_vnedict_yomitan_zip(zip_path)
        source = "vnedict-yomitan.zip"
    else:
        raise FileNotFoundError(f"missing {txt_path} and {zip_path}")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(index, ensure_ascii=False), encoding="utf-8")
    EN_VI_META.write_text(
        json.dumps(
            {"format": INDEX_FORMAT, "keys": len(index), "source": source},
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    logger.info("Wrote EN→VI index keys=%d source=%s → %s", len(index), source, out_path)
    return len(index)


def _index_format_ok() -> bool:
    if not EN_VI_META.exists() or not EN_VI_JSON.exists():
        return False
    try:
        meta = json.loads(EN_VI_META.read_text(encoding="utf-8"))
        return int(meta.get("format") or 0) >= INDEX_FORMAT
    except Exception:
        return False


def en_vi_key_count(path: Path | None = None) -> int:
    path = path or EN_VI_JSON
    if not path.exists():
        return 0
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return len(data) if isinstance(data, dict) else 0
    except Exception:
        return 0


def ensure_en_vi(
    *,
    txt_path: Path | None = None,
    zip_path: Path | None = None,
    out_path: Path | None = None,
    download_fn: Callable[[str, Path], None] | None = None,
    min_keys: int = MIN_EN_KEYS,
    force: bool = False,
) -> int:
    """Download (if needed) and import VNEDICT → en_vi.json. Returns key count."""
    txt_path = txt_path or VNEDICT_TXT
    zip_path = zip_path or VNEDICT_ZIP
    out_path = out_path or EN_VI_JSON
    count = en_vi_key_count(out_path)
    if not force and _index_format_ok() and count >= min_keys:
        return count

    if not txt_path.exists() and not zip_path.exists():
        if download_fn is None:
            raise FileNotFoundError(f"missing {txt_path}/{zip_path} and no download_fn")
        try:
            download_fn(VNEDICT_TXT_URL, txt_path)
        except Exception as exc:
            logger.warning("VNEDICT txt download failed (%s); trying Yomitan zip", exc)
            download_fn(VNEDICT_ZIP_URL, zip_path)

    n = import_vnedict(txt_path=txt_path, zip_path=zip_path, out_path=out_path)
    if n < min_keys:
        logger.warning("EN→VI index looks small: keys=%d (min=%d)", n, min_keys)
    return n


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    import urllib.request

    def _dl(url: str, dest: Path) -> None:
        dest.parent.mkdir(parents=True, exist_ok=True)
        print(f"Downloading {url} → {dest}")
        urllib.request.urlretrieve(url, dest)

    n = ensure_en_vi(download_fn=_dl, force=True)
    print(f"en_vi keys={n}")
    data = json.loads(EN_VI_JSON.read_text(encoding="utf-8"))
    for k in ("eat", "mouth", "do", "tokyo", "name", "face"):
        print(k, "→", data.get(k, [])[:5])
