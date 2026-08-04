import Foundation
import SwiftData
import SwiftUI
import UniformTypeIdentifiers

/// JSON snapshot of scripts + vocab → user-picked folder (Google Drive via Files).
///
/// First-run (physical iPad — you must do this yourself):
/// 1. Open `YouTubeJPCaptionStudio.xcodeproj`, select your iPad, Automatic Signing + Team.
/// 2. ⌘R once; on iPad: Settings → General → VPN & Device Management → Trust.
/// 3. In app: Thư mục → Files → Google Drive → vào folder sync / `<videoId>/`
///    → mở `cues.json` (hoặc meta/script); app bookmarks parent sync root.
///    Drive không cho Mở folder — phải chọn file.
@MainActor
final class BackupService: ObservableObject {
    static let shared = BackupService()
    static let fileName = "caption-studio-backup.json"
    private static let bookmarkKey = "backupFolderBookmark"
    private static let lastAppliedKey = "backupLastAppliedUpdatedAt"
    private static let debounceNs: UInt64 = 1_500_000_000

    @Published private(set) var status: String?
    @Published private(set) var hasFolder = false

    private var debounceTask: Task<Void, Never>?
    private var dirty = false

    private init() {
        hasFolder = UserDefaults.standard.data(forKey: Self.bookmarkKey) != nil
    }

    // MARK: - Schema v1

    struct Snapshot: Codable, Equatable {
        var version: Int = 1
        /// Last-write-wins; ISO8601 on the wire.
        var updatedAt: Date?
        var scripts: [ScriptDTO]
        var vocab: [VocabDTO]
    }

    struct ScriptDTO: Codable, Equatable {
        var videoId: String
        var title: String
        var owned: Bool
        /// Lamport rev + deviceId survive restore so Drive sync doesn't re-pull
        /// over the restored (possibly newer) local copy. Optional = old backups decode.
        var rev: Int?
        var deviceId: String?
        var cues: [CueDTO]
    }

    /// Wire is start-only: `duration` omitted on encode; ignored on apply (derived from next start).
    struct CueDTO: Codable, Equatable {
        var id: String
        var startTime: Double
        var duration: Double?
        var textJA: String
        var textEN: String?
        var textVI: String?
        var isDeleted: Bool
    }

    struct VocabDTO: Codable, Equatable {
        var word: String
        var reading: String
        var meaning: String
        var jlptLevel: Int?
        var frequencyCount: Int
        var savedAt: Date
    }

    // MARK: - Public API

    func scheduleBackup(context: ModelContext) {
        dirty = true
        debounceTask?.cancel()
        debounceTask = Task {
            try? await Task.sleep(nanoseconds: Self.debounceNs)
            guard !Task.isCancelled else { return }
            backupNow(context: context)
        }
    }

    /// Flush debounce if a mutation is still pending (scene background).
    func flushPending(context: ModelContext) {
        guard dirty else { return }
        backupNow(context: context)
    }

    func backupNow(context: ModelContext) {
        debounceTask?.cancel()
        debounceTask = nil
        dirty = false
        guard let folder = resolveFolder() else {
            status = "Chưa chọn thư mục backup"
            return
        }
        let access = folder.startAccessingSecurityScopedResource()
        defer { if access { folder.stopAccessingSecurityScopedResource() } }
        do {
            let snap = try encodeSnapshot(context: context)
            let enc = JSONEncoder()
            enc.dateEncodingStrategy = .iso8601
            enc.outputFormatting = [.prettyPrinted, .sortedKeys]
            let data = try enc.encode(snap)
            let url = folder.appendingPathComponent(Self.fileName)
            try data.write(to: url, options: .atomic)
            if let at = snap.updatedAt { rememberApplied(at) }
            status = "Đã backup \(snap.scripts.count) script · \(snap.vocab.count) từ"
        } catch {
            dirty = true
            status = "Backup lỗi: \(error.localizedDescription)"
        }
    }

