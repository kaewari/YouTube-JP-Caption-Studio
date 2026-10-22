"""Check receipts collected from the production renderer in a real browser."""
import json
import sys

# This script checks receipts collected from the production renderer in a real
# browser, so it needs that JSON file as an argument.
if len(sys.argv) < 2:
    print('SKIP: sentence_bilingual_dom_sanity.py needs the receipts JSON file as argument')
    raise SystemExit(77)

rows = {row['id']: row for row in json.load(open(sys.argv[1], encoding='utf-8'))}
failures = []
check_ids = {'self', 'surprise', 'start', 'missing', 'unrelated', 'wish', 'gap', 'cluster', 'simple', 'range'}

def check(ok, message):
    print(('PASS ' if ok else 'FAIL ') + message)
    if not ok:
        failures.append(message)

def line(case, lang):
    return next(item for item in rows[case]['lines'] if item['lang'] == lang)

check(set(rows) == check_ids, 'all ten runtime cases present')
colors = {'n4': 'rgb(143, 211, 255)', 'n3': 'rgb(245, 215, 110)', 'n2': 'rgb(224, 138, 74)'}
for case, ja, vi, en, level in [
    ('self', '自分', 'Tôi', 'I', sys.argv[2] if len(sys.argv) > 2 else 'n4'),
    ('surprise', 'びっくり', 'ngạc nhiên', 'surprised', 'n3'),
    ('start', '始め', 'bắt đầu', 'start', 'n4'),
]:
    for lang, text in [('ja', ja), ('vi', vi), ('en', en)]:
        spans = [s for s in line(case, lang)['spans'] if s['text'] == text]
        check(len(spans) == 1 and 'jlpt-' + level in spans[0]['classes'].split(), f'{case}/{lang}: {text} inherits {level}')
        check(len(spans) == 1 and spans[0]['color'] == colors[level], f'{case}/{lang}: actual CSS color equals {colors[level]}')

for lang, text in [('vi', 'đơn giản'), ('en', 'simple')]:
    spans = [s for s in line('simple', lang)['spans'] if s['text'] == text and s['lemma'] == '単純']
    check(len(spans) == 1 and 'jlpt-n3' in spans[0]['classes'].split(), f'simple/{lang}: {text} inherits n3 from 単純')
    check(len(spans) == 1 and spans[0]['color'] == colors['n3'], f'simple/{lang}: actual CSS color equals {colors["n3"]}')

for case in ('missing', 'unrelated'):
    for lang in ('vi', 'en'):
        data = line(case, lang)
        check(not any('jlpt-' in s['classes'] for s in data['spans']), f'{case}/{lang}: unmapped words neutral')
        check(data['images'] == 0, f'{case}/{lang}: no executable image markup')
        if case == 'missing':
            check('<img src=x onerror=alert(1)>' in data['text'], f'{case}/{lang}: literal markup preserved')

check(not any(s['text'] in ('Chúc bạn có một', 'có một') for s in line('wish', 'vi')['spans']), 'wish: pronouns and auxiliaries are separate')
check(line('gap', 'ja')['text'] == '週 末', 'gap: exact source whitespace')
for lang, first, last in [('vi', 'đầu', 'cuối'), ('en', 'beginning', 'end')]:
    spans = line('range', lang)['spans']
    for text, lemma, level in [(first, '最初', 'n3'), (last, '最後', 'n4')]:
        matches = [s for s in spans if s['text'] == text and s['lemma'] == lemma]
        check(len(matches) == 1 and matches[0]['color'] == colors[level], f'range/{lang}: independent {lemma} {level} color')
    check(not any(s['text'] == line('range', lang)['text'] for s in spans), f'range/{lang}: no whole-clause span')
for row in rows.values():
    check(row['tokensUnchanged'] == 'true', f"{row['id']}: input tokens unchanged")
    check(all(l['bounds']['width'] > 0 and l['bounds']['height'] > 0 for l in row['lines']), f"{row['id']}: measured nonzero DOM bounds")

if len(sys.argv) > 3:
    before = {row['id']: row for row in json.load(open(sys.argv[3], encoding='utf-8'))}
    for lang in ('ja', 'vi', 'en'):
        old = next(l for l in before['self']['lines'] if l['lang'] == lang)
        new = line('self', lang)
        check(old['text'] == new['text'] and old['bounds'] == new['bounds'], f'self/{lang}: level-change preserves text and all measured pixel bounds')
        check(old['spans'][0]['color'] != new['spans'][0]['color'], f'self/{lang}: button changed actual CSS color')

print(f'{len(failures)} failure(s)')
sys.exit(bool(failures))
