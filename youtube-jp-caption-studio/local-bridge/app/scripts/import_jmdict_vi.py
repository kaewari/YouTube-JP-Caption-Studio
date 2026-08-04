"""Import Yomitan JMdict (Vietnamese) zip → jmdict_vi.json index.

Source (local use only — do not redistribute the zip in-repo):
  https://github.com/dreamofi/yomichan-Vietnamese-dictionary
  vietnameseDict/jmdict_vietnamese.zip

Yomitan term bank v3 row:
  [expression, reading, defTags, rules, score, glossary, sequence, termTags]

The dreamofi zip mixes English JMdict senses with a FreeDict/ODVP Vietnamese dump.
We anchor on EN heads ({eat}, …) and keep only the first short VI clause so popup
glosses stay usable beside EN. Curated ja_vi / _SEED_JA_VI overrides for core vocab.
"""

from __future__ import annotations

import json
import logging
import re
import zipfile
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).resolve().parent.parent.parent.parent / "data" / "dict"
JMDICT_VI_JSON = DATA_DIR / "jmdict_vi.json"
JMDICT_VI_ZIP = DATA_DIR / "jmdict_vietnamese.zip"
JMDICT_VI_META = DATA_DIR / "jmdict_vi.meta.json"
INDEX_FORMAT = 6

# Minimum expression keys after a successful import (sanity check).
MIN_VI_KEYS = 10000

YOMITAN_VI_URL = (
    "https://raw.githubusercontent.com/dreamofi/yomichan-Vietnamese-dictionary/"
    "master/vietnameseDict/jmdict_vietnamese.zip"
)

_RE_VI_DIAC = re.compile(
    r"[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]",
    re.I,
)
_RE_SINO_DUMP = re.compile(
    r"^[\u3040-\u30ff\u3400-\u9fffぁ-んァ-ン]+"
    r"(?:\s+[A-ZÀÁẢÃẠĂÂĐÈÉẺẼẸÊÌÍỈĨỊÒÓỎÕỌÔƠÙÚỦŨỤƯỲÝỶỸỴ\[\]\.]+){1,12}$"
)
_RE_AT_HEAD = re.compile(r"^@[\u3040-\u30ff\u3400-\u9fff]+\s*")
_RE_BULLET = re.compile(r"^[-–•\\n\s]+")
_RE_LEADING_KANA = re.compile(r"^[\u3040-\u30ff\u3400-\u9fff]+\s+")
_RE_ALLCAPS_VI = re.compile(
    r"^[A-ZÀÁẢÃẠĂÂĐÈÉẺẼẸÊÌÍỈĨỊÒÓỎÕỌÔƠÙÚỦŨỤƯỲÝỶỸỴ]+"
    r"(?:\s+[A-ZÀÁẢÃẠĂÂĐÈÉẺẼẸÊÌÍỈĨỊÒÓỎÕỌÔƠÙÚỦŨỤƯỲÝỶỸỴ]+)*$"
)
_RE_META_HEAD = re.compile(
    r"^(từ mỹ|nghĩa mỹ|xem |thông tục|pháp lý|quân sự|thể dục|the )",
    re.I,
)
def _looks_english(s: str) -> bool:
    if _RE_VI_DIAC.search(s):
        return False
    letters = re.findall(r"[A-Za-z]", s)
    if len(letters) < 2:
        return False
    return all(ord(ch) < 128 or ch in "-'()., /" for ch in s) and bool(
        re.search(r"[A-Za-z]{2,}", s)
    )


def _en_heads_from_raw(raw_items: list[str]) -> list[str]:
    """First word of each English JMdict gloss (to eat → eat)."""
    heads: list[str] = []
    seen: set[str] = set()
    for raw in raw_items:
        if not isinstance(raw, str) or not _looks_english(raw) or len(raw) > 100:
            continue
        h = re.sub(r"^(to|a|an|the)\s+", "", raw.strip(), flags=re.I)
        h = re.sub(r"\s*\(.*$", "", h).strip().lower()
        words = re.findall(r"[a-z']+", h.lower())
        if not words:
            continue
        w = words[0]
        if w in seen or len(w) < 2:
            continue
        seen.add(w)
        heads.append(w)
    return heads


