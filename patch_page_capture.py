import re

filepath = "extension/injected/page_capture.js"
with open(filepath, 'r') as f:
    content = f.read()

# Patch textCues loop
content = re.sub(
    r'for \(let i = 0; i < textNodes\.length; i \+= 1\) {\s*const n = textNodes\[i\];\s*if \(\!n\.text\) continue;\s*const next = textNodes\[i \+ 1\];\s*const end = next \? next\.start : n\.start \+ Math\.max\(0\.2, n\.dur \|\| 2\);\s*textCues\.push\(\{ start: n\.start, end: Math\.max\(n\.start \+ 0\.2, end\), text: n\.text \}\);\s*\}',
    r'''for (let i = 0; i < textNodes.length; i += 1) {
      const n = textNodes[i];
      if (!n.text) continue;
      const next = textNodes[i + 1];
      let end;
      if (n.dur != null && Number.isFinite(n.dur) && n.dur > 0) {
        end = n.start + n.dur;
      } else {
        end = next ? next.start : n.start + Math.max(0.2, n.dur || 2);
      }
      textCues.push({ start: n.start, end: Math.max(n.start + 0.2, end), text: n.text });
    }''',
    content
)

# Patch pNodes loop
content = re.sub(
    r'for \(let i = 0; i < pNodes\.length; i \+= 1\) {\s*const n = pNodes\[i\];\s*const next = pNodes\[i \+ 1\];\s*// YSD / VTT: end at next cue start[^\n]*\n\s*let end = next\s*\?\s*next\.start\s*:\s*n\.durMs[^:]+:\s*n\.start \+ 2;\s*cues\.push\(\{ start: n\.start, end: Math\.max\(n\.start \+ 0\.2, end\), text: n\.text \}\);\s*\}',
    r'''for (let i = 0; i < pNodes.length; i += 1) {
      const n = pNodes[i];
      let end;
      if (n.durMs != null && Number.isFinite(n.durMs) && n.durMs > 0) {
        end = n.start + n.durMs / 1000;
      } else {
        const next = pNodes[i + 1];
        end = next ? next.start : n.start + 2;
      }
      cues.push({ start: n.start, end: Math.max(n.start + 0.2, end), text: n.text });
    }''',
    content
)

# Patch JSON3 loop
content = re.sub(
    r'for \(let i = 0; i < nodes\.length; i \+= 1\) {\s*const n = nodes\[i\];\s*const next = nodes\[i \+ 1\];\s*let end;\s*if \(n\.durMs[^\}]+\} else \{\s*end = next \? next\.start : n\.start \+ 2;\s*\}\s*cues\.push\(\{ start: n\.start, end: Math\.max\(n\.start \+ 0\.2, end\), text: n\.text \}\);\s*\}',
    r'''for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i];
      let end;
      if (n.durMs != null && Number.isFinite(n.durMs) && n.durMs > 0) {
        end = n.start + n.durMs / 1000;
      } else {
        const next = nodes[i + 1];
        end = next ? next.start : n.start + 2;
      }
      cues.push({ start: n.start, end: Math.max(n.start + 0.2, end), text: n.text });
    }''',
    content
)


with open(filepath, 'w') as f:
    f.write(content)