    @discardableResult
    func restore(context: ModelContext) -> Bool {
        guard let folder = resolveFolder() else {
            status = "Chưa chọn thư mục backup"
            return false
        }
        let access = folder.startAccessingSecurityScopedResource()
        defer { if access { folder.stopAccessingSecurityScopedResource() } }
        let url = folder.appendingPathComponent(Self.fileName)
        guard let data = try? Data(contentsOf: url) else {
            status = "Không thấy \(Self.fileName)"
            return false
        }
        do {
            let snap = try decodeSnapshot(data)
            try apply(snap, to: context)
            if let at = snap.updatedAt { rememberApplied(at) }
            status = "Đã restore \(snap.scripts.count) script · \(snap.vocab.count) từ"
            dirty = false
            return true
        } catch {
            status = "Restore lỗi: \(error.localizedDescription)"
            return false
        }
    }

    /// After reinstall: if SwiftData empty and backup file exists, restore once.
    func autoRestoreIfEmpty(context: ModelContext) {
        let scripts = (try? context.fetch(FetchDescriptor<VideoScript>())) ?? []
        let vocab = (try? context.fetch(FetchDescriptor<Vocabulary>())) ?? []
        guard scripts.isEmpty, vocab.isEmpty else { return }
        guard resolveFolder() != nil else { return }
        if restore(context: context) {
            status = (status ?? "") + " (tự động)"
        }
    }

    /// Pull Drive JSON when remote `updatedAt` is newer than last applied (skip if local dirty).
    @discardableResult
    func syncFromDriveIfNewer(context: ModelContext) -> Bool {
        guard !dirty else { return false }
        guard let folder = resolveFolder() else { return false }
        let access = folder.startAccessingSecurityScopedResource()
        defer { if access { folder.stopAccessingSecurityScopedResource() } }
        let url = folder.appendingPathComponent(Self.fileName)
        guard let data = try? Data(contentsOf: url) else { return false }
        do {
            let snap = try decodeSnapshot(data)
            guard let remote = snap.updatedAt else { return false }
            if let last = lastAppliedUpdatedAt, remote <= last { return false }
            try apply(snap, to: context)
            rememberApplied(remote)
            dirty = false
            status = "Đã sync \(snap.scripts.count) script · \(snap.vocab.count) từ (Drive mới hơn)"
            return true
        } catch {
            status = "Sync lỗi: \(error.localizedDescription)"
            return false
        }
    }

    func setFolder(_ url: URL) {
        let root = Self.normalizeSyncRoot(url)
        do {
            let data = try root.bookmarkData(options: .minimalBookmark, includingResourceValuesForKeys: nil, relativeTo: nil)
            UserDefaults.standard.set(data, forKey: Self.bookmarkKey)
            hasFolder = true
            status = "Thư mục: \(root.lastPathComponent)"
        } catch {
            status = "Bookmark lỗi: \(error.localizedDescription)"
        }
    }

    /// Walk up from a picked path to the Drive sync root (parent of `<videoId>/` folders).
    /// Uses only `cues.json` / `meta.json` layout — never `caption-studio-backup.json`.
    static func normalizeSyncRoot(_ url: URL) -> URL {
        var candidate = url
        if (try? candidate.resourceValues(forKeys: [.isDirectoryKey]))?.isDirectory != true {
            candidate = candidate.deletingLastPathComponent()
        }
        let start = candidate
        for _ in 0..<3 {
            if isVideoFolder(candidate) {
                return candidate.deletingLastPathComponent()
            }
            if isSyncRoot(candidate) {
                return candidate
            }
            let parent = candidate.deletingLastPathComponent()
            if parent.path == candidate.path { break }
            candidate = parent
        }
        return start
    }

    private static func isVideoFolder(_ url: URL) -> Bool {
        let fm = FileManager.default
        return fm.fileExists(atPath: url.appendingPathComponent("cues.json").path)
            || fm.fileExists(atPath: url.appendingPathComponent("meta.json").path)
    }

