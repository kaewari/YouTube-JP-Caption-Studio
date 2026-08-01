with open('extension/content/content.js', 'r') as f:
    content = f.read()

bad_block = """      const n = nodes[i];
      let end;
      if (n.durMs != null && Number.isFinite(n.durMs) && n.durMs > 0) {
        end = n.start + n.durMs / 1000;
      } else {
        end = n.start + 2;
      }"""

good_block = """      const n = nodes[i];
      const next = nodes[i + 1];
      let end;
      if (n.durMs != null && Number.isFinite(n.durMs) && n.durMs > 0) {
        end = n.start + n.durMs / 1000;
      } else {
        end = next ? next.start : n.start + 2;
      }"""

content = content.replace(bad_block, good_block)

with open('extension/content/content.js', 'w') as f:
    f.write(content)
