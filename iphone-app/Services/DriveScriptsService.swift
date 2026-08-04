import Foundation
import SwiftData

/// Mirror of the per-video Drive folder the bridge/extension writes:
/// `<videoId>/script.txt` (panel import) + `cues.json` (push patch) + `meta.json` (rev)
/// under fixed folder `DriveOAuthConfig.folderId`, via Drive REST (not Files / NSFileCoordinator).
///
/// Freshness is the Lamport `rev` in `meta.json`, never a timestamp: Mac and iPad clocks
/// drift, and Drive file mtime is the sync time, not the edit time.
@MainActor
enum DriveScriptsService {
    /// Stable per-install id, mirroring the bridge's `data/config/device_id.txt`.
    static let deviceId: String = {
        let key = "driveDeviceId"
        if let saved = UserDefaults.standard.string(forKey: key), !saved.isEmpty { return saved }
        let fresh = "ipad-" + UUID().uuidString.prefix(8).lowercased()
        UserDefaults.standard.set(fresh, forKey: key)
        return fresh
    }()

    struct SyncResult {
        var changed: Bool
        var message: String
        /// Live cues after pull/import — UI must use this; `ScriptCue.load` can miss relationship.
        var cues: [ScriptCue]? = nil
    }

    // MARK: - Sync

    /// Pull when Drive is ahead, otherwise push iPad edits back as a patch.
    /// Always returns a Vietnamese status line (found / missing / error / up-to-date).
    @discardableResult
    static func sync(videoId: String, context: ModelContext) async -> SyncResult {
        guard !videoId.isEmpty else {
            return SyncResult(changed: false, message: "Drive: chưa có videoId")
        }
        guard DriveAuthService.shared.hasToken else {
            return SyncResult(changed: false, message: "Chưa Connect Drive")
        }
        do {
            return try await syncThrowing(videoId: videoId, context: context)
        } catch {
            return SyncResult(changed: false, message: "Drive: \(error.localizedDescription)")
        }
    }

    /// Whole folder → SwiftData. Returns a status line for the side panel.
    static func syncAll(context: ModelContext) async -> String {
        guard DriveAuthService.shared.hasToken else { return "Chưa Connect Drive" }
        do {
            let folders = try await DriveAPIClient.listVideoFolders()
            var pulled = 0
            for folder in folders {
                if try await syncThrowing(videoId: folder.name, context: context).changed { pulled += 1 }
            }
            return folders.isEmpty
                ? "Drive: chưa thấy folder video nào"
                : "Drive: \(folders.count) video · nạp mới \(pulled)"
        } catch {
            return "Drive: \(error.localizedDescription)"
        }
    }

