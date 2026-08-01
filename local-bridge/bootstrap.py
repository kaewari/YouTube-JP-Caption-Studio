"""Bootstrap dictionary + Sudachi (no MT / OCR models)."""

from __future__ import annotations

import logging
import ssl
import sys
import threading
import urllib.request
from pathlib import Path

from models import BootstrapProgress

logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
DICT = DATA / "dict"

# Prefer host with a matching TLS cert (ftp.edrdg.org presents www.edrdg.org).
JMDICT_GZ_URL = "https://www.edrdg.org/pub/Nihongo/JMdict_e.gz"
MIN_JMDICT_KEYS = 150000

_lock = threading.Lock()
_progress = BootstrapProgress(stage="idle", percent=0, message="Idle", done=False)
_running = False


def get_progress() -> BootstrapProgress:
    return _progress.model_copy()


def _set(stage: str, percent: float, message: str, done: bool = False) -> None:
    global _progress
    _progress = BootstrapProgress(stage=stage, percent=percent, message=message, done=done)


def _ssl_context() -> ssl.SSLContext:
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()


def _download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    ctx = _ssl_context()
    with urllib.request.urlopen(url, context=ctx, timeout=300) as resp, open(dest, "wb") as out:
        while True:
            chunk = resp.read(1024 * 1024)
            if not chunk:
                break
            out.write(chunk)


def bootstrap_async() -> None:
    global _running
    with _lock:
        if _running:
            return
        _running = True
    threading.Thread(target=_bootstrap_worker, daemon=True).start()


def _jmdict_key_count(jmdict_json: Path) -> int:
    if not jmdict_json.exists():
        return 0
    try:
        import json

        data = json.loads(jmdict_json.read_text(encoding="utf-8"))
        return len(data) if isinstance(data, dict) else 0
    except Exception:
        return 0


def _rebuild_sqlite() -> None:
    scripts = ROOT / "scripts"
    if str(scripts) not in sys.path:
        sys.path.insert(0, str(scripts))
    from build_dict_sqlite import build_sqlite

    build_sqlite()


def _bootstrap_worker() -> None:
    global _running
    try:
        DICT.mkdir(parents=True, exist_ok=True)

        _set("dict", 5, "Preparing dictionary seed")
        javi = DICT / "ja_vi.json"
        if not javi.exists():
            import json
            from dictionary import _SEED_JA_VI

            javi.write_text(json.dumps(_SEED_JA_VI, ensure_ascii=False, indent=2), encoding="utf-8")

        jmdict_json = DICT / "jmdict_mini.json"
        xml_path = DICT / "JMdict_e.xml"
        gz = DICT / "JMdict_e.gz"

        # Truncated mini (~40k entries / ~80k keys) misses common JA; prefer full index.
        need_jmdict = _jmdict_key_count(jmdict_json) < MIN_JMDICT_KEYS
        jmdict_error: str | None = None
        if need_jmdict:
            _set("dict", 15, "Downloading / indexing JMdict (full)")
            try:
                import gzip
                import shutil as sh

                if not xml_path.exists():
                    if not gz.exists():
                        _download(JMDICT_GZ_URL, gz)
                    with gzip.open(gz, "rb") as f_in, open(xml_path, "wb") as f_out:
                        sh.copyfileobj(f_in, f_out)
                _set("dict", 40, "Indexing full JMdict")
                from dictionary import import_jmdict_xml

                n = import_jmdict_xml(xml_path, max_entries=0)
                _set("dict", 55, f"Indexed {n} JMdict entries")
            except Exception as exc:
                jmdict_error = str(exc)
                logger.warning("JMdict download/index failed: %s", exc)

        # Yomitan JMdict Vietnamese (JA→VI) — parallel glosses with EN JMdict.
        _set("dict", 58, "Downloading / indexing JMdict Vietnamese")
        try:
            from import_jmdict_vi import ensure_jmdict_vi

            n_vi = ensure_jmdict_vi(download_fn=_download)
            _set("dict", 65, f"Indexed {n_vi} JMdict VI keys")
        except Exception as exc:
            logger.warning("JMdict VI download/index skipped: %s", exc)

        # VNEDICT (VI→EN inverted) — fill gloss_vi from gloss_en when JA→VI misses.
        _set("dict", 66, "Indexing EN→VI (VNEDICT)")
        try:
            from import_en_vi import ensure_en_vi

            n_en = ensure_en_vi(download_fn=_download)
            _set("dict", 68, f"Indexed {n_en} EN→VI keys")
        except Exception as exc:
            logger.warning("EN→VI (VNEDICT) download/index skipped: %s", exc)

        keys = _jmdict_key_count(jmdict_json)
        if keys < MIN_JMDICT_KEYS:
            msg = (
                f"JMdict incomplete ({keys} keys, need ≥{MIN_JMDICT_KEYS})"
                + (f": {jmdict_error}" if jmdict_error else "")
            )
            logger.error(msg)
            _set("error", 100, msg, done=True)
            return

        _set("dict", 72, "Building dict.sqlite")
        try:
            _rebuild_sqlite()
        except Exception as exc:
            logger.exception("SQLite rebuild failed")
            _set("error", 100, f"SQLite rebuild failed: {exc}", done=True)
            return

        _set("sudachi", 85, "Loading Sudachi + dictionary")
        from dictionary import load_dictionary
        from tokenize_ja import load_tokenizer
        from vocab_freq import load_freq

        load_dictionary()
        load_freq()
        load_tokenizer()

        _set("done", 100, "Bootstrap complete", done=True)
    except Exception as exc:
        logger.exception("Bootstrap failed")
        _set("error", 100, f"Bootstrap failed: {exc}", done=True)
    finally:
        with _lock:
            _running = False
