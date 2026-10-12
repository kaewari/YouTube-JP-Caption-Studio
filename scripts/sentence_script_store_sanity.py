"""Real HTTP -> production route/store -> disposable disk; no production writes."""
import json
import select
import signal
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'local-bridge'))
from fastapi import FastAPI
import uvicorn
from app.api.scripts import router
from app.services import script_store
from app.utils import logging_utils

for clock in (0, 1e-12, 1.0131, 1.0353, 1.234, 59.9999, 60.00000000000001, 333.36, 1e30, 1e300):
    assert script_store._parse_time_token(script_store._format_time_plain(clock)) == clock, clock

if len(sys.argv) == 3 and sys.argv[1] == '--serve':
    root = Path(sys.argv[2])
    script_store.SCRIPTS_DIR = root / 'subtitles'
    script_store._DEVICE_ID_PATH = root / 'device_id.txt'
    script_store._device_id = ''
    logging_utils._ERRORS_LOG = root / 'errors.log'
    app = FastAPI()
    app.include_router(router)
    sock = socket.socket()
    sock.bind(('127.0.0.1', 0))
    print(f'http://127.0.0.1:{sock.getsockname()[1]}', flush=True)
    server = uvicorn.Server(uvicorn.Config(app, log_level='error'))
    signal.signal(signal.SIGTERM, lambda *_: setattr(server, 'should_exit', True))
    server.run(sockets=[sock])
    sock.close()
    sys.exit(0)