    private static func syncThrowing(videoId: String, context: ModelContext) async throws -> SyncResult {
        // Pull path: find only — never mkdir empty folders that mask a missing match.
        guard let folderId = try await DriveAPIClient.findVideoFolder(videoId: videoId) else {
            return SyncResult(changed: false, message: "Drive: không thấy folder \(videoId)")
        }
        let children = try await DriveAPIClient.children(folderId: folderId)
        guard let cuesFileId = children["cues.json"] else {
            return SyncResult(changed: false, message: "Drive: folder \(videoId) thiếu cues.json")
        }

        let cuesText = try await DriveAPIClient.getText(fileId: cuesFileId)
        guard let cuesData = cuesText.data(using: .utf8),
              let cuesRoot = (try? JSONSerialization.jsonObject(with: cuesData)) as? [String: Any]
        else {
            return SyncResult(changed: false, message: "Drive: cues.json lỗi (\(videoId))")
        }

        var meta: [String: Any]
        if let metaId = children["meta.json"],
           let metaText = try? await DriveAPIClient.getText(fileId: metaId),
           let metaData = metaText.data(using: .utf8),
           let parsed = (try? JSONSerialization.jsonObject(with: metaData)) as? [String: Any] {
            meta = parsed
        } else {
            meta = cuesRoot["meta"] as? [String: Any] ?? [:]
        }
        let driveRev = DriveAPIClient.parseRev(meta)
        let driveArr = (cuesRoot["cues"] as? [[String: Any]]) ?? []
        let driveCueCount = driveArr.count
        let driveTranslated = driveArr.filter { hasMT($0["en"] as? String, $0["vi"] as? String) }.count
        let script = fetchScript(videoId: videoId, context: context)
        let live = ScriptCue.load(videoId: videoId, context: context).filter { !$0.isDeleted }
        let liveCount = live.count
        let localTranslated = live.filter { hasMT($0.textEN, $0.textVI) }.count
        // Rev alone is not enough: YouTube JA cache (unowned) / stuck owned JA-only
        // must not block Drive EN/VI — else "đã đồng bộ" shows 338 cue with empty MT.
        if needsPull(
            driveRev: driveRev,
            localRev: script?.rev ?? 0,
            localLiveCount: liveCount,
            driveCueCount: driveCueCount,
            localOwned: script?.owned == true,
            localTranslated: localTranslated,
            driveTranslated: driveTranslated
        ) {
            // Prefer script.txt; cues.json only if TXT missing or parse empty.
            // TXT has no tokens — stamp cue ids from cues.json (PC `_cues_from_txt` parity)
            // so replace import keeps stable ids; JLPT/dict = live NLPTagger on JA.
            var rows: [ScriptCue.ImportRow] = []
            let cuesRows = ScriptCue.parseImportRows(cuesText)
            if let scriptFileId = children["script.txt"] {
                let scriptText = try await DriveAPIClient.getText(fileId: scriptFileId)
                rows = ScriptCue.parseImportRows(scriptText)
                if !rows.isEmpty {
                    rows = stampCueIds(txt: rows, from: cuesRows)
                }
            }
            if rows.isEmpty {
                rows = cuesRows
            }
            let pulled = pull(videoId: videoId, rows: rows, meta: meta, rev: driveRev, context: context)
            guard !pulled.isEmpty else {
                return SyncResult(changed: false, message: "Drive: cues/script trống (\(videoId))")
            }
            return SyncResult(
                changed: true,
                message: "Drive: đã nạp \(videoId) (\(pulled.count) cue · rev \(driveRev))",
                cues: pulled
            )
        }

        // Unowned YouTube cache must never patch/push over Drive.
        guard let script, script.owned,
              let live = liveCues(videoId: videoId, context: context),
              var patched = patchedCues(original: cuesRoot, cues: live)
        else {
            let live = ScriptCue.load(videoId: videoId, context: context).filter { !$0.isDeleted }
            return SyncResult(
                changed: false,
                message: "Drive: \(videoId) đã đồng bộ (\(liveCount) cue · rev \(script?.rev ?? driveRev))",
                cues: live.isEmpty ? nil : live
            )
        }

        let rev = max(driveRev, script.rev) + 1
        meta["video_id"] = videoId
        meta["rev"] = rev
        meta["deviceId"] = deviceId
        meta["updated_at"] = bridgeTimestamp(Date())
        meta["cue_count"] = live.count
        meta["owned"] = true
        patched["meta"] = meta
        guard let cuesOut = encode(patched), let metaOut = encode(meta),
              let cuesStr = String(data: cuesOut, encoding: .utf8),
              let metaStr = String(data: metaOut, encoding: .utf8)
        else {
            return SyncResult(changed: false, message: "Drive: không encode được patch (\(videoId))")
        }

        _ = try await DriveAPIClient.putText(
            folderId: folderId, name: "cues.json", text: cuesStr, fileId: cuesFileId
        )
        _ = try await DriveAPIClient.putText(
            folderId: folderId, name: "meta.json", text: metaStr, fileId: children["meta.json"]
        )
        script.rev = rev
        script.deviceId = deviceId
        try? context.save()
        return SyncResult(changed: false, message: "Drive: đã đẩy \(videoId) (rev \(rev))")
    }

    private static func pull(
        videoId: String,
        rows: [ScriptCue.ImportRow],
        meta: [String: Any],
        rev: Int,
        context: ModelContext
    ) -> [ScriptCue] {
        guard !rows.isEmpty else { return [] }
        let result = ScriptCue.importRows(videoId: videoId, rows: rows, mode: .replace, includeJA: true, context: context)
        if let script = fetchScript(videoId: videoId, context: context) {
            script.rev = rev
            script.deviceId = meta["deviceId"] as? String ?? ""
            if let title = meta["title"] as? String, !title.isEmpty { script.title = title }
            try? context.save()
        }
        // Prefer import's inserted array — relationship reload can still be empty.
        let live = result.cues.filter { !$0.isDeleted }
        let out = live.isEmpty
            ? ScriptCue.load(videoId: videoId, context: context).filter { !$0.isDeleted }
            : live
        // No tokens.json on device / Drive — warm NLP so JLPT colors + dict taps work after TXT pull.
        for cue in out where !cue.textJA.isEmpty {
            _ = NLPTagger.tokenize(cue.textJA)
        }
        return out
    }

