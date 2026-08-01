# Adversarial Challenge Report — Extension & Frontend Empirical Verifier

## Challenge Summary

**Overall risk assessment**: MEDIUM

## Challenges

### [Medium] Challenge 1: `escapeHtml()` does not escape double quotes (`"`) or single quotes (`'`), causing Attribute Injection XSS in `sidepanel.js`

- **Assumption challenged**: `escapeHtml()` safely sanitizes strings inserted into HTML contexts and attribute values.
- **Attack scenario**: `escapeHtml(s)` in `sidepanel.js` (line 172), `content.js` (line 1850), and `vocab_style.js` (line 238) only replaces `&`, `<`, and `>`. In `sidepanel.js` (lines 940 & 942), cue start/end time values are interpolated inside double-quoted HTML attributes:
  ```html
  <input class="sp-t-start" type="text" inputmode="decimal" spellcheck="false" value="${escapeHtml(t0)}" aria-label="Start" />
  ```
  An input string such as `" onfocus="alert(1)` is rendered as:
  ```html
  <input class="sp-t-start" type="text" inputmode="decimal" spellcheck="false" value="" onfocus="alert(1)" aria-label="Start" />
  ```
  This allows breaking out of the `value` attribute and injecting arbitrary event handlers into the Chrome Extension sidepanel DOM.
- **Blast radius**: Extension sidepanel DOM context (`chrome-extension://`). Malicious timing strings or cue metadata from untrusted video subtitle sources can execute script inside the sidepanel extension context.
- **Mitigation**: Update `escapeHtml(s)` across all extension files to escape quotes:
  ```javascript
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  ```
  Alternatively, use `escapeAttr(s)` for attribute values or assign DOM element properties directly (e.g. `input.value = t0`).

### [Low] Challenge 2: `escapeAttr()` does not escape single quotes (`'`)

- **Assumption challenged**: `escapeAttr()` is sufficient for escaping attribute strings regardless of attribute quoting syntax.
- **Attack scenario**: `escapeAttr(s)` in `sidepanel.js` and `content.js` only appends `.replace(/"/g, "&quot;")`. If any HTML template literal uses single quotes for attribute values (e.g., `data-surface='${escapeAttr(val)}'`), an attacker string containing `'` breaks out of the attribute.
- **Blast radius**: Extension sidepanel and content script overlay DOM rendering.
- **Mitigation**: Update `escapeAttr` to also replace single quotes (`.replace(/'/g, "&#39;")`).

## Stress Test Results

| Test Scenario | Payload | Expected / Standard Safe Output | Actual Output | Verdict |
|---|---|---|---|---|
| Script Tag XSS | `<script>alert(1)</script>` | `&lt;script&gt;alert(1)&lt;/script&gt;` | `&lt;script&gt;alert(1)&lt;/script&gt;` | **PASS** |
| Image OnError XSS | `<img src=x onerror=alert(1)>` | `&lt;img src=x onerror=alert(1)&gt;` | `&lt;img src=x onerror=alert(1)&gt;` | **PASS** |
| SVG OnLoad XSS | `<svg onload=alert(1)>` | `&lt;svg onload=alert(1)&gt;` | `&lt;svg onload=alert(1)&gt;` | **PASS** |
| Double Quote Breakout | `" onfocus="alert(1)` | `&quot; onfocus=&quot;alert(1)` | `" onfocus="alert(1)` | **FAIL** (Vulnerability) |
| Single Quote Breakout | `' onfocus='alert(1)` | `&#39; onfocus=&#39;alert(1)` | `' onfocus='alert(1)` | **FAIL** (Defect) |
| Special Characters Suite | `&<>"'` | `&amp;&lt;&gt;&quot;&#39;` | `&amp;&lt;&gt;"'` | **FAIL** (Unescaped quotes) |
| Manifest MV3 Validation | `extension/manifest.json` | Valid MV3 schema, valid JSON | Manifest v3, 100% valid schema | **PASS** |
| Manifest File References | 10 referenced resources | All files exist on disk | 10/10 files exist and non-empty | **PASS** |
| Frontend Typecheck | `web/saved-items` | `tsc --noEmit` succeeds | Exit code 0, 0 TS errors | **PASS** |
| Extension Frontend Build | `npm run build:extension` | Next.js static build succeeds | Build succeeds (1583ms), bundle copied to `extension/popup` | **PASS** |

## Unchallenged Areas

- Chrome extension background service worker runtime network behavior with live Chrome browser — requires active Chrome browser instance and connected native messaging host server.
