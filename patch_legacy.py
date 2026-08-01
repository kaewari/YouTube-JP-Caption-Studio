import re

files = [
    "extension/background/service_worker.js",
    "extension/content/content.js",
    "extension/injected/page_capture.js"
]

def patch_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # Find the loop for legacy xml parsing, which looks like:
    # for (let i = 0; i < textNodes.length; i += 1) {
    #   const n = textNodes[i];
    #   if (!n.text) continue;
    #   const next = textNodes[i + 1];
    #   const end = next ? next.start : n.start + Math.max(0.2, n.dur || 2);
    #   cues.push({ start: n.start, end: Math.max(n.start + 0.2, end), text: n.text });
    # }

    # or for `nodes`:
    # for (let i = 0; i < nodes.length; i += 1) { ... }
    
    # We will use regex to find and replace.
    content = re.sub(
        r'for \([^)]+\) {\s*const n = (nodes|textNodes)\[i\];\s*if \(\!n\.text\) continue;\s*const next = \1\[i \+ 1\];\s*const end =[^;]+;\s*cues\.push\([^)]+\);\s*\}',
        r'''for (let i = 0; i < \1.length; i += 1) {
    const n = \1[i];
    if (!n.text) continue;
    const next = \1[i + 1];
    let end;
    if (n.dur != null && Number.isFinite(n.dur) && n.dur > 0) {
      end = n.start + n.dur;
    } else {
      end = next ? next.start : n.start + Math.max(0.2, n.dur || 2);
    }
    cues.push({ start: n.start, end: Math.max(n.start + 0.2, end), text: n.text });
  }''',
        content
    )

    with open(filepath, 'w') as f:
        f.write(content)

for f in files:
    patch_file(f)