    private static func isSyncRoot(_ url: URL) -> Bool {
        guard let kids = try? FileManager.default.contentsOfDirectory(
            at: url,
            includingPropertiesForKeys: [.isDirectoryKey],
            options: [.skipsHiddenFiles]
        ) else { return false }
        return kids.contains { kid in
            (try? kid.resourceValues(forKeys: [.isDirectoryKey]))?.isDirectory == true && isVideoFolder(kid)
        }
    }

    // MARK: - Encode / apply

    func encodeSnapshot(context: ModelContext) throws -> Snapshot {
        let scripts = try context.fetch(FetchDescriptor<VideoScript>())
        let vocab = try context.fetch(FetchDescriptor<Vocabulary>())
        return Snapshot(
            updatedAt: Date(),
            scripts: scripts.map { s in
                ScriptDTO(
                    videoId: s.videoId,
                    title: s.title,
                    owned: s.owned,
                    rev: s.rev,
                    deviceId: s.deviceId,
                    cues: (s.cues).map { c in
                        CueDTO(
                            id: c.id,
                            startTime: c.startTime,
                            duration: nil,
                            textJA: c.textJA,
                            textEN: c.textEN,
                            textVI: c.textVI,
                            isDeleted: c.isDeleted
                        )
                    }
                )
            },
            vocab: vocab.map { v in
                VocabDTO(
                    word: v.word,
                    reading: v.reading,
                    meaning: v.meaning,
                    jlptLevel: v.jlptLevel,
                    frequencyCount: v.frequencyCount,
                    savedAt: v.savedAt
                )
            }
        )
    }

    /// Duration from next start; last cue → `CueTiming.defaultDurMs` (start-only wire).
    static func derivedDuration(cues: [CueDTO], index: Int) -> Double {
        let sorted = cues.sorted { $0.startTime < $1.startTime }
        guard index >= 0, index < sorted.count else { return CueTiming.defaultDurMs }
        if index + 1 < sorted.count {
            let d = sorted[index + 1].startTime - sorted[index].startTime
            return d > 0 ? d : CueTiming.minDurMs
        }
        return CueTiming.defaultDurMs
    }

    private func apply(_ snap: Snapshot, to context: ModelContext) throws {
        for s in (try context.fetch(FetchDescriptor<VideoScript>())) { context.delete(s) }
        for v in (try context.fetch(FetchDescriptor<Vocabulary>())) { context.delete(v) }
        try context.save()

        for sd in snap.scripts {
            let script = VideoScript(videoId: sd.videoId, title: sd.title, owned: sd.owned)
            // Restore Lamport state — otherwise rev resets to 0 and Drive sync
            // re-pulls (and may overwrite) the just-restored local copy.
            script.rev = sd.rev ?? 0
            script.deviceId = sd.deviceId ?? ""
            context.insert(script)
            let ordered = sd.cues.sorted { $0.startTime < $1.startTime }
            for (i, cd) in ordered.enumerated() {
                let cue = ScriptCue(
                    id: cd.id,
                    startTime: cd.startTime,
                    duration: Self.derivedDuration(cues: ordered, index: i),
                    textJA: cd.textJA,
                    textEN: cd.textEN,
                    textVI: cd.textVI,
                    isDeleted: cd.isDeleted
                )
                cue.video = script
                context.insert(cue)
            }
        }
        for vd in snap.vocab {
            let v = Vocabulary(
                word: vd.word,
                reading: vd.reading,
                meaning: vd.meaning,
                jlptLevel: vd.jlptLevel,
                frequencyCount: vd.frequencyCount
            )
            v.savedAt = vd.savedAt
            context.insert(v)
        }
        try context.save()
    }

    private func decodeSnapshot(_ data: Data) throws -> Snapshot {
        let dec = JSONDecoder()
        dec.dateDecodingStrategy = .iso8601
        return try dec.decode(Snapshot.self, from: data)
    }