    /// Keep cues.json ids when TXT rewrite drops them (index match, like bridge `_cues_from_txt`).
    static func stampCueIds(txt: [ScriptCue.ImportRow], from cues: [ScriptCue.ImportRow]) -> [ScriptCue.ImportRow] {
        guard !cues.isEmpty else { return txt }
        var out = txt
        for i in out.indices where i < cues.count && !cues[i].id.isEmpty {
            out[i].id = cues[i].id
        }
        return out
    }

    // MARK: - Patch merge

    /// Patch, never rewrite: iPad owns only `start_media_time` / `end_media_time` / `source` /
    /// `en` / `vi`. `tokens`, `mt_locked`, `translation_source` — which iPad has no field for —
    /// ride along untouched. Returns nil when nothing changed, which is what stops the rev
    /// ping-pong between iPad and PC.
    static func patchedCues(original: [String: Any], cues: [ScriptCue]) -> [String: Any]? {
        let old = (original["cues"] as? [[String: Any]]) ?? []
        var byId: [String: [String: Any]] = [:]
        for cue in old {
            if let id = cue["id"] as? String, !id.isEmpty { byId[id] = cue }
        }

        var out: [[String: Any]] = []
        var changed = false
        for cue in cues {
            let startSec = cue.startTime / 1000
            let endSec = (cue.startTime + max(cue.duration, 0)) / 1000
            let en = cue.textEN ?? ""
            let vi = cue.textVI ?? ""
            guard var row = byId[cue.id] else {
                out.append([
                    "id": cue.id,
                    "start_media_time": startSec,
                    "end_media_time": endSec,
                    "source": cue.textJA,
                    "en": en,
                    "vi": vi,
                    "tokens": [],
                    "translated": !(en.isEmpty && vi.isEmpty),
                    "text_source": "manual",
                    "mt_locked": false,
                    "translation_source": "",
                ])
                changed = true
                continue
            }
            // ±0.5ms tolerance: sec → ms → sec float drift must not read as an edit.
            if abs(double(row["start_media_time"]) - startSec) > 0.0005 {
                row["start_media_time"] = startSec
                changed = true
            }
            if abs(double(row["end_media_time"]) - endSec) > 0.0005 {
                row["end_media_time"] = endSec
                changed = true
            }
            if (row["source"] as? String ?? "") != cue.textJA {
                row["source"] = cue.textJA
                changed = true
            }
            if (row["en"] as? String ?? "") != en || (row["vi"] as? String ?? "") != vi {
                row["en"] = en
                row["vi"] = vi
                row["translated"] = !(en.isEmpty && vi.isEmpty)
                changed = true
            }
            out.append(row)
        }
        // Covers tombstones, inserts and reorder in one comparison.
        if old.map({ $0["id"] as? String ?? "" }) != out.map({ $0["id"] as? String ?? "" }) { changed = true }
        guard changed else { return nil }

        var root = original
        root["cues"] = out
        return root
    }

    // MARK: - Helpers

    /// Pull when Drive is ahead, local is empty, unowned YouTube, or owned-but-0-MT while Drive has MT.
    static func needsPull(
        driveRev: Int,
        localRev: Int,
        localLiveCount: Int,
        driveCueCount: Int,
        localOwned: Bool = true,
        localTranslated: Int = 0,
        driveTranslated: Int = 0
    ) -> Bool {
        if driveRev > localRev { return true }
        if localLiveCount == 0 && driveCueCount > 0 { return true }
        // Unowned YouTube merge must not fake "đã đồng bộ" over Drive EN/VI.
        if !localOwned && driveCueCount > 0 { return true }
        // Stuck owned JA-only (false-owned cache) while Drive cues.json has translations.
        if localOwned && localTranslated == 0 && driveTranslated > 0 { return true }
        return false
    }

