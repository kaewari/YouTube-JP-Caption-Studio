"""Local dictionary: SQLite backend (dict.sqlite) for JMdict (EN) + Yomitan JA→VI + Sino-Vietnamese Han-Viet."""

from __future__ import annotations

import json
import logging
import re
import sqlite3
import threading
import unicodedata
import xml.etree.ElementTree as ET
from pathlib import Path

from app.core.cache import dict_cache
from app.data.hanviet_data import get_hanviet_reading
from app.schemas.models import DictResponse, DictSense
from app.utils.text_utils import _kata_to_hira

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).resolve().parent.parent.parent.parent / "data" / "dict"
JMDICT_JSON = DATA_DIR / "jmdict_mini.json"
JAVI_JSON = DATA_DIR / "ja_vi.json"
JMDICT_VI_JSON = DATA_DIR / "jmdict_vi.json"
SQLITE_DB = DATA_DIR / "dict.sqlite"

RE_KANJI_KANA = re.compile(r"^([\u3400-\u9fff]+)([\u3040-\u309f]+)$")

_SEED_JA_VI: dict[str, list[str]] = {
    "あいつ": ["cô ta", "gã đó", "kẻ đó"],
    "あいつら": ["bọn chúng", "bọn chúng nó"],
    "ゴミ": ["rác"],
    "捨て場": ["bãi đổ", "nơi vứt"],
    "みたい": ["giống như", "như là"],
    "音楽": ["âm nhạc"],
    "島": ["đảo"],
    "池": ["ao", "hồ"],
    "熊": ["gấu"],
    "イノシシ": ["lợn rừng", "heo rừng"],
    "ええ": ["ừ", "vâng"],
    "じゃあ": ["thế thì", "vậy thì"],
    "確か": ["chắc là", "hình như"],
    "首輪": ["vòng cổ"],
    "目": ["mắt"],
    "切る": ["cắt"],
    "昔": ["xưa", "ngày trước"],
    "今日": ["hôm nay"],
    "投稿": ["đăng bài", "đăng tải"],
    "専門店": ["cửa hàng chuyên doanh", "tiệm chuyên"],
    "初": ["lần đầu", "đầu tiên"],
    "デート": ["buổi hẹn", "hẹn hò"],
    "なんか": ["kiểu như", "gì đó"],
    "これ": ["cái này", "đây"],
    "それ": ["cái đó", "đó"],
    "あれ": ["cái kia", "kia"],
    "なに": ["cái gì"],
    "何": ["cái gì", "bao nhiêu"],
    "うわ": ["ối", "ủa"],
    "私": ["tôi"],
    "僕": ["tôi", "tớ"],
    "俺": ["tao", "tôi"],
    "君": ["cậu", "bạn"],
    "あなた": ["bạn", "anh/chị"],
    "人": ["người"],
    "友達": ["bạn bè"],
    "先生": ["thầy/cô"],
    "学校": ["trường học"],
    "高校": ["trường cấp 3"],
    "授業": ["tiết học", "lớp học"],
    "宿題": ["bài tập về nhà"],
    "試験": ["kỳ thi"],
    "仕事": ["công việc"],
    "バイト": ["làm thêm"],
    "休み": ["nghỉ", "ngày nghỉ"],
    "休む": ["nghỉ"],
    "寝る": ["ngủ"],
    "起きる": ["thức dậy"],
    "食べる": ["ăn"],
    "飲む": ["uống"],
    "行く": ["đi"],
    "来る": ["đến"],
    "帰る": ["về"],
    "見る": ["nhìn", "xem"],
    "聞く": ["nghe", "hỏi"],
    "話す": ["nói"],
    "言う": ["nói"],
    "思う": ["nghĩ"],
    "知る": ["biết"],
    "分かる": ["hiểu"],
    "できる": ["làm được"],
    "する": ["làm", "làm việc"],
    "為る": ["làm"],
    "いる": ["có", "ở"],
    "居る": ["có", "ở"],
    "ある": ["có", "tồn tại"],
    "有る": ["có"],
    "在る": ["có", "ở tại"],
    "好き": ["thích"],
    "嫌い": ["ghét"],
    "楽しい": ["vui"],
    "嬉しい": ["vui mừng"],
    "悲しい": ["buồn"],
    "怖い": ["sợ"],
    "痛い": ["đau"],
    "忙しい": ["bận"],
    "疲れた": ["mệt"],
    "大丈夫": ["không sao", "ổn"],
    "本当": ["thật"],
    "絶対": ["chắc chắn", "tuyệt đối"],
    "多分": ["có lẽ"],
    "少し": ["một chút"],
    "沢山": ["nhiều"],
    "全部": ["tất cả"],
    "今": ["bây giờ"],
    "後": ["sau"],
    "前": ["trước"],
    "時": ["lúc", "giờ"],
    "日": ["ngày"],
    "月": ["tháng", "mặt trăng"],
    "年": ["năm"],
    "朝": ["buổi sáng"],
    "昼": ["buổi trưa"],
    "夜": ["buổi tối", "đêm"],
    "晩": ["buổi tối"],
    "家": ["nhà"],
    "部屋": ["phòng"],
    "電車": ["tàu điện"],
    "車": ["xe hơi"],
    "電話": ["điện thoại"],
    "写真": ["ảnh"],
    "動画": ["video"],
    "映画": ["phim"],
    "本": ["sách"],
    "お金": ["tiền"],
    "無料": ["miễn phí"],
    "最高": ["tuyệt nhất"],
    "最悪": ["tệ nhất"],
    "普通": ["bình thường"],
    "特別": ["đặc biệt"],
    "簡単": ["đơn giản"],
    "難しい": ["khó"],
    "早い": ["nhanh", "sớm"],
    "遅い": ["chậm", "muộn"],
    "大きい": ["to", "lớn"],
    "小さい": ["nhỏ"],
    "新しい": ["mới"],
    "古い": ["cũ"],
    "良い": ["tốt"],
    "いい": ["tốt", "được"],
    "悪い": ["xấu"],
    "同じ": ["giống"],
    "違う": ["khác"],
    "一緒": ["cùng nhau"],
    "自分": ["bản thân"],
    "世界": ["thế giới"],
    "人生": ["cuộc đời"],
    "気持ち": ["cảm xúc", "tâm trạng"],
    "気持ちいい": ["dễ chịu"],
    "やめる": ["dừng", "bỏ"],
    "始める": ["bắt đầu"],
    "終わる": ["kết thúc"],
    "待つ": ["đợi"],
    "手伝う": ["giúp"],
    "頑張る": ["cố gắng"],
    "ありがとう": ["cảm ơn"],
    "すみません": ["xin lỗi", "làm phiền"],
    "ごめん": ["xin lỗi"],
    "おはよう": ["chào buổi sáng"],
    "こんにちは": ["xin chào"],
    "こんばんは": ["chào buổi tối"],
    "さよなら": ["tạm biệt"],
    "はい": ["vâng", "ừ"],
    "いいえ": ["không"],
    "どうぞ": ["xin mời"],
    "お願いします": ["xin nhờ"],
    "口": ["miệng"],
    "顔": ["mặt"],
    "名前": ["tên"],
    "頭": ["đầu"],
    "手": ["tay"],
    "足": ["chân"],
    "耳": ["tai"],
    "声": ["giọng nói", "tiếng"],
    "心": ["tim", "tâm"],
    "兄": ["anh trai"],
    "姉": ["chị gái"],
    "弟": ["em trai"],
    "妹": ["em gái"],
    "父": ["bố", "cha"],
    "母": ["mẹ"],
    "夫": ["chồng"],
    "妻": ["vợ"],
    "子供": ["trẻ em", "con"],
    "男": ["nam", "đàn ông"],
    "女": ["nữ", "phụ nữ"],
    "家族": ["gia đình"],
    "会社": ["công ty"],
    "東京": ["Tokyo", "Đông Kinh"],
    "日本": ["Nhật Bản"],
    "左": ["trái"],
    "右": ["phải"],
    "東": ["đông"],
    "西": ["tây"],
    "南": ["nam"],
    "北": ["bắc"],
    "上": ["trên"],
    "下": ["dưới"],
    "中": ["trong", "giữa"],
    "外": ["ngoài"],
    "水": ["nước"],
    "火": ["lửa"],
    "山": ["núi"],
    "川": ["sông"],
    "海": ["biển"],
    "空": ["bầu trời", "trống"],
    "雨": ["mưa"],
    "雪": ["tuyết"],
    "花": ["hoa"],
    "木": ["cây"],
    "犬": ["chó"],
    "猫": ["mèo"],
    "時間": ["thời gian"],
    "明日": ["ngày mai"],
    "昨日": ["hôm qua"],
    "言葉": ["từ", "lời"],
    "意味": ["ý nghĩa"],
    "問題": ["vấn đề"],
    "質問": ["câu hỏi"],
    "答え": ["câu trả lời"],
    "学生": ["học sinh", "sinh viên"],
    "恋": ["tình yêu"],
    "愛": ["yêu", "tình yêu"],
    "夢": ["giấc mơ", "ước mơ"],
    "高い": ["cao", "đắt"],
    "安い": ["rẻ"],
    "長い": ["dài"],
    "短い": ["ngắn"],
    "近い": ["gần"],
    "遠い": ["xa"],
    "多い": ["nhiều"],
    "少ない": ["ít"],
    "強い": ["mạnh"],
    "弱い": ["yếu"],
    "買う": ["mua"],
    "売る": ["bán"],
    "作る": ["làm", "tạo"],
    "使う": ["dùng"],
    "持つ": ["cầm", "có"],
    "取る": ["lấy"],
    "置く": ["đặt"],
    "開く": ["mở"],
    "閉じる": ["đóng"],
    "入る": ["vào"],
    "出る": ["ra"],
    "歩く": ["đi bộ"],
    "走る": ["chạy"],
    "座る": ["ngồi"],
    "立つ": ["đứng"],
    "会う": ["gặp"],
    "呼ぶ": ["gọi"],
    "読む": ["đọc"],
    "書く": ["viết"],
    "教える": ["dạy"],
    "習う": ["học"],
    "覚える": ["nhớ", "học thuộc"],
    "忘れる": ["quên"],
    "考える": ["suy nghĩ"],
    "死ぬ": ["chết"],
    "生まれる": ["được sinh ra"],
    "生きる": ["sống"],
    "勉強": ["học tập", "học"],
    "日本語": ["tiếng Nhật"],
    "病院": ["bệnh viện"],
    "旅行": ["du lịch"],
    "天気": ["thời tiết"],
    "説明": ["giải thích", "thuyết minh"],
    "計画": ["kế hoạch"],
    "経験": ["kinh nghiệm"],
    "経済": ["kinh tế"],
    "政治": ["chính trị"],
    "社会": ["xã hội"],
    "文化": ["văn hóa"],
    "歴史": ["lịch sử"],
    "法律": ["pháp luật", "luật"],
    "環境": ["môi trường"],
    "関係": ["quan hệ", "liên quan"],
    "連絡": ["liên lạc"],
    "相談": ["thảo luận", "bàn bạc"],
    "準備": ["chuẩn bị"],
    "確認": ["xác nhận", "kiểm tra"],
    "成功": ["thành công"],
    "失敗": ["thất bại"],
    "必要": ["cần thiết"],
    "複雑": ["phức tạp"],
}