    private var lastAppliedUpdatedAt: Date? {
        let t = UserDefaults.standard.double(forKey: Self.lastAppliedKey)
        guard t > 0 else { return nil }
        return Date(timeIntervalSince1970: t)
    }

    private func rememberApplied(_ date: Date) {
        UserDefaults.standard.set(date.timeIntervalSince1970, forKey: Self.lastAppliedKey)
    }

    /// Shared with `DriveScriptsService` — one folder bookmark for the whole app.
    func resolveFolder() -> URL? {
        guard let data = UserDefaults.standard.data(forKey: Self.bookmarkKey) else { return nil }
        var stale = false
        guard let url = try? URL(
            resolvingBookmarkData: data,
            options: [],
            relativeTo: nil,
            bookmarkDataIsStale: &stale
        ) else { return nil }
        if stale, let fresh = try? url.bookmarkData(options: .minimalBookmark, includingResourceValuesForKeys: nil, relativeTo: nil) {
            UserDefaults.standard.set(fresh, forKey: Self.bookmarkKey)
        }
        return url
    }
}

extension ModelContext {
    /// Save then debounce Drive backup — call after every data mutation.
    @MainActor
    func saveAndScheduleBackup() {
        try? save()
        BackupService.shared.scheduleBackup(context: self)
        VocabSync.shared.schedulePush(context: self)
    }
}

// MARK: - Folder picker

/// Drive File Provider: folder Open is disabled — pick `cues.json` / `meta.json` / `script.txt`
/// inside a `<videoId>/` folder; normalize walks up to the sync root. `.folder` kept for
/// iCloud / On My iPad where folder Open still works.
struct BackupFolderPicker: UIViewControllerRepresentable {
    var onPick: (URL) -> Void

    func makeUIViewController(context: Context) -> UIDocumentPickerViewController {
        let types: [UTType] = [.json, .plainText, .text, .folder]
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: types, asCopy: false)
        picker.delegate = context.coordinator
        picker.allowsMultipleSelection = false
        return picker
    }

    func updateUIViewController(_ uiViewController: UIDocumentPickerViewController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(onPick: onPick) }

    final class Coordinator: NSObject, UIDocumentPickerDelegate {
        let onPick: (URL) -> Void
        init(onPick: @escaping (URL) -> Void) { self.onPick = onPick }

        func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
            guard let url = urls.first else { return }
            let pickedAccess = url.startAccessingSecurityScopedResource()
            defer { if pickedAccess { url.stopAccessingSecurityScopedResource() } }

            let isDir = (try? url.resourceValues(forKeys: [.isDirectoryKey]))?.isDirectory == true
            let folder = isDir ? url : url.deletingLastPathComponent()
            // Parent scope while the picked file scope is still held (Drive quirk).
            let folderAccess = !isDir && folder.startAccessingSecurityScopedResource()
            defer { if folderAccess { folder.stopAccessingSecurityScopedResource() } }
            // Normalize while scoped access is live so walk-up can list children.
            onPick(BackupService.normalizeSyncRoot(folder))
        }
    }
}

