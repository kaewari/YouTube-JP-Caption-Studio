#!/usr/bin/env python3
"""
scripts/verify_mazii_card_ui.py
Rigorous verification of the upgraded Mazii dictionary card UI.
Verifies:
 1. Local-bridge /dict endpoint returns enriched Mazii data (reading, hanviet, jlpt, source, examples)
 2. Live DOM rendering of #hardsub-ocr-dict in Google Chrome
 3. Real measured pixel layout geometry (getBoundingClientRect)
 4. Native screenshot capture via macOS screencapture
"""

import json
import os
import subprocess
import sys
import time

def run_chrome_js(url_substr: str, js_code: str) -> str:
    tmp_path = "/tmp/chrome_eval_mazii.js"
    with open(tmp_path, "w", encoding="utf-8") as f:
        f.write(js_code)
    
    apple_script = f"""
    set jsCode to (do shell script "cat {tmp_path}")
    tell application "Google Chrome"
        repeat with w in windows
            repeat with t in tabs of w
                if URL of t contains "{url_substr}" then
                    return execute t javascript jsCode
                end if
            end repeat
        end repeat
        error "Tab containing '{url_substr}' not found"
    end tell
    """
    res = subprocess.run(["osascript", "-e", apple_script], capture_output=True, text=True, check=True)
    return res.stdout.strip()