_PUNCT_STRIP = "。、.!?,！？「」『』（）()[]【】…・〜～『』「」〈〉《》""''\""
_PARTICLE_SUFFIXES = ("は", "が", "を", "に", "で", "と", "も", "へ", "や", "の", "か", "ね", "よ", "な", "さ")
_TAIL_PATTERNS = [
    re.compile(r"(てしまっ[たて]|てしま[うい]|ちゃっ[たて]|ちゃう|じゃっ[たて]|じゃう)$"),
    re.compile(r"(てる|でる|てた|でた|てます|でます|えています|でいます)$"),
    re.compile(r"(してる|してた|してます|しています|して|した|しない|しなかった)$"),
    re.compile(r"(られ[るた]|れ[るた]|させ[るた]|せ[るた])$"),
    re.compile(r"(なっ[たて]|なる|ない|なかった|なくて|なきゃ)$"),
    re.compile(r"(まし[たて]|ます|ません|ました|ましょう)$"),
    re.compile(r"(っ[たて]|[いう]$)"),
]

_local = threading.local()
_loaded = False


def _get_db() -> sqlite3.Connection | None:
    global _loaded
    conn = getattr(_local, "conn", None)
    if conn is not None:
        return conn
    if SQLITE_DB.is_file():
        try:
            conn = sqlite3.connect(f"file:{SQLITE_DB}?mode=ro", uri=True)
            _local.conn = conn
            _loaded = True
            return conn
        except Exception as exc:
            logger.warning("Failed opening dict.sqlite: %s", exc)
    return None