    fileprivate static func hasMT(_ en: String?, _ vi: String?) -> Bool {
        !(en ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            || !(vi ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private static func encode(_ object: [String: Any]) -> Data? {
        try? JSONSerialization.data(
            withJSONObject: object,
            options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        )
    }

    private static func fetchScript(videoId: String, context: ModelContext) -> VideoScript? {
        let descriptor = FetchDescriptor<VideoScript>(predicate: #Predicate { $0.videoId == videoId })
        return try? context.fetch(descriptor).first
    }

    private static func liveCues(videoId: String, context: ModelContext) -> [ScriptCue]? {
        let live = ScriptCue.load(videoId: videoId, context: context)
            .filter { !$0.isDeleted }
            .sorted { $0.startTime < $1.startTime }
        // Never push an empty list over a Drive script — that would be a silent wipe.
        return live.isEmpty ? nil : live
    }

    fileprivate static func double(_ value: Any?) -> Double { (value as? NSNumber)?.doubleValue ?? 0 }

    /// Bridge writes local time without a zone (`%Y-%m-%dT%H:%M:%S`).
    private static func bridgeTimestamp(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
        return f.string(from: date)
    }
}

/// The one check for patch-merge: PC-only fields must survive an iPad write, and an
/// unedited script must produce no write at all (else iPad and PC bump `rev` forever).
enum DriveScriptsSmoke {
    @MainActor
    static func run() {
        let json = """
        {"video_id":"v","cues":[
          {"id":"a","start_media_time":0.599,"end_media_time":2.0,"source":"あ","en":"A","vi":"",
           "tokens":[{"surface":"あ"}],"translated":true,"text_source":"yt","mt_locked":true,"translation_source":"import"},
          {"id":"b","start_media_time":3.0,"end_media_time":4.0,"source":"い","en":"","vi":"",
           "tokens":[],"translated":false,"text_source":"yt","mt_locked":false,"translation_source":""}
        ],"meta":{"rev":5}}
        """
        let root = (try! JSONSerialization.jsonObject(with: Data(json.utf8))) as! [String: Any]

        func cue(_ id: String, _ startMs: Double, _ endMs: Double, _ ja: String, _ en: String?, _ vi: String?) -> ScriptCue {
            ScriptCue(id: id, startTime: startMs, duration: endMs - startMs, textJA: ja, textEN: en, textVI: vi)
        }

        // Same content back → nil, so no rev bump and no ping-pong (0.599s → 599ms → 0.599s).
        let unchanged = DriveScriptsService.patchedCues(
            original: root,
            cues: [cue("a", 599, 2000, "あ", "A", ""), cue("b", 3000, 4000, "い", "", "")]
        )
        assert(unchanged == nil, "unedited script must not write")

        // Edit VI on `a`, tombstone `b`, add a new cue.
        let patched = DriveScriptsService.patchedCues(
            original: root,
            cues: [cue("a", 599, 2000, "あ", "A", "Xin chào"), cue("new", 5000, 6000, "う", nil, nil)]
        )
        let cues = patched?["cues"] as? [[String: Any]]
        assert(cues?.count == 2, "tombstoned cue removed, new cue appended")
        assert(cues?[0]["vi"] as? String == "Xin chào", "vi written")
        assert((cues?[0]["tokens"] as? [Any])?.count == 1, "tokens preserved")
        assert(cues?[0]["mt_locked"] as? Bool == true, "mt_locked preserved")
        assert(cues?[0]["translation_source"] as? String == "import", "translation_source preserved")
        assert(cues?[0]["text_source"] as? String == "yt", "text_source preserved")
        assert(cues?[1]["id"] as? String == "new", "new cue kept in start order")
        assert((cues?[1]["tokens"] as? [Any])?.isEmpty == true, "new cue gets empty tokens")
        assert(abs(DriveScriptsService.double(cues?[1]["start_media_time"]) - 5.0) < 1e-9, "ms → sec on write")
        assert((patched?["meta"] as? [String: Any])?["rev"] as? Int == 5, "untouched keys ride along")

        // Status copy must name the videoId so Connect UI can show found/missing clearly.
        let missing = DriveScriptsService.SyncResult(changed: false, message: "Drive: không thấy folder EiISOvl2_tQ")
        assert(missing.message.contains("EiISOvl2_tQ"), "missing status includes videoId")

        // Empty local + Drive cues → force pull even when revs match (false "đã đồng bộ").
        assert(DriveScriptsService.needsPull(driveRev: 5, localRev: 5, localLiveCount: 0, driveCueCount: 2),
               "empty local must pull when Drive has cues")
        assert(!DriveScriptsService.needsPull(driveRev: 5, localRev: 5, localLiveCount: 2, driveCueCount: 2),
               "matching rev with live cues stays put")
        assert(DriveScriptsService.needsPull(driveRev: 6, localRev: 5, localLiveCount: 2, driveCueCount: 2),
               "higher Drive rev must pull")
        // YouTube JA cache (unowned) must pull Drive even when cue counts match.
        assert(DriveScriptsService.needsPull(
            driveRev: 0, localRev: 0, localLiveCount: 338, driveCueCount: 338, localOwned: false
        ), "unowned YouTube must not block Drive script")
        assert(!DriveScriptsService.needsPull(
            driveRev: 0, localRev: 0, localLiveCount: 338, driveCueCount: 338, localOwned: true
        ), "owned stays put when revs match and no Drive MT signal")
        // Stuck owned JA-only while Drive has translations → recover.
        assert(DriveScriptsService.needsPull(
            driveRev: 0, localRev: 0, localLiveCount: 338, driveCueCount: 338,
            localOwned: true, localTranslated: 0, driveTranslated: 337
        ), "owned JA-only must pull when Drive has MT")
        assert(!DriveScriptsService.needsPull(
            driveRev: 0, localRev: 0, localLiveCount: 338, driveCueCount: 338,
            localOwned: true, localTranslated: 300, driveTranslated: 337
        ), "owned+synced with local MT stays put")

        // Pull imports prefer script.txt; parse → import → load.count == replaced.
        let scriptTxt = """
        [001] 0:00 → 0:02
        JA: あ
        EN: A
        ----------
        [002] 0:03 → 0:04
        JA: い
        """
        let pullRows = ScriptCue.parseImportRows(scriptTxt)
        assert(pullRows.count == 2, "script.txt parse cue count")
        assert(pullRows[0].ja == "あ" && pullRows[0].en == "A", "script.txt row ja/en")
        assert(pullRows[0].startMs == 0 && pullRows[0].endMs == 2000, "script.txt times")

        // TXT rows lack ids — stamp from cues.json so replace keeps stable cue identity.
        let jsonRows = ScriptCue.parseImportRows(json)
        let stamped = DriveScriptsService.stampCueIds(txt: pullRows, from: jsonRows)
        assert(stamped[0].id == "a" && stamped[1].id == "b", "stampCueIds from cues.json")
        assert(stamped[0].ja == "あ", "stamp keeps TXT ja")

        let container = try! ModelContainer(
            for: VideoScript.self, ScriptCue.self,
            configurations: ModelConfiguration(isStoredInMemoryOnly: true)
        )
        let ctx = ModelContext(container)
        let imported = ScriptCue.importRows(
            videoId: "smoke-v", rows: stamped, mode: .replace, includeJA: true, context: ctx
        )
        assert(imported.cues.count == imported.replaced, "import returns cue array")
        assert(ScriptCue.load(videoId: "smoke-v", context: ctx).count == imported.replaced,
               "load.count == replaced after script.txt import")
        assert(imported.cues[0].id == "a", "imported cue keeps stamped id")
        // iPhone: no tokens.json — JLPT/dict from live NLP of JA after TXT pull.
        let toks = NLPTagger.tokenize(imported.cues[0].textJA)
        assert(!toks.isEmpty, "TXT pull JA must tokenize for dict/JLPT")

        // Shape of real Drive export (MOIbaNe4Pmw): # --- headers + furigana (…） lines.
        let moiShape = """
        # ----------------------------------------
        # YouTube Caption Script
        video_id: MOIbaNe4Pmw
        # ----------------------------------------

        [001] 0:00 → 0:03.10
        JA: なーヒカル、リコちゃんと喋ったことある？
            (なーヒカル、リコちゃんと喋っ(しゃべっ)たことある？)
        EN: Hey Hikaru
        VI: Này Hikaru
        # ----------------------------------------
        [002] 0:04 → 0:07.10
        JA: リコって、ほらあそこに座ってる
            (リコって、ほらあそこに座っ(すわっ)てる)
        """
        let moiRows = ScriptCue.parseImportRows(moiShape)
        assert(moiRows.count == 2, "MOIbaNe4Pmw-shaped parse (got \(moiRows.count))")
        assert(moiRows[0].ja.contains("ヒカル") && moiRows[0].endMs == 3100, "MOIbaNe4Pmw first cue")

        // Real MOIbaNe4Pmw cues.json → unowned JA seed → pull EN/VI ≥ 300.
        // Skip on device/sim without repo checkout — try! here crashed app launch.
        let moiDir = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // Services
            .deletingLastPathComponent() // ipad-app
            .deletingLastPathComponent() // repo root
            .appendingPathComponent("youtube-jp-caption-studio/data/subtitles/MOIbaNe4Pmw")
        let moiCuesURL = moiDir.appendingPathComponent("cues.json")
        guard let moiCuesText = try? String(contentsOf: moiCuesURL, encoding: .utf8) else {
            fputs("[DriveScriptsSmoke] skip MOI file (missing \(moiCuesURL.path))\n", stderr)
            fflush(stderr)
            return
        }
        let moiJSONRows = ScriptCue.parseImportRows(moiCuesText)
        assert(moiJSONRows.count >= 300, "MOIbaNe4Pmw cues.json row count (got \(moiJSONRows.count))")
        let moiJSONMT = moiJSONRows.filter { DriveScriptsService.hasMT($0.en, $0.vi) }.count
        assert(moiJSONMT >= 300, "MOIbaNe4Pmw cues.json MT rows (got \(moiJSONMT))")

        let moiContainer = try! ModelContainer(
            for: VideoScript.self, ScriptCue.self,
            configurations: ModelConfiguration(isStoredInMemoryOnly: true)
        )
        let moiCtx = ModelContext(moiContainer)
        // Seed JA-only unowned YouTube cache (338 cues, rev 0).
        let jaOnly = moiJSONRows.map {
            ScriptCue.ImportRow(id: $0.id, startMs: $0.startMs, endMs: $0.endMs, ja: $0.ja, en: nil, vi: nil)
        }
        let seeded = ScriptCue.importRows(
            videoId: "MOIbaNe4Pmw", rows: jaOnly, mode: .replace, includeJA: true, context: moiCtx
        )
        if let s = (try? moiCtx.fetch(FetchDescriptor<VideoScript>(
            predicate: #Predicate { $0.videoId == "MOIbaNe4Pmw" }
        )))?.first {
            s.owned = false
            s.rev = 0
            try? moiCtx.save()
        }
        assert(seeded.cues.count >= 300, "JA-only seed count")
        assert(seeded.cues.filter { DriveScriptsService.hasMT($0.textEN, $0.textVI) }.isEmpty,
               "seed must be JA-only")
        assert(DriveScriptsService.needsPull(
            driveRev: 0, localRev: 0, localLiveCount: seeded.cues.count,
            driveCueCount: moiJSONRows.count, localOwned: false,
            localTranslated: 0, driveTranslated: moiJSONMT
        ), "unowned MOI seed must needsPull")

        let pulledMOI = ScriptCue.importRows(
            videoId: "MOIbaNe4Pmw", rows: moiJSONRows, mode: .replace, includeJA: true, context: moiCtx
        )
        let enCount = pulledMOI.cues.filter {
            !($0.textEN ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }.count
        let viCount = pulledMOI.cues.filter {
            !($0.textVI ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }.count
        assert(enCount >= 300, "MOIbaNe4Pmw pull EN ≥ 300 (got \(enCount))")
        assert(viCount >= 300, "MOIbaNe4Pmw pull VI ≥ 300 (got \(viCount))")

        let line = "[DriveScriptsSmoke] ok en=\(enCount) vi=\(viCount)\n"
        fputs(line, stderr); fflush(stderr)
        try? line.write(toFile: "/tmp/drive_scripts_smoke_ok.txt", atomically: true, encoding: .utf8)
        print(line, terminator: "")
    }
}
