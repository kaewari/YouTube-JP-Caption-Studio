import Foundation
import SwiftData
import SwiftUI
import UniformTypeIdentifiers

/// JSON snapshot of scripts + vocab → user-picked folder (Google Drive via Files).
///
/// First-run (physical iPad — you must do this yourself):
/// 1. Open `YouTubeJPCaptionStudio.xcodeproj`, select your iPad, Automatic Signing + Team.
/// 2. ⌘R once; on iPad: Settings → General → VPN & Device Management → Trust.
/// 3. In app: Chọn thư mục → Files → Google Drive → folder; then edits auto-backup.
@MainActor
final class BackupService: ObservableObject {
    static let shared = BackupService()
    static let fileName = "caption-studio-backup.json"
    private static let bookmarkKey = "backupFolderBookmark"
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
        var scripts: [ScriptDTO]
        var vocab: [VocabDTO]
    }

    struct ScriptDTO: Codable, Equatable {
        var videoId: String
        var title: String
        var owned: Bool
        var cues: [CueDTO]
    }

    struct CueDTO: Codable, Equatable {
        var id: String
        var startTime: Double
        var duration: Double
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
            let dec = JSONDecoder()
            dec.dateDecodingStrategy = .iso8601
            let snap = try dec.decode(Snapshot.self, from: data)
            try apply(snap, to: context)
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

    func setFolder(_ url: URL) {
        do {
            let data = try url.bookmarkData(options: .minimalBookmark, includingResourceValuesForKeys: nil, relativeTo: nil)
            UserDefaults.standard.set(data, forKey: Self.bookmarkKey)
            hasFolder = true
            status = "Thư mục: \(url.lastPathComponent)"
        } catch {
            status = "Bookmark lỗi: \(error.localizedDescription)"
        }
    }

    // MARK: - Encode / apply

    func encodeSnapshot(context: ModelContext) throws -> Snapshot {
        let scripts = try context.fetch(FetchDescriptor<VideoScript>())
        let vocab = try context.fetch(FetchDescriptor<Vocabulary>())
        return Snapshot(
            scripts: scripts.map { s in
                ScriptDTO(
                    videoId: s.videoId,
                    title: s.title,
                    owned: s.owned,
                    cues: (s.cues).map { c in
                        CueDTO(
                            id: c.id,
                            startTime: c.startTime,
                            duration: c.duration,
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

    private func apply(_ snap: Snapshot, to context: ModelContext) throws {
        for s in (try context.fetch(FetchDescriptor<VideoScript>())) { context.delete(s) }
        for v in (try context.fetch(FetchDescriptor<Vocabulary>())) { context.delete(v) }
        try context.save()

        for sd in snap.scripts {
            let script = VideoScript(videoId: sd.videoId, title: sd.title, owned: sd.owned)
            context.insert(script)
            for cd in sd.cues {
                let cue = ScriptCue(
                    id: cd.id,
                    startTime: cd.startTime,
                    duration: cd.duration,
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

    private func resolveFolder() -> URL? {
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
    }
}

// MARK: - Folder picker

struct BackupFolderPicker: UIViewControllerRepresentable {
    var onPick: (URL) -> Void

    func makeUIViewController(context: Context) -> UIDocumentPickerViewController {
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.folder], asCopy: false)
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
            let access = url.startAccessingSecurityScopedResource()
            defer { if access { url.stopAccessingSecurityScopedResource() } }
            onPick(url)
        }
    }
}

#if DEBUG
enum BackupSmoke {
    static func run() {
        let snap = BackupService.Snapshot(
            scripts: [
                .init(
                    videoId: "abc",
                    title: "t",
                    owned: true,
                    cues: [
                        .init(id: "1", startTime: 0, duration: 1000, textJA: "こんにちは", textEN: "Hi", textVI: "Xin chào", isDeleted: false),
                        .init(id: "2", startTime: 1000, duration: 500, textJA: "世界", textEN: nil, textVI: nil, isDeleted: true),
                    ]
                )
            ],
            vocab: [
                .init(word: "世界", reading: "せかい", meaning: "world", jlptLevel: 5, frequencyCount: 2, savedAt: Date(timeIntervalSince1970: 1_700_000_000))
            ]
        )
        let enc = JSONEncoder()
        enc.dateEncodingStrategy = .iso8601
        let data = try! enc.encode(snap)
        let dec = JSONDecoder()
        dec.dateDecodingStrategy = .iso8601
        let round = try! dec.decode(BackupService.Snapshot.self, from: data)
        assert(round.version == 1, "version")
        assert(round.scripts.count == 1 && round.scripts[0].cues.count == 2, "cue count")
        assert(round.scripts[0].cues[0].textJA == "こんにちは", "cue text")
        assert(round.vocab.count == 1 && round.vocab[0].word == "世界", "vocab count")
        print("[BackupSmoke] ok")
    }
}
#endif