def is_loaded() -> bool:
    return _loaded or SQLITE_DB.is_file()


def close_dictionary() -> None:
    """Close the read-only SQLite handle so a rebuilt DB can be reopened."""
    global _loaded
    conn = getattr(_local, "conn", None)
    if conn is not None:
        try:
            conn.close()
        except Exception:
            pass
        _local.conn = None
    _loaded = False
    dict_cache.clear()


def load_dictionary() -> bool:
    """Ensure SQLite DB is ready (reopens after close_dictionary / rebuild)."""
    close_dictionary()
    conn = _get_db()
    if conn is not None:
        logger.info("Dictionary DB ready at %s", SQLITE_DB)
        return True
    return False


def import_jmdict_xml(xml_path: Path, max_entries: int = 0) -> int:
    """Index JMdict XML → jmdict_mini.json. max_entries=0 means no limit."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    index: dict[str, list[dict]] = {}
    count = 0
    for _event, elem in ET.iterparse(str(xml_path), events=("end",)):
        if elem.tag != "entry":
            continue
        kebs = [k.text for k in elem.findall("k_ele/keb") if k.text]
        rebs = [r.text for r in elem.findall("r_ele/reb") if r.text]
        senses = []
        for sense in elem.findall("sense"):
            glosses = [
                g.text
                for g in sense.findall("gloss")
                if g.text
                and g.get("{http://www.w3.org/XML/1998/namespace}lang", "eng") in (None, "eng")
            ]
            pos = [p.text for p in sense.findall("pos") if p.text]
            if glosses:
                senses.append(
                    {
                        "gloss_en": glosses,
                        "pos": pos,
                        "reading": rebs[0] if rebs else "",
                    }
                )
        if senses:
            entry = {"senses": senses, "reading": rebs[0] if rebs else ""}
            for key in kebs + rebs:
                index.setdefault(key, []).append(entry)
            count += 1
        elem.clear()
        if max_entries and count >= max_entries:
            break
    JMDICT_JSON.write_text(json.dumps(index, ensure_ascii=False), encoding="utf-8")
    logger.info("Wrote JMdict EN index entries=%d keys=%d → %s", count, len(index), JMDICT_JSON)
    return count


def _query_jmdict(key: str) -> list[dict]:
    conn = _get_db()
    if not conn:
        return []
    try:
        cur = conn.cursor()
        cur.execute("SELECT payload FROM jmdict WHERE expression = ?", (key,))
        row = cur.fetchone()
        if row and row[0]:
            return json.loads(row[0])
    except Exception as exc:
        logger.warning("SQLite jmdict query error for %s: %s", key, exc)
    return []


def _query_javi(key: str) -> list[str]:
    curated = list(_SEED_JA_VI.get(key) or [])
    if curated:
        return curated
    conn = _get_db()
    if not conn:
        return []
    try:
        cur = conn.cursor()
        cur.execute("SELECT glosses FROM javi WHERE expression = ?", (key,))
        row = cur.fetchone()
        if row and row[0]:
            return json.loads(row[0])
    except Exception as exc:
        logger.warning("SQLite javi query error for %s: %s", key, exc)
    return []


def _query_jmdict_vi(key: str) -> dict[str, list[str]]:
    conn = _get_db()
    if not conn:
        return {}
    out: dict[str, list[str]] = {}
    try:
        cur = conn.cursor()
        cur.execute("SELECT reading, glosses FROM jmdict_vi WHERE expression = ?", (key,))
        rows = cur.fetchall()
        for r_reading, r_glosses in rows:
            if r_glosses:
                out[str(r_reading or "")] = json.loads(r_glosses)
    except Exception as exc:
        logger.warning("SQLite jmdict_vi query error for %s: %s", key, exc)
    return out


def _query_hanviet(text: str) -> str:
    """Extract Sino-Vietnamese reading for Kanji characters in text."""
    if not text:
        return ""
    # Prefer in-memory hanviet dictionary table; fallback to SQLite kanji_hanviet if needed
    hv = get_hanviet_reading(text)
    if hv:
        return hv
    conn = _get_db()
    if not conn:
        return ""
    try:
        cur = conn.cursor()
        readings: list[str] = []
        for ch in text:
            cur.execute("SELECT hanviet FROM kanji_hanviet WHERE kanji = ?", (ch,))
            row = cur.fetchone()
            if row and row[0]:
                readings.append(row[0])
        return " ".join(readings)
    except Exception as exc:
        logger.warning("SQLite kanji_hanviet query error for %s: %s", text, exc)
    return ""


def _vi_glosses_for(key: str, reading: str = "") -> list[str]:
    """Curated seed/ja_vi first, then Yomitan VI JMDict (reading-aware). Clean without EN bridge."""
    for cand in _script_variants(key):
        curated = _query_javi(cand)
        if curated:
            return curated[:8]

    by_reading: dict[str, list[str]] = {}
    for cand in _script_variants(key):
        by_reading = _query_jmdict_vi(cand)
        if by_reading:
            break
    if not by_reading:
        return []
    reading = (reading or "").strip()
    if reading and reading in by_reading:
        return list(by_reading[reading])[:8]
    if reading:
        hira = _kata_to_hira(reading)
        if hira in by_reading:
            return list(by_reading[hira])[:8]
    if "" in by_reading:
        return list(by_reading[""])[:8]
    for glosses in by_reading.values():
        if glosses:
            return list(glosses)[:8]
    return []


def _enrich_senses_vi(senses: list[DictSense], key: str) -> list[DictSense]:
    """Fill empty gloss_vi from seed/jmdict_vi without broken EN-VI machine bridge."""
    out: list[DictSense] = []
    for sense in senses:
        vi = list(sense.gloss_vi or [])
        if not vi:
            vi = _vi_glosses_for(key, sense.reading or "")
        out.append(
            DictSense(
                gloss_en=list(sense.gloss_en or []),
                gloss_vi=vi,
                reading=sense.reading or "",
                pos=list(sense.pos or []),
            )
        )
    return out


def _nfkc(text: str) -> str:
    return unicodedata.normalize("NFKC", text or "").strip()


def _hira_to_kata(text: str) -> str:
    out = []
    for ch in text:
        code = ord(ch)
        if 0x3041 <= code <= 0x3096:
            out.append(chr(code + 0x60))
        else:
            out.append(ch)
    return "".join(out)


def _strip_punct(text: str) -> str:
    return text.strip(_PUNCT_STRIP).strip()


def _add_candidate(candidates: list[str], seen: set[str], value: str) -> None:
    v = _nfkc(value)
    if not v or v in seen:
        return
    seen.add(v)
    candidates.append(v)


def _script_variants(text: str) -> list[str]:
    out = [text]
    hira = _kata_to_hira(text)
    kata = _hira_to_kata(text)
    if hira != text:
        out.append(hira)
    if kata != text:
        out.append(kata)
    return out


def _stem_variants(text: str) -> list[str]:
    """Best-effort stems: drop particles / conjugation tails / trailing kana after kanji."""
    variants: list[str] = []
    t = text
    if len(t) > 1 and t[-1] in _PARTICLE_SUFFIXES:
        variants.append(t[:-1])
    for pat in _TAIL_PATTERNS:
        m = pat.search(t)
        if m and m.start() >= 1:
            variants.append(t[: m.start()])
    m = RE_KANJI_KANA.match(t)
    if m and len(m.group(1)) >= 1:
        variants.append(m.group(1))
        if m.group(2) and not m.group(2).endswith("る"):
            variants.append(m.group(1) + "る")
    return variants


def _senses_for_key(key: str) -> tuple[list[DictSense], str]:
    senses: list[DictSense] = []
    reading = ""
    for entry in _query_jmdict(key):
        reading = reading or entry.get("reading", "")
        for s in entry.get("senses", []):
            sense_reading = s.get("reading") or reading
            senses.append(
                DictSense(
                    gloss_en=s.get("gloss_en", []),
                    gloss_vi=_vi_glosses_for(key, sense_reading),
                    reading=sense_reading,
                    pos=s.get("pos", []),
                )
            )
    if not senses:
        vi = _vi_glosses_for(key, "")
        if vi:
            senses.append(DictSense(gloss_vi=vi, gloss_en=[], reading=reading))
        elif key in _SEED_JA_VI:
            senses.append(DictSense(gloss_vi=list(_SEED_JA_VI[key]), gloss_en=[], reading=reading))
    return senses, reading


def _has_key(key: str) -> bool:
    if key in _SEED_JA_VI:
        return True
    conn = _get_db()
    if not conn:
        return False
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT 1 FROM jmdict WHERE expression = ?
            UNION ALL
            SELECT 1 FROM javi WHERE expression = ?
            UNION ALL
            SELECT 1 FROM jmdict_vi WHERE expression = ?
            LIMIT 1
        """, (key, key, key))
        return cur.fetchone() is not None
    except Exception as exc:
        logger.warning("SQLite _has_key query error for %s: %s", key, exc)
    return False