with tempfile.TemporaryDirectory(prefix='sentence-store-') as directory:
    root = Path(directory)
    process = None
    def start_server():
        global process
        process = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), '--serve', directory],
                                   stdout=subprocess.PIPE, text=True)
        assert select.select([process.stdout], [], [], 5)[0], 'Child server did not publish address'
        address = process.stdout.readline().strip()
        assert address.startswith('http://127.0.0.1:'), address
        deadline = time.monotonic() + 5
        while True:
            assert process.poll() is None and time.monotonic() < deadline, 'HTTP server failed to start'
            try:
                with urllib.request.urlopen(address + '/scripts/unknown01', timeout=1) as response:
                    assert response.status == 200 and not json.load(response)['found']
                return address
            except urllib.error.URLError:
                time.sleep(.01)
    def stop_server():
        process.terminate()
        assert process.wait(timeout=5) == 0, 'Child server did not shut down cleanly'
        process.stdout.close()
    try:
        address = start_server()
        def request(path, body=None, method=None):
            req = urllib.request.Request(address + path, data=None if body is None else json.dumps(body).encode(),
                                         headers={'Content-Type': 'application/json'}, method=method)
            try:
                with urllib.request.urlopen(req, timeout=5) as response:
                    return response.status, json.load(response)
            except urllib.error.HTTPError as error:
                return error.code, json.load(error)
        cue = {'id': 'source-a', 'source': 'どこ行くんですか?', 'start_media_time': 1.234,
               'end_media_time': 4.789, 'vi': 'Bạn đi đâu?', 'en': '', 'mt_locked': True,
               'text_source': 'edit', 'translation_source': 'user'}
        status, saved = request('/scripts/save', {'video_id': 'fixture01', 'owned': True, 'rev': 2, 'cues': [cue]})
        assert status == 200 and saved['rev'] == 3, (status, saved)
        disk = json.loads((root / 'subtitles/fixture01/cues.json').read_text())
        assert disk['cues'][0]['start_media_time'] == cue['start_media_time']
        status, loaded = request('/scripts/fixture01')
        actual = loaded['cues'][0]
        print(json.dumps({'http': status, 'savedClocks': [cue['start_media_time'], cue['end_media_time']],
                          'loadedClocks': [actual['start_media_time'], actual['end_media_time']]}, ensure_ascii=False), flush=True)
        assert status == 200 and loaded['found']
        for field in ('id', 'source', 'vi', 'en', 'start_media_time', 'end_media_time', 'text_source', 'mt_locked', 'translation_source'):
            assert actual[field] == cue[field], (field, actual[field], cue[field])
        assert loaded['meta']['owned'] and loaded['meta']['rev'] == saved['rev'], loaded['meta']
        folder = root / 'subtitles/fixture01'
        before_stale = {p.name: p.read_bytes() for p in folder.iterdir()}
        status, stale = request('/scripts/save', {'video_id': 'fixture01', 'owned': False,
                                                'rev': 2, 'cues': []})
        print(json.dumps({'staleSaveHTTP': status, 'response': stale}), flush=True)
        assert status == 409, (status, stale)
        assert stale['detail']['current_rev'] == saved['rev']
        assert {p.name: p.read_bytes() for p in folder.iterdir()} == before_stale
        print('PASS: stale HTTP409 leaves all four script files byte-identical, including owned cue/locks/tokens/clocks')
        status, mirror = request('/scripts/fixture01/files')
        assert status == 200, (status, mirror)
        mirror_before = {p.name: p.read_bytes() for p in folder.iterdir()}
        malformed = {**mirror['files'], 'cues.json': json.dumps({'cues': []}), 'meta.json': '{broken'}
        status, rejected = request('/scripts/fixture01/files', {'files': malformed})
        changed = [p.name for p in folder.iterdir() if p.read_bytes() != mirror_before[p.name]]
        print(json.dumps({'malformedMirrorHTTP': status, 'response': rejected,
                          'changedFiles': changed}), flush=True)
        assert status == 400, (status, rejected)
        assert not changed, f'Rejected mirror modified disk: {changed}'
        status, imported = request('/scripts/fixture01/files', {'files': mirror['files']})
        assert status == 200 and imported['written'] == list(script_store.FILE_NAMES), (status, imported)
        status, roundtrip = request('/scripts/fixture01/files')
        assert status == 200 and roundtrip['files'] == mirror['files'], (status, roundtrip)
        print('PASS: malformed later mirror JSON returns HTTP400 without changing any script bytes; valid mirror HTTP200 round-trip retains all three files')
        status, old_mirror = request('/scripts/fixture06/files')
        assert status == 404, (status, old_mirror)
        status, mirror_initial = request('/scripts/save', {'video_id': 'fixture06', 'owned': True,
                                                         'rev': 4, 'cues': [cue]})
        assert status == 200 and mirror_initial['rev'] == 5
        status, old_mirror = request('/scripts/fixture06/files')
        assert status == 200, (status, old_mirror)
        newer_cue = {**cue, 'vi': 'Chỉnh sửa mới hơn của người dùng'}
        status, newer = request('/scripts/save', {'video_id': 'fixture06', 'owned': True,
                                                'rev': 5, 'cues': [newer_cue]})
        assert status == 200 and newer['rev'] == 6
        mirror_folder = root / 'subtitles/fixture06'
        before_old_mirror = {p.name: p.read_bytes() for p in mirror_folder.iterdir()}
        status, old_rejected = request('/scripts/fixture06/files', {'files': old_mirror['files']})
        changed = [p.name for p in mirror_folder.iterdir() if p.read_bytes() != before_old_mirror[p.name]]
        print(json.dumps({'staleMirrorHTTP': status, 'response': old_rejected,
                          'changedFiles': changed}), flush=True)
        assert status == 409 and old_rejected['detail']['current_rev'] == 6, (status, old_rejected)
        assert not changed, f'Stale mirror changed protected rev6: {changed}'
        print('PASS: stale mirror revision5 cannot overwrite revision6; actual HTTP409 leaves all four protected script files byte-identical')
        collision_files = dict(old_mirror['files'])
        collision_meta = json.loads(collision_files['meta.json'])
        collision_meta.update({'rev': 6, 'deviceId': 'other-device'})
        collision_files['meta.json'] = json.dumps(collision_meta)
        collision_cues = json.loads(collision_files['cues.json'])
        collision_cues['meta'] = collision_meta
        collision_files['cues.json'] = json.dumps(collision_cues)
        status, collision = request('/scripts/fixture06/files', {'files': collision_files})
        collision_changed = [p.name for p in mirror_folder.iterdir()
                             if p.read_bytes() != before_old_mirror[p.name]]
        print(json.dumps({'sameRevisionCollisionHTTP': status, 'response': collision,
                          'changedFiles': collision_changed}), flush=True)
        assert status == 409 and collision['detail']['current_rev'] == 6, (status, collision)
        assert {p.name: p.read_bytes() for p in mirror_folder.iterdir()} == before_old_mirror
        print('PASS: distinct two-device mirrors at revision6 return HTTP409 and keep protected local edit bytes exact')
        for invalid_rev in (-1, True, 6.5, "6", [], {}):
            invalid_files = {**old_mirror['files'], 'meta.json': json.dumps({'rev': invalid_rev})}
            status, rejected_rev = request('/scripts/fixture06/files', {'files': invalid_files})
            assert status == 400, (invalid_rev, status, rejected_rev)
            assert {p.name: p.read_bytes() for p in mirror_folder.iterdir()} == before_old_mirror
        status, current_bundle = request('/scripts/fixture06/files')
        assert status == 200
        status, same_rev = request('/scripts/fixture06/files', {'files': current_bundle['files']})
        assert status == 200 and same_rev['written'] == list(script_store.FILE_NAMES)
        assert {p.name: p.read_bytes() for p in mirror_folder.iterdir()} == before_old_mirror
        status, exact_partial = request('/scripts/fixture06/files',
                                        {'files': {'meta.json': current_bundle['files']['meta.json']}})
        assert status == 200 and exact_partial['written'] == ['meta.json']
        assert {p.name: p.read_bytes() for p in mirror_folder.iterdir()} == before_old_mirror
        for name in script_store.FILE_NAMES:
            divergent = dict(current_bundle['files'])
            if name == 'script.txt':
                divergent[name] += '\n# another device edit\n'
            else:
                value = json.loads(divergent[name])
                if name == 'meta.json':
                    value['title'] = 'another device title'
                else:
                    value['cues'][0]['vi'] = 'another device translation'
                divergent[name] = json.dumps(value)
            status, rejected_file = request('/scripts/fixture06/files', {'files': divergent})
            assert status == 409 and rejected_file['detail']['current_rev'] == 6, (name, status, rejected_file)
            assert {p.name: p.read_bytes() for p in mirror_folder.iterdir()} == before_old_mirror
        fresh_files = dict(current_bundle['files'])
        fresh_meta = json.loads(fresh_files['meta.json']); fresh_meta['rev'] = 0
        fresh_files['meta.json'] = json.dumps(fresh_meta)
        fresh_cues = json.loads(fresh_files['cues.json']); fresh_cues['meta'] = fresh_meta
        fresh_files['cues.json'] = json.dumps(fresh_cues)
        status, fresh_zero = request('/scripts/fixture10/files', {'files': fresh_files})
        assert status == 200, (status, fresh_zero)
        fresh_folder = root / 'subtitles/fixture10'
        before_fresh = {p.name: p.read_bytes() for p in fresh_folder.iterdir()}
        status, fresh_replay = request('/scripts/fixture10/files', {'files': fresh_files})
        assert status == 200
        assert {p.name: p.read_bytes() for p in fresh_folder.iterdir()} == before_fresh
        (fresh_folder / 'script.txt').unlink()  # disposable missing-file recovery fixture
        missing_before = {p.name: p.read_bytes() for p in fresh_folder.iterdir()}
        status, missing_conflict = request('/scripts/fixture10/files', {'files': fresh_files})
        assert status == 409 and missing_conflict['detail']['current_rev'] == 0
        assert {p.name: p.read_bytes() for p in fresh_folder.iterdir()} == missing_before
        print('PASS: each divergent mirror file at equal rev conflicts409; exact partial replay200; new rev0 import/replay200; existing missing equal-rev file409 without mutation')
        higher_files = dict(current_bundle['files'])
        higher_meta = json.loads(higher_files['meta.json']); higher_meta['rev'] = 7
        higher_files['meta.json'] = json.dumps(higher_meta)
        status, higher_rev = request('/scripts/fixture06/files', {'files': higher_files})
        assert status == 200, (status, higher_rev)
        assert json.loads((mirror_folder / 'meta.json').read_text())['rev'] == 7
        status, legacy_mirror = request('/scripts/fixture09/files',
                                       {'files': {'cues.json': current_bundle['files']['cues.json']}})
        assert status == 200 and legacy_mirror['written'] == ['cues.json']
        print('PASS: six invalid mirror revisions HTTP400 preserve all four files; identical equal/higher integer revisions HTTP200; metadata-omitted legacy partial mirror remains allowed (no stale-write guarantee)')

        # Old clients update JSON while the previous canonical TXT remains on Drive.
        for kind in ('partial', 'stale-txt', 'matching-txt', 'manual-local', 'ambiguous-txt', 'empty'):
            vid = 'legacy' + kind.replace('-', '')
            protected = {**cue, 'tokens': [{'surface': cue['source'], 'reading': ''}]}
            status, initial = request('/scripts/save', {'video_id': vid, 'owned': True, 'rev': 4, 'cues': [protected]})
            assert status == 200 and initial['rev'] == 5
            status, original = request(f'/scripts/{vid}/files')
            assert status == 200
            folder = root / 'subtitles' / vid
            incoming = json.loads(original['files']['cues.json'])
            meta = json.loads(original['files']['meta.json'])
            meta['rev'] = 6
            incoming['meta'] = meta
            incoming['cues'][0]['vi'] = 'Bản mới từ client cũ'
            if kind == 'empty':
                incoming['cues'] = []
            payload = {'cues.json': json.dumps(incoming, ensure_ascii=False), 'meta.json': json.dumps(meta)}
            if kind == 'stale-txt':
                payload['script.txt'] = original['files']['script.txt'] + '\n# old client copied this file\n'
            if kind in ('matching-txt', 'ambiguous-txt'):
                targets = incoming['cues'] if kind == 'matching-txt' else [{**cue, 'vi': 'Một chỉnh sửa TXT khác'}]
                payload['script.txt'] = script_store.render_script_txt(targets, video_id=vid)
            if kind == 'manual-local':
                (folder / 'script.txt').write_text(script_store.render_script_txt([{**cue, 'vi': 'TXT do tôi sửa'}], video_id=vid))
            before = {p.name: p.read_bytes() for p in folder.iterdir()}
            status, result = request(f'/scripts/{vid}/files', {'files': payload})
            if kind in ('manual-local', 'ambiguous-txt'):
                assert status == 409 and result['detail']['current_rev'] == 5, (kind, status, result)
                assert {p.name: p.read_bytes() for p in folder.iterdir()} == before
                continue
            assert status == 200, (kind, status, result)
            status, legacy_loaded = request(f'/scripts/{vid}')
            print(json.dumps({'legacyMirror': kind, 'loadHTTP': status, 'loadedVI': [c['vi'] for c in legacy_loaded['cues']], 'rev': legacy_loaded['meta']['rev']}, ensure_ascii=False), flush=True)
            assert status == 200 and legacy_loaded['meta']['rev'] == 6, (kind, legacy_loaded)
            assert legacy_loaded['meta']['owned'] and legacy_loaded['cues'] == incoming['cues'], (kind, legacy_loaded)
            assert (folder / 'tokens.json').read_bytes() == before['tokens.json']
            if kind == 'matching-txt':
                assert (folder / 'script.txt').read_text() == payload['script.txt']
            status, exported = request(f'/scripts/{vid}/files')
            assert status == 200 and json.loads(exported['files']['cues.json'])['cues'] == incoming['cues']
        print('PASS: higher-revision JSON-only/stale-TXT/matching-TXT and delete-all mirrors survive real load/export without revision bump; pending local TXT and ambiguous incoming TXT conflict409 before any disk write')
        status, manual_loaded = request('/scripts/legacymanuallocal')
        assert status == 200 and manual_loaded['cues'][0]['vi'] == 'TXT do tôi sửa' and manual_loaded['meta']['rev'] == 6
        bad_folder = root / 'subtitles/legacymatchingtxt'
        bad_before = {p.name: p.read_bytes() for p in bad_folder.iterdir()}
        for bad_cues in (None, ['not a cue'], [{**cue, 'end_media_time': 0}],
                         [{**cue, 'start_media_time': {}}], [{**cue, 'source': 'dòng một\ndòng hai'}],
                         [{**cue, 'end_media_time': 0, 'end': cue['end_media_time']}],
                         [{**cue, 'start_media_time': 0, 'start': cue['start_media_time']}]):
            status, invalid_mirror = request('/scripts/legacymatchingtxt/files', {'files': {
                'cues.json': json.dumps({'cues': bad_cues}), 'meta.json': json.dumps({'rev': 7})}})
            assert status == 400, (status, invalid_mirror)
            assert {p.name: p.read_bytes() for p in bad_folder.iterdir()} == bad_before
        fresh_json = {'cues.json': json.dumps({'cues': [cue], 'meta': {'rev': 6, 'owned': True}}),
                      'meta.json': json.dumps({'rev': 6, 'owned': True})}
        status, fresh_write = request('/scripts/legacyfresh/files', {'files': fresh_json})
        assert status == 200, (status, fresh_write)
        status, fresh_loaded = request('/scripts/legacyfresh')
        assert status == 200 and fresh_loaded['meta']['rev'] == 6 and fresh_loaded['cues'][0]['vi'] == cue['vi']
        print('PASS: pending TXT edit still loads as intended; invalid JSON cue shapes/times/unrepresentable multiline input400 leave all files exact; fresh JSON-only mirror survives real load')
        # Preserve the two-edit stale race and add the one-edit equal-revision collision.
        for race_id, advances in (('fixture07', 2), ('fixture08', 1)):
            status, future = request('/scripts/save', {'video_id': race_id, 'owned': True,
                                                      'rev': 6, 'cues': [cue]})
            assert status == 200 and future['rev'] == 7
            status, future_bundle = request(f'/scripts/{race_id}/files')
            assert status == 200
            status, removed = request(f'/scripts/{race_id}', method='DELETE')
            assert status == 200 and removed['deleted']
            status, reset = request('/scripts/save', {'video_id': race_id, 'owned': True,
                                                     'rev': 5, 'cues': [newer_cue]})
            assert status == 200 and reset['rev'] == 6
            mirror_check = subprocess.run(['node', str(Path(__file__).with_name('sentence_drive_mirror_sanity.js'))],
                                          input=json.dumps({'address': address, 'videoId': race_id,
                                                            'folder': str(root / 'subtitles' / race_id),
                                                            'files': future_bundle['files'], 'cue': newer_cue,
                                                            'localAdvances': advances}),
                                          text=True, capture_output=True)
            print(mirror_check.stdout, end='', flush=True)
            assert mirror_check.returncode == 0, mirror_check.stderr
        contenders = [{'video_id': 'fixture03', 'rev': 5, 'cues': [{**cue, 'vi': target}]}
                      for target in ('first writer', 'second writer')]
        status, initial = request('/scripts/save', {**contenders[0], 'rev': 4})
        assert status == 200 and initial['rev'] == 5
        with ThreadPoolExecutor(max_workers=2) as pool:
            outcomes = list(pool.map(lambda body: request('/scripts/save', body), contenders))
        assert sorted(status for status, _ in outcomes) == [200, 409], outcomes
        winner = next(i for i, (status, _) in enumerate(outcomes) if status == 200)
        status, concurrent = request('/scripts/fixture03')
        assert status == 200 and concurrent['meta']['rev'] == 6
        assert concurrent['cues'][0]['vi'] == contenders[winner]['cues'][0]['vi']
        print('PASS: concurrent same-revision HTTP saves produce one 200, one 409; disk contains the accepted writer at rev6')
        status, legacy = request('/scripts/save', {'video_id': 'fixture04', 'cues': [cue]})
        assert status == 200 and legacy['rev'] == 1
        status, legacy = request('/scripts/save', {'video_id': 'fixture04', 'cues': [cue]})
        assert status == 200 and legacy['rev'] == 2
        print('PASS: omitted-revision legacy saves retain existing behavior (not a stale-write guarantee)')
        projection_rows = [cue, *[{'id': ident, 'source': source, 'start_media_time': start,
                                  'end_media_time': end, 'vi': '', 'en': '', 'text_source': 'yt',
                                  'mt_locked': False, 'translation_source': ''}
                                 for ident, source, start, end in (
                                     ('yt-a', 'どこ', 6.001, 7.002),
                                     ('yt-b', '行くんですか?', 7.002, 8.003))]]
        status, projection_saved = request('/scripts/save', {'video_id': 'fixture02', 'owned': True,
                                                            'rev': 8, 'cues': projection_rows})
        assert status == 200 and projection_saved['rev'] == 9, (status, projection_saved)
        original_pid = process.pid
        stop_server()
        address = start_server()
        assert process.pid != original_pid, 'Restart must use a fresh process'
        status, restarted = request('/scripts/fixture01')
        assert status == 200 and restarted == loaded, (status, restarted, loaded)
        status, projection_loaded = request('/scripts/fixture02')
        assert status == 200 and projection_loaded['meta']['rev'] == 9, (status, projection_loaded)
        projection_check = subprocess.run(['node', str(Path(__file__).with_name('sentence_provenance_sanity.js'))],
                                         input=json.dumps({'before': projection_rows, 'after': projection_loaded['cues']}),
                                         text=True, capture_output=True)
        print(projection_check.stdout, end='', flush=True)
        assert projection_check.returncode == 0, projection_check.stderr
        print(json.dumps({'restartHTTP': status, 'firstPid': original_pid, 'secondPid': process.pid,
                          'loadedClocks': [restarted['cues'][0]['start_media_time'], restarted['cues'][0]['end_media_time']],
                          'owned': restarted['meta']['owned'], 'locked': restarted['cues'][0]['mt_locked'],
                          'revision': restarted['meta']['rev']}), flush=True)
        rewritten = json.loads((root / 'subtitles/fixture01/cues.json').read_text())
        assert rewritten['cues'][0]['start_media_time'] == cue['start_media_time']
        txt_path = root / 'subtitles/fixture01/script.txt'
        txt_path.write_text(txt_path.read_text().replace('0:01.234', '0:01.23401', 1), encoding='utf-8')
        status, edited = request('/scripts/fixture01')
        assert status == 200 and edited['cues'][0]['start_media_time'] == 1.23401, (status, edited)
        assert edited['meta']['rev'] == restarted['meta']['rev'] + 1, edited['meta']
        assert edited['cues'][0]['text_source'] == 'script'
        status, stable_edit = request('/scripts/fixture01')
        assert status == 200 and stable_edit == edited
        print(json.dumps({'exactTXTEditHTTP': status, 'start': edited['cues'][0]['start_media_time'],
                          'previousRevision': restarted['meta']['rev'], 'editRevision': edited['meta']['rev']}), flush=True)
        rewritten = json.loads((root / 'subtitles/fixture01/cues.json').read_text())
        status, invalid = request('/scripts/save', {'video_id': 'fixture01', 'cues': [{**cue, 'end_media_time': 0}]})
        assert status == 422, (status, invalid)
        assert json.loads((root / 'subtitles/fixture01/cues.json').read_text()) == rewritten
        status, missing = request('/scripts/unknown01')
        assert status == 200 and not missing['found']
        print('PASS: actual HTTP200 production save/disk/fresh-process restart/load preserves precise clocks, cue provenance, owned targets/locks and revision; exact TXT edits advance revision once; HTTP422 rejects invalid timing without disk mutation; missing is explicit')
    finally:
        if process is not None and process.poll() is None:
            stop_server()