def _clean_vi_gloss(s: str) -> str | None:
    s = (s or "").strip()
    s = s.replace("\\n", " ").strip()
    s = _RE_BULLET.sub("", s).strip(" -\t;")
    if not s or len(s) < 2:
        return None
    if _RE_SINO_DUMP.match(s) or _RE_ALLCAPS_VI.match(s):
        return None
    if _RE_LEADING_KANA.match(s) and _RE_VI_DIAC.search(s):
        s = _RE_LEADING_KANA.sub("", s).strip()
    if _RE_SINO_DUMP.match(s) or _RE_ALLCAPS_VI.match(s):
        return None
    # Drop nested FreeDict junk: ((nghĩa đen)) / (for someone)
    prev = None
    while prev != s:
        prev = s
        s = re.sub(r"\s*\([^()]*\)", "", s)
    s = re.sub(r"\s+", " ", s).strip(" ;,-.\\)")
    if not s or len(s) < 2 or len(s) > 28:
        return None
    if _looks_english(s):
        return None
    if re.fullmatch(r"[\u3040-\u30ff\u3400-\u9fff\s]+", s):
        return None
    if s.startswith("(") or s.startswith("*") or _RE_META_HEAD.match(s):
        return None
    if not _RE_VI_DIAC.search(s):
        return None
    if not re.search(r"[a-zàáảãạăâèéẻẽẹêìíỉĩịòóỏõọôơùúủũụưỳýỷỹỵđ]", s):
        return None
    if re.match(r"^[a-zàáảãạăâđèéẻẽẹêìíỉĩịòóỏõọôơùúủũụưỳýỷỹỵ]{1,2}ười\b", s):
        return None
    if re.search(r"[.)\]…]{2,}|\.\.\.", s):
        return None
    return s


def _add_clause_glosses(
    segment: str, out: list[str], seen: set[str], *, limit: int = 3
) -> None:
    """Take only the first ODVP clause (before ';') — later clauses are unrelated senses."""
    clause = (segment or "").split(";")[0]
    for bit in clause.split(","):
        cleaned = _clean_vi_gloss(bit)
        if not cleaned:
            continue
        key = cleaned.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(cleaned)
        if len(out) >= limit:
            return


def _vi_glosses_from_raw(raw_items: list[str]) -> list[str]:
    """Extract short VI glosses anchored to EN JMdict senses when possible.

    dreamofi zip mixes EN senses with a FreeDict/ODVP dump. Prefer:
      {eat}, ăn; (garbage…)  →  ["ăn"]
    over scraping every diacritic fragment in the blob.
    """
    en_heads = _en_heads_from_raw(raw_items)
    vi_blobs: list[str] = []
    for raw in raw_items:
        if not isinstance(raw, str):
            continue
        if _RE_VI_DIAC.search(raw) or "{" in raw or raw.startswith("@"):
            vi_blobs.append(raw.replace("\r", "\n").replace("\\n", "\n"))
    text = "\n".join(vi_blobs)
    out: list[str] = []
    seen: set[str] = set()

    for head in en_heads:
        if out:
            break
        pat = re.compile(
            r"\{" + re.escape(head) + r"[^}]*\}\s*,?\s*([^\n\{]+)",
            re.I,
        )
        m = pat.search(text)
        if m:
            _add_clause_glosses(m.group(1), out, seen, limit=3)

    if len(out) < 2:
        for line in text.split("\n"):
            line = line.strip()
            if not (line.startswith("@") and _RE_VI_DIAC.search(line)):
                continue
            line = _RE_AT_HEAD.sub("", line).lstrip("- ").strip()
            _add_clause_glosses(line.replace(".", ","), out, seen, limit=3)
            if out:
                break

    if not out:
        m = re.search(r"\{[^}]+\}\s*,\s*([^\n\{]+)", text)
        if m and _RE_VI_DIAC.search(m.group(1)):
            _add_clause_glosses(m.group(1), out, seen, limit=3)

    return out[:5]


def _flatten_glossary_item(item: Any) -> list[str]:
    """Extract plain gloss strings from Yomitan glossary entries."""
    out: list[str] = []
    if item is None:
        return out
    if isinstance(item, str):
        s = item.strip()
        if s:
            out.append(s)
        return out
    if isinstance(item, (int, float, bool)):
        return out
    if isinstance(item, list):
        for x in item:
            out.extend(_flatten_glossary_item(x))
        return out
    if not isinstance(item, dict):
        return out

    t = item.get("type")
    if t == "text" and isinstance(item.get("text"), str):
        s = item["text"].strip()
        if s:
            out.append(s)
        return out
    if t == "structured-content":
        out.extend(_flatten_glossary_item(item.get("content")))
        return out
    for key in ("content", "text", "data", "value"):
        if key in item:
            out.extend(_flatten_glossary_item(item[key]))
    return out