def has_entry(key: str) -> bool:
    """Public: whether surface/lemma exists in JMdict or JA→VI seed."""
    k = (key or "").strip()
    if not k:
        return False
    return _has_key(k)


def _longest_prefix_match(text: str) -> str | None:
    t = text.strip()
    if not t:
        return None
    max_len = min(len(t), 16)
    for n in range(max_len, 0, -1):
        cand = t[:n]
        if _has_key(cand):
            return cand
        for alt in _script_variants(cand):
            if alt != cand and _has_key(alt):
                return alt
    return None


def _try_keys(keys: list[str]) -> tuple[list[DictSense], str, str]:
    for key in keys:
        senses, reading = _senses_for_key(key)
        if senses:
            return senses, reading, key
    return [], "", ""


def _greedy_context_combinations(surface: str, context_tokens: list[str]) -> list[str]:
    """Generate greedy multi-word idiom combinations from surrounding context tokens."""
    combos: list[str] = []
    if not context_tokens:
        return combos
    cleaned_tokens = [_strip_punct(_nfkc(t)) for t in context_tokens if _strip_punct(_nfkc(t))]
    s_clean = _strip_punct(_nfkc(surface))
    if not s_clean:
        return combos

    try:
        idx = cleaned_tokens.index(s_clean)
    except ValueError:
        idx = -1

    if idx >= 0:
        # Multi-token combinations starting at surface
        for end in range(min(len(cleaned_tokens), idx + 6), idx + 1, -1):
            phrase = "".join(cleaned_tokens[idx:end])
            if phrase and phrase != s_clean:
                combos.append(phrase)
    return combos