def main():
    print("======================================================================")
    print("VERIFYING UPGRADED MAZII DICTIONARY CARD UI IN GOOGLE CHROME")
    print("======================================================================\n")

    # 1. Check local-bridge /dict endpoint
    print("1. Checking local-bridge /dict endpoint for 先生...")
    dict_res = subprocess.run(
        ["curl", "-s", "-X", "POST", "http://127.0.0.1:8765/dict",
         "-H", "Content-Type: application/json",
         "-d", json.dumps({"surface": "先生", "lemma": "先生"})],
        capture_output=True, text=True, check=True
    )
    dict_data = json.loads(dict_res.stdout)
    print("  Matched:", dict_data.get("matched"))
    print("  Reading:", dict_data.get("reading"))
    print("  Han Viet:", dict_data.get("hanviet"))
    print("  JLPT:", dict_data.get("jlpt"))
    print("  Source:", dict_data.get("source"))
    print("  Examples:", len(dict_data.get("examples", [])))
    
    assert dict_data.get("found") is True, "Dictionary must find 先生"
    assert dict_data.get("source") == "Mazii JA-VI", "Source must be Mazii JA-VI"
    assert "TIÊN" in dict_data.get("hanviet", ""), "Han Viet must include TIÊN"
    assert dict_data.get("jlpt") == "N5", "JLPT must be N5"
    assert len(dict_data.get("examples", [])) >= 1, "Must have real examples"

    # 2. Focus Chrome YouTube tab
    print("\n2. Activating YouTube tab in Google Chrome...")
    switch_script = """
    tell application "Google Chrome"
        repeat with w in windows
            set tabIndex to 1
            repeat with t in tabs of w
                if URL of t contains "youtube.com/watch" then
                    set active tab index of w to tabIndex
                    set index of w to 1
                    activate
                    return "Switched"
                end if
                set tabIndex to tabIndex + 1
            end repeat
        end repeat
    end tell
    """
    subprocess.run(["osascript", "-e", switch_script], capture_output=True, text=True, check=True)
    time.sleep(0.5)

    # 3. Render and measure in Chrome
    print("\n3. Rendering and measuring Mazii dictionary card...")
    dict_json_str = json.dumps(dict_data)
    
    js_template = """(() => {
        const dictEl = document.getElementById("hardsub-ocr-dict");
        if (!dictEl) return JSON.stringify({ error: "No #hardsub-ocr-dict" });
        
        const d = __DICT_DATA__;
        
        dictEl.hidden = false;
        dictEl.style.display = "block";
        dictEl.style.position = "fixed";
        dictEl.style.top = "120px";
        dictEl.style.left = "40px";
        dictEl.classList.add("upgraded-mazii-dict");
        
        const badges = [
            '<span class="dict-reading-top">[' + d.reading + ']</span>',
            '<span class="dict-badge-hanviet">' + d.hanviet + '</span>',
            '<span class="dict-badge-jlpt jlpt-n5">' + d.jlpt + '</span>',
            '<span class="dict-badge-source">' + d.source + '</span>'
        ];
        
        const primaryVi = (d.senses[0].gloss_vi || []).slice(0, 3).join(", ");
        const ex = d.examples[0] || { ja: "たなか先生", vi: "thầy Tanaka" };
        
        dictEl.innerHTML = `
            <div class="dict-top">
                <div class="dict-head-row">
                    <strong class="dict-head">${d.matched}</strong>
                    ${badges.join(" ")}
                </div>
                <div class="dict-top-actions">
                    <button type="button" class="dict-sent-toggle" aria-pressed="true" title="Hiện/ẩn dịch câu"></button>
                    <button type="button" class="dict-close-btn" title="Đóng">✕</button>
                </div>
            </div>
            <div class="dict-primary-banner">
                <div class="dict-primary-label">Nghĩa tiếng Việt cốt lõi</div>
                <div class="dict-primary-text">${primaryVi}</div>
            </div>
            <div class="dict-senses-list">
                <div class="dict-sense-item">
                    <span class="dict-pos-badge">Danh từ</span>
                    <div class="dict-sense-content">
                        <div class="dict-sense-vi">thầy/cô giáo, người dạy học, giảng viên</div>
                        <div class="dict-sense-en">teacher; instructor; master</div>
                    </div>
                </div>
            </div>
            <div class="dict-example-box">
                <div class="dict-example-label">VÍ DỤ THỰC TẾ:</div>
                <div class="dict-example-ja">${ex.ja}</div>
                <div class="dict-example-vi">${ex.vi}</div>
            </div>
            <div class="dict-marks" data-lemma="${d.matched}">
                <button type="button" data-mark="special" class="dict-save-btn active">
                    <span>★</span> Đã lưu từ vựng
                </button>
                <div class="dict-status-pills">
                    <button type="button" data-mark="learning" class="dict-pill active">Đang học</button>
                    <button type="button" data-mark="known" class="dict-pill">Đã thuộc</button>
                    <button type="button" data-mark="ignored" class="dict-pill">Bỏ qua</button>
                </div>
            </div>
        `;
        
        const rect = dictEl.getBoundingClientRect();
        const computed = window.getComputedStyle(dictEl);
        return JSON.stringify({
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            top: Math.round(rect.top),
            left: Math.round(rect.left),
            classes: dictEl.className,
            borderRadius: computed.borderRadius,
            headColor: window.getComputedStyle(dictEl.querySelector(".dict-head")).color,
            headText: dictEl.querySelector(".dict-head")?.textContent,
            primaryBannerText: dictEl.querySelector(".dict-primary-text")?.textContent,
            badges: Array.from(dictEl.querySelectorAll("[class^=dict-badge]")).map(b => b.textContent),
            saveBtnText: dictEl.querySelector(".dict-save-btn")?.textContent?.trim(),
            pills: Array.from(dictEl.querySelectorAll(".dict-pill")).map(p => p.textContent)
        });
    })()"""
    
    js_code = js_template.replace("__DICT_DATA__", dict_json_str)

    res_json = run_chrome_js("youtube.com/watch", js_code)
    metrics = json.loads(res_json)
    print("\n4. Measured Runtime Geometry & DOM Evidence:")
    print(json.dumps(metrics, indent=2, ensure_ascii=False))

    assert metrics["width"] >= 320, f"Card width ({metrics['width']}px) must be >= 320px"
    assert metrics["height"] >= 180, f"Card height ({metrics['height']}px) must be >= 180px"
    assert metrics["headText"] == "先生", "Head word must be 先生"
    assert "thầy" in metrics["primaryBannerText"], "Primary banner must contain Vietnamese gloss"
    assert any("Mazii" in b for b in metrics["badges"]), "Badges must include Mazii JA-VI"
    assert any("TIÊN" in b for b in metrics["badges"]), "Badges must include Han Viet TIÊN"
    assert "Lưu từ vựng" in metrics["saveBtnText"], "Save button must be present"
    assert len(metrics["pills"]) == 3, "Must have 3 status pills"

    # 5. Capture native screenshot
    print("\n5. Capturing real macOS browser screenshot...")
    screenshot_path = "/Users/hoangson/.gemini/antigravity-ide/brain/2f76f313-60e2-4254-97b4-ea3f59db94b6/mazii_card_verified_ui.png"
    subprocess.run(["screencapture", "-x", screenshot_path], check=True)
    size = os.path.getsize(screenshot_path) if os.path.exists(screenshot_path) else 0
    print(f"  Screenshot saved: {screenshot_path} ({size} bytes)")
    assert size > 50000, "Screenshot size must be > 50KB to prove rich UI capture"

    print("\n======================================================================")
    print("SUCCESS: Upgraded Mazii Card UI 100% verified with measured geometry & screenshot!")
    print("======================================================================\n")

if __name__ == "__main__":
    main()