#if DEBUG
enum BackupSmoke {
    @MainActor
    static func run() {
        let at = Date(timeIntervalSince1970: 1_754_112_000)
        let cues: [BackupService.CueDTO] = [
            .init(id: "1", startTime: 0, duration: nil, textJA: "こんにちは", textEN: "Hi", textVI: "Xin chào", isDeleted: false),
            .init(id: "2", startTime: 1000, duration: nil, textJA: "世界", textEN: nil, textVI: nil, isDeleted: true),
        ]
        let snap = BackupService.Snapshot(
            updatedAt: at,
            scripts: [
                .init(videoId: "abc", title: "t", owned: true, rev: 7, deviceId: "ipad-smoke", cues: cues)
            ],
            vocab: [
                .init(word: "世界", reading: "せかい", meaning: "world", jlptLevel: 5, frequencyCount: 2, savedAt: Date(timeIntervalSince1970: 1_700_000_000))
            ]
        )
        let enc = JSONEncoder()
        enc.dateEncodingStrategy = .iso8601
        let data = try! enc.encode(snap)
        let json = String(data: data, encoding: .utf8)!
        assert(!json.contains("\"duration\""), "duration omitted on wire")
        assert(json.contains("updatedAt"), "updatedAt present")
        assert(json.contains("\"rev\":7"), "rev on wire")
        assert(json.contains("\"deviceId\":\"ipad-smoke\""), "deviceId on wire")
        let dec = JSONDecoder()
        dec.dateDecodingStrategy = .iso8601
        let round = try! dec.decode(BackupService.Snapshot.self, from: data)
        assert(round.version == 1, "version")
        assert(round.updatedAt == at, "updatedAt roundtrip")
        assert(round.scripts.count == 1 && round.scripts[0].cues.count == 2, "cue count")
        assert(round.scripts[0].rev == 7, "rev roundtrip")
        assert(round.scripts[0].deviceId == "ipad-smoke", "deviceId roundtrip")
        assert(round.scripts[0].cues[0].textJA == "こんにちは", "cue text")
        assert(round.scripts[0].cues[0].duration == nil, "duration nil after decode")
        assert(round.vocab.count == 1 && round.vocab[0].word == "世界", "vocab count")
        assert(abs(BackupService.derivedDuration(cues: cues, index: 0) - 1000) < 0.001, "derive next start")
        assert(abs(BackupService.derivedDuration(cues: cues, index: 1) - CueTiming.defaultDurMs) < 0.001, "last default dur")
        // Legacy wire with duration still decodes; apply ignores it.
        let legacy = #"{"version":1,"scripts":[{"videoId":"x","title":"t","owned":true,"cues":[{"id":"1","startTime":0,"duration":999,"textJA":"a","isDeleted":false}]}],"vocab":[]}"#.data(using: .utf8)!
        let old = try! dec.decode(BackupService.Snapshot.self, from: legacy)
        assert(old.scripts[0].cues[0].duration == 999, "legacy duration decoded")
        assert(old.scripts[0].rev == nil && old.scripts[0].deviceId == nil, "legacy rev/deviceId nil")
        assert(abs(BackupService.derivedDuration(cues: old.scripts[0].cues, index: 0) - CueTiming.defaultDurMs) < 0.001, "apply ignores wire duration")

        // Walk-up: …/YouTube JP Caption Studio/EiISOvl2_tQ/cues.json → sync root (not videoId).
        let tmp = FileManager.default.temporaryDirectory
            .appendingPathComponent("YouTube JP Caption Studio-\(UUID().uuidString)", isDirectory: true)
        let video = tmp.appendingPathComponent("EiISOvl2_tQ", isDirectory: true)
        try! FileManager.default.createDirectory(at: video, withIntermediateDirectories: true)
        try! Data("{}".utf8).write(to: video.appendingPathComponent("cues.json"))
        try! Data("{}".utf8).write(to: video.appendingPathComponent("meta.json"))
        try! Data("ja".utf8).write(to: video.appendingPathComponent("script.txt"))
        assert(BackupService.normalizeSyncRoot(video) == tmp, "video folder walks to root")
        assert(BackupService.normalizeSyncRoot(video.appendingPathComponent("cues.json")) == tmp, "cues.json → sync root")
        assert(BackupService.normalizeSyncRoot(video.appendingPathComponent("meta.json")) == tmp, "meta.json → sync root")
        assert(BackupService.normalizeSyncRoot(video.appendingPathComponent("script.txt")) == tmp, "script.txt → sync root")
        assert(BackupService.normalizeSyncRoot(tmp) == tmp, "sync root stays")
        try? FileManager.default.removeItem(at: tmp)

        print("[BackupSmoke] ok")
    }
}
#endif
