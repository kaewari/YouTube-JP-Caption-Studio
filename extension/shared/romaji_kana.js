/**
 * Minimal romaji → hiragana for JA edit when OS IME stays on ABC.
 * Skips conversion during composition (real Japanese IME handles that).
 */
(function (root) {
  const DIGRAPHS = {
    kya: "きゃ",
    kyu: "きゅ",
    kyo: "きょ",
    gya: "ぎゃ",
    gyu: "ぎゅ",
    gyo: "ぎょ",
    sha: "しゃ",
    shu: "しゅ",
    sho: "しょ",
    sya: "しゃ",
    syu: "しゅ",
    syo: "しょ",
    ja: "じゃ",
    ju: "じゅ",
    jo: "じょ",
    jya: "じゃ",
    jyu: "じゅ",
    jyo: "じょ",
    cha: "ちゃ",
    chu: "ちゅ",
    cho: "ちょ",
    tya: "ちゃ",
    tyu: "ちゅ",
    tyo: "ちょ",
    nya: "にゃ",
    nyu: "にゅ",
    nyo: "にょ",
    hya: "ひゃ",
    hyu: "ひゅ",
    hyo: "ひょ",
    bya: "びゃ",
    byu: "びゅ",
    byo: "びょ",
    pya: "ぴゃ",
    pyu: "ぴゅ",
    pyo: "ぴょ",
    mya: "みゃ",
    myu: "みゅ",
    myo: "みょ",
    rya: "りゃ",
    ryu: "りゅ",
    ryo: "りょ",
    tsu: "つ",
    ttu: "っつ",
    tta: "った",
    tte: "って",
    tti: "っち",
    tto: "っと",
    shi: "し",
    chi: "ち",
    thi: "てぃ",
    dhi: "でぃ",
    twu: "とぅ",
    dwu: "どぅ",
  };

  const BASIC = {
    a: "あ",
    i: "い",
    u: "う",
    e: "え",
    o: "お",
    ka: "か",
    ki: "き",
    ku: "く",
    ke: "け",
    ko: "こ",
    ga: "が",
    gi: "ぎ",
    gu: "ぐ",
    ge: "げ",
    go: "ご",
    sa: "さ",
    si: "し",
    su: "す",
    se: "せ",
    so: "そ",
    za: "ざ",
    zi: "じ",
    zu: "ず",
    ze: "ぜ",
    zo: "ぞ",
    ta: "た",
    ti: "ち",
    tu: "つ",
    te: "て",
    to: "と",
    da: "だ",
    di: "ぢ",
    du: "づ",
    de: "で",
    do: "ど",
    na: "な",
    ni: "に",
    nu: "ぬ",
    ne: "ね",
    no: "の",
    ha: "は",
    hi: "ひ",
    hu: "ふ",
    fu: "ふ",
    he: "へ",
    ho: "ほ",
    ba: "ば",
    bi: "び",
    bu: "ぶ",
    be: "べ",
    bo: "ぼ",
    pa: "ぱ",
    pi: "ぴ",
    pu: "ぷ",
    pe: "ぺ",
    po: "ぽ",
    ma: "ま",
    mi: "み",
    mu: "む",
    me: "め",
    mo: "も",
    ya: "や",
    yu: "ゆ",
    yo: "よ",
    ra: "ら",
    ri: "り",
    ru: "る",
    re: "れ",
    ro: "ろ",
    wa: "わ",
    wi: "うぃ",
    we: "うぇ",
    wo: "を",
    nn: "ん",
    n: "ん",
    "-": "ー",
  };

  const DIGRAPH_KEYS = Object.keys(DIGRAPHS).sort((a, b) => b.length - a.length);
  const BASIC_KEYS = Object.keys(BASIC).sort((a, b) => b.length - a.length);

  function isRomajiChar(ch) {
    return /^[a-zA-Z\-]$/.test(ch);
  }

  /** Convert a romaji string to hiragana (greedy longest match). */
  function toHiragana(romaji) {
    let s = String(romaji || "").toLowerCase();
    let out = "";
    while (s.length) {
      // sokuon: kk → っ + k…
      if (s.length >= 2 && s[0] === s[1] && /[bcdfghjklmpqrstvwxyz]/.test(s[0]) && s[0] !== "n") {
        out += "っ";
        s = s.slice(1);
        continue;
      }
      let matched = false;
      for (const k of DIGRAPH_KEYS) {
        if (s.startsWith(k)) {
          out += DIGRAPHS[k];
          s = s.slice(k.length);
          matched = true;
          break;
        }
      }
      if (matched) continue;
      for (const k of BASIC_KEYS) {
        if (s.startsWith(k)) {
          // lone trailing "n" before vowel stays for next syllable — only emit ん
          // when followed by consonant/end, or "nn".
          if (k === "n" && s.length > 1 && /[aiueoy]/.test(s[1])) {
            break;
          }
          out += BASIC[k];
          s = s.slice(k.length);
          matched = true;
          break;
        }
      }
      if (matched) continue;
      out += s[0];
      s = s.slice(1);
    }
    return out;
  }

  /**
   * Replace trailing ASCII romaji run before cursor with hiragana.
   * @returns {{ value: string, cursor: number } | null}
   */
  function convertTrailingRomaji(value, cursor) {
    const v = String(value || "");
    let c = Math.max(0, Math.min(cursor == null ? v.length : cursor, v.length));
    let start = c;
    while (start > 0 && isRomajiChar(v[start - 1])) start -= 1;
    if (start === c) return null;
    const romaji = v.slice(start, c);
    const kana = toHiragana(romaji);
    if (kana === romaji) return null;
    // Keep incomplete trailing consonant (except n) for further typing.
    let keep = false;
    const m = romaji.match(/([bcdfghjklmpqrstvwxyz]+)$/i);
    if (m && !/^(n|nn)$/i.test(m[1]) && toHiragana(romaji.slice(0, -m[1].length)) + m[1].toLowerCase() === kana + m[1].toLowerCase()) {
      keep = true;
    }
    // If conversion left a trailing consonant that wasn't converted, ok.
    const next = v.slice(0, start) + kana + v.slice(c);
    const nextCursor = start + kana.length;
    if (next === v && nextCursor === c) return null;
    return { value: next, cursor: nextCursor };
  }

  root.HardsubRomajiKana = { toHiragana, convertTrailingRomaji };
})(typeof globalThis !== "undefined" ? globalThis : window);