def _merge_gloss_bucket(bucket: list[str], glosses: list[str]) -> None:
    seen = set(bucket)
    for g in glosses:
        if g not in seen:
            seen.add(g)
            bucket.append(g)


def _add_glosses(
    index: dict[str, dict[str, list[str]]],
    expression: str,
    reading: str,
    glosses: list[str],
) -> None:
    expr = (expression or "").strip()
    if not expr or not glosses:
        return
    reading = (reading or "").strip()
    by_reading = index.setdefault(expr, {})
    _merge_gloss_bucket(by_reading.setdefault(reading, []), glosses)
    if reading:
        _merge_gloss_bucket(by_reading.setdefault("", []), glosses)


def import_yomitan_vi_zip(zip_path: Path, out_path: Path | None = None) -> int:
    """Parse Yomitan zip → jmdict_vi.json. Returns number of expression keys with VI."""
    out_path = out_path or JMDICT_VI_JSON
    if not zip_path.exists():
        raise FileNotFoundError(f"missing zip: {zip_path}")

    index: dict[str, dict[str, list[str]]] = {}
    with zipfile.ZipFile(zip_path, "r") as zf:
        term_banks = sorted(
            n
            for n in zf.namelist()
            if Path(n).name.startswith("term_bank") and n.endswith(".json")
        )
        if not term_banks:
            raise ValueError(f"no term_bank_*.json in {zip_path}")
        for name in term_banks:
            raw = zf.read(name)
            try:
                rows = json.loads(raw.decode("utf-8"))
            except Exception as exc:
                logger.warning("Skip %s: %s", name, exc)
                continue
            if not isinstance(rows, list):
                continue
            for row in rows:
                if not isinstance(row, list) or len(row) < 6:
                    continue
                expression = str(row[0] or "")
                reading = str(row[1] or "")
                raw_glosses = _flatten_glossary_item(row[5])
                glosses = _vi_glosses_from_raw(raw_glosses)
                _add_glosses(index, expression, reading, glosses)

    index = {k: v for k, v in index.items() if any(v.values())}

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(index, ensure_ascii=False), encoding="utf-8")
    JMDICT_VI_META.write_text(
        json.dumps({"format": INDEX_FORMAT, "keys": len(index)}, ensure_ascii=False),
        encoding="utf-8",
    )
    logger.info("Wrote JMdict VI index keys=%d → %s", len(index), out_path)
    return len(index)


def _index_format_ok() -> bool:
    if not JMDICT_VI_META.exists() or not JMDICT_VI_JSON.exists():
        return False
    try:
        meta = json.loads(JMDICT_VI_META.read_text(encoding="utf-8"))
        return int(meta.get("format") or 0) >= INDEX_FORMAT
    except Exception:
        return False


def vi_index_key_count(path: Path | None = None) -> int:
    path = path or JMDICT_VI_JSON
    if not path.exists():
        return 0
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return len(data) if isinstance(data, dict) else 0
    except Exception:
        return 0


def ensure_jmdict_vi(
    *,
    zip_path: Path | None = None,
    out_path: Path | None = None,
    download_fn=None,
    min_keys: int = MIN_VI_KEYS,
    force: bool = False,
) -> int:
    """Download (if needed) and import VI JMDict. Returns key count."""
    zip_path = zip_path or JMDICT_VI_ZIP
    out_path = out_path or JMDICT_VI_JSON
    count = vi_index_key_count(out_path)
    if not force and _index_format_ok() and count >= min_keys:
        return count

    if not zip_path.exists():
        if download_fn is None:
            raise FileNotFoundError(f"missing {zip_path} and no download_fn")
        download_fn(YOMITAN_VI_URL, zip_path)

    n = import_yomitan_vi_zip(zip_path, out_path)
    if n < min_keys:
        logger.warning("JMdict VI index looks small: keys=%d (min=%d)", n, min_keys)
    return n


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    import urllib.request

    def _dl(url: str, dest: Path) -> None:
        dest.parent.mkdir(parents=True, exist_ok=True)
        print(f"Downloading {url} → {dest}")
        urllib.request.urlretrieve(url, dest)

    n = ensure_jmdict_vi(download_fn=_dl, force=True)
    print(f"jmdict_vi keys={n}")
