import re

def process(file_path):
    with open(file_path, "r") as f:
        content = f.read()

    # We want to replace all occurrences of `end = next ? next.start...` and `Math.min(end, next.start)` 
    # to simply trust `dur` and `durMs` when available.

    # 1. JSON3 loops
    # Look for:
    # if (n.durMs != null && Number.isFinite(n.durMs) && n.durMs > 0) {
    #   end = n.start + n.durMs / 1000;
    #   if (next) end = Math.min(end, next.start);
    # } else { ... }
    
    # We replace `if (next) end = Math.min(end, next.start);` with nothing.
    content = content.replace("if (next) end = Math.min(end, next.start);", "")
    content = content.replace("if (next) { end = Math.min(end, next.start); }", "")

    # 2. Legacy text nodes
    # const end = next ? next.start : n.start + Math.max(0.2, n.dur || 2);
    content = re.sub(
        r'const end = next \? next\.start : n\.start \+ Math\.max\(0\.2, n\.dur \|\| 2\);',
        r'''let end = next ? next.start : n.start + 2;
    if (n.dur != null && Number.isFinite(n.dur) && n.dur > 0) {
      end = n.start + n.dur;
    }''',
        content
    )

    # 3. YSD/VTT in content.js
    # let end = next ? next.start : n.durMs != null && Number.isFinite(n.durMs) && n.durMs > 0 ? n.start + n.durMs / 1000 : n.start + 2;
    content = re.sub(
        r'let end = next\s*\?\s*next\.start\s*:\s*n\.durMs != null && Number\.isFinite\(n\.durMs\) && n\.durMs > 0\s*\?\s*n\.start \+ n\.durMs / 1000\s*:\s*n\.start \+ 2;',
        r'''let end;
    if (n.durMs != null && Number.isFinite(n.durMs) && n.durMs > 0) {
      end = n.start + n.durMs / 1000;
    } else {
      end = next ? next.start : n.start + 2;
    }''',
        content
    )
    
    with open(file_path, "w") as f:
        f.write(content)

process("extension/background/service_worker.js")
process("extension/content/content.js")
process("extension/injected/page_capture.js")

