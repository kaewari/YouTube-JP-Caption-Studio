import re
import os

files = [
    "extension/background/service_worker.js",
    "extension/content/content.js",
    "extension/injected/page_capture.js"
]

def patch_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # Patch parseJson3 loop
    content = re.sub(
        r'for \([^)]+\) {\s*const n = nodes\[i\];\s*const next = (nodes|textNodes|pNodes)\[i \+ 1\];[\s\S]*?cues\.push\(\{ start: n\.start, end: Math\.max[^}]+\}\);\s*\}',
        r'''for (let i = 0; i < \1.length; i += 1) {
    const n = \1[i];
    const next = \1[i + 1];
    let end;
    if (n.durMs != null && Number.isFinite(n.durMs) && n.durMs > 0) {
      end = n.start + n.durMs / 1000;
    } else if (n.dur != null && Number.isFinite(n.dur) && n.dur > 0) {
      end = n.start + n.dur;
    } else {
      end = next ? next.start : n.start + 2;
    }
    cues.push({ start: n.start, end: Math.max(n.start + 0.2, end), text: n.text });
  }''',
        content
    )

    with open(filepath, 'w') as f:
        f.write(content)

for f in files:
    patch_file(f)