def _expand_candidates(
    surface: str,
    lemma: str,
    context_tokens: list[str] | None = None,
) -> list[str]:
    candidates: list[str] = []
    seen: set[str] = set()

    # 1. Greedy context token combinations (idioms/multi-word)
    if context_tokens:
        for combo in _greedy_context_combinations(surface, context_tokens):
            for v in _script_variants(combo):
                _add_candidate(candidates, seen, v)

    # 2. Surface and lemma variants
    for raw in (surface, lemma):
        base = _strip_punct(_nfkc(raw or ""))
        if not base:
            continue
        for v in _script_variants(base):
            _add_candidate(candidates, seen, v)
        for stem in _stem_variants(base):
            for v in _script_variants(stem):
                _add_candidate(candidates, seen, v)

    try:
        from app.services.tokenize_ja import is_loaded as tok_loaded, tokenize

        if tok_loaded() and surface:
            for tok in tokenize(_nfkc(surface)):
                for piece in (tok.lemma, tok.surface):
                    piece = _strip_punct(_nfkc(piece or ""))
                    if not piece or len(piece) > 24:
                        continue
                    for v in _script_variants(piece):
                        _add_candidate(candidates, seen, v)
    except Exception:
        pass

    return candidates


def lookup(
    surface: str,
    lemma: str = "",
    context_tokens: list[str] | None = None,
) -> DictResponse:
    raw = _nfkc(surface or "")
    if not raw:
        return DictResponse(surface=surface, found=False, message="empty")

    ctx_key = ",".join(context_tokens) if context_tokens else ""
    cache_key = f"{raw}|{_nfkc(lemma or '')}|{ctx_key}"
    cached = dict_cache.get(cache_key)
    if cached:
        return DictResponse(**cached)

    candidates = _expand_candidates(raw, lemma or "", context_tokens)
    candidates.sort(key=lambda s: (-len(s), s))

    matched = ""
    senses: list[DictSense] = []
    reading = ""

    senses, reading, matched = _try_keys(candidates)

    if not senses:
        best_pref = ""
        best_senses: list[DictSense] = []
        best_reading = ""
        for cand in candidates:
            pref = _longest_prefix_match(cand)
            if not pref:
                continue
            s, r = _senses_for_key(pref)
            if not s:
                for alt in _script_variants(pref):
                    s, r = _senses_for_key(alt)
                    if s:
                        pref = alt
                        break
            if s and len(pref) > len(best_pref):
                best_pref, best_senses, best_reading = pref, s, r
        if best_senses:
            senses, reading, matched = best_senses, best_reading, best_pref

    found = bool(senses)
    if found:
        senses = _enrich_senses_vi(senses, matched or raw)

    # Collect top unique VI glosses for fast access
    vi_all: list[str] = []
    seen_vi: set[str] = set()
    for s in senses:
        for g in s.gloss_vi:
            gk = g.strip()
            if gk and gk.casefold() not in seen_vi:
                seen_vi.add(gk.casefold())
                vi_all.append(gk)
    if not vi_all:
        for g in _vi_glosses_for(matched or raw, reading):
            gk = g.strip()
            if gk and gk.casefold() not in seen_vi:
                seen_vi.add(gk.casefold())
                vi_all.append(gk)

    hanviet = _query_hanviet(matched or raw)

    resp = DictResponse(
        surface=raw,
        matched=matched or raw,
        reading=reading,
        hanviet=hanviet,
        found=found,
        glosses_vi=vi_all,
        senses=senses,
        message="" if found else "không có trong từ điển",
    )
    if found or SQLITE_DB.is_file():
        dict_cache.set(cache_key, resp.model_dump())
    return resp


def lookup_word(
    surface: str,
    lemma: str = "",
    context_tokens: list[str] | None = None,
) -> DictResponse:
    """Alias for lookup."""
    return lookup(surface, lemma=lemma, context_tokens=context_tokens)

