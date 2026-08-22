import AppKit
import Foundation
import SwiftUI

enum AppIconArt {
    /// Same art as iPad/iPhone AppIcon — bundled as MenuIcon.png (64²).
    static var menuBar: NSImage? {
        guard let url = Bundle.main.url(forResource: "MenuIcon", withExtension: "png"),
              let img = NSImage(contentsOf: url)
        else { return nil }
        img.size = NSSize(width: 18, height: 18)
        return img
    }
}

@main
struct CaptionStudioBridgeApp: App {
    @StateObject private var bridge = BridgeController()

    var body: some Scene {
        MenuBarExtra {
            BridgeMenu(bridge: bridge)
        } label: {
            if let icon = AppIconArt.menuBar {
                Image(nsImage: icon)
                    .opacity(bridge.isReady ? 1 : 0.45)
                    .accessibilityLabel(bridge.statusLabel)
            } else {
                Label(
                    bridge.statusLabel,
                    systemImage: bridge.isReady ? "captions.bubble.fill" : "captions.bubble"
                )
            }
        }
        .menuBarExtraStyle(.menu)
    }
}

struct BridgeMenu: View {
    @ObservedObject var bridge: BridgeController

    var body: some View {
        Text(bridge.statusDetail)
            .font(.headline)
        Divider()
        Button("Mở Bridge Docs") {
            bridge.openURL("http://127.0.0.1:8765/docs")
        }
        .disabled(!bridge.isReady)
        Button("Mở Saved Items") {
            bridge.openURL("http://127.0.0.1:3000")
        }
        Divider()
        Button(bridge.isRunning ? "Khởi động lại" : "Bắt đầu") {
            bridge.restart()
        }
        Button("Mở thư mục log") {
            bridge.revealLogs()
        }
        Divider()
        Button("Thoát") {
            bridge.stop()
            NSApplication.shared.terminate(nil)
        }
    }
}

@MainActor
final class BridgeController: ObservableObject {
    @Published private(set) var isRunning = false
    @Published private(set) var isReady = false
    @Published private(set) var statusDetail = "Đang tìm local-bridge…"

    private var process: Process?
    /// True only while this app owns the bridge — gates the port sweep in stop().
    private var bridgeProcessOwned = false
    private var healthTimer: Timer?
    private let bridgeRoot: URL?
    private let logURL: URL

    var statusLabel: String {
        if isReady { return "Bridge OK" }
        if isRunning { return "Bridge…" }
        return "Bridge off"
    }

    init() {
        bridgeRoot = Self.resolveBridgeRoot()
        if let root = bridgeRoot {
            logURL = root.appendingPathComponent(".bridge-app.log")
            statusDetail = "Đang khởi động…"
            start()
        } else {
            logURL = FileManager.default.temporaryDirectory.appendingPathComponent("bridge-app.log")
            statusDetail = "Không tìm thấy local-bridge/start.sh"
        }
        NotificationCenter.default.addObserver(
            forName: NSApplication.willTerminateNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.stop() }
        }
    }

    func start() {
        guard let root = bridgeRoot else { return }
        stop()

        let startSh = root.appendingPathComponent("start.sh")
        guard FileManager.default.isExecutableFile(atPath: startSh.path)
            || FileManager.default.fileExists(atPath: startSh.path)
        else {
            statusDetail = "Thiếu start.sh trong \(root.path)"
            return
        }

        FileManager.default.createFile(atPath: logURL.path, contents: nil)
        let logHandle = try? FileHandle(forWritingTo: logURL)
        _ = try? logHandle?.seekToEnd()

        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: "/bin/bash")
        proc.arguments = [startSh.path]
        proc.currentDirectoryURL = root
        proc.standardOutput = logHandle
        proc.standardError = logHandle
        // Fresh process group so we can SIGTERM the whole tree (uvicorn + saved-items).
        proc.qualityOfService = .userInitiated

        do {
            try proc.run()
            process = proc
            bridgeProcessOwned = true
            isRunning = true
            statusDetail = "Đang khởi động bridge…"
            startHealthPoll()
        } catch {
            statusDetail = "Lỗi chạy start.sh: \(error.localizedDescription)"
            isRunning = false
        }
    }

    func stop() {
        healthTimer?.invalidate()
        healthTimer = nil

        if let proc = process, proc.isRunning {
            let pid = proc.processIdentifier
            // Kill the bash process AND its children (uvicorn, saved-items) — plain
            // kill(pid) leaves the tree running.
            let tree = Process()
            tree.executableURL = URL(fileURLWithPath: "/bin/pkill")
            tree.arguments = ["-TERM", "-P", String(pid)]
            try? tree.run()
            tree.waitUntilExit()
            kill(pid, SIGTERM)
            DispatchQueue.global().asyncAfter(deadline: .now() + 0.4) {
                kill(pid, SIGKILL)
            }
            // Port sweep only when this app started the bridge — never kill a
            // process another tool (or the user's Terminal) owns.
            if bridgeProcessOwned {
                Self.killPort(8765)
                Self.killPort(3000)
            }
        }
        bridgeProcessOwned = false
        process = nil
        if let root = bridgeRoot {
            let savedPid = root.appendingPathComponent(".saved-items.pid")
            if let text = try? String(contentsOf: savedPid, encoding: .utf8),
               let child = Int32(text.trimmingCharacters(in: .whitespacesAndNewlines)) {
                kill(child, SIGTERM)
                try? FileManager.default.removeItem(at: savedPid)
            }
        }
        isRunning = false
        isReady = false
        statusDetail = "Đã dừng"
    }

    func restart() {
        stop()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            self?.start()
        }
    }

    func openURL(_ string: String) {
        guard let url = URL(string: string) else { return }
        NSWorkspace.shared.open(url)
    }

    func revealLogs() {
        NSWorkspace.shared.activateFileViewerSelecting([logURL])
    }

    private func startHealthPoll() {
        healthTimer?.invalidate()
        healthTimer = Timer.scheduledTimer(withTimeInterval: 1.5, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.pollHealth()
            }
        }
        if let t = healthTimer {
            RunLoop.main.add(t, forMode: .common)
        }
        pollHealth()
    }

    private func pollHealth() {
        if let proc = process, !proc.isRunning {
            isRunning = false
            isReady = false
            statusDetail = "Bridge đã thoát (xem log)"
            healthTimer?.invalidate()
            healthTimer = nil
            return
        }

        guard let url = URL(string: "http://127.0.0.1:8765/health") else { return }
        var req = URLRequest(url: url, timeoutInterval: 1.2)
        req.httpMethod = "GET"
        URLSession.shared.dataTask(with: req) { [weak self] data, response, _ in
            Task { @MainActor in
                guard let self else { return }
                let code = (response as? HTTPURLResponse)?.statusCode ?? 0
                guard code == 200, let data,
                      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
                else {
                    if self.isRunning {
                        self.isReady = false
                        self.statusDetail = "Đang chờ /health…"
                    }
                    return
                }
                let ready = json["ready"] as? Bool ?? false
                self.isReady = ready
                self.isRunning = true
                self.statusDetail = ready
                    ? "Bridge sẵn sàng · http://127.0.0.1:8765"
                    : "Bridge chạy · đang bootstrap…"
            }
        }.resume()
    }

    private static func killPort(_ port: Int) {
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/bin/bash")
        task.arguments = ["-c", "lsof -ti TCP:\(port) -sTCP:LISTEN | xargs kill -TERM 2>/dev/null || true"]
        try? task.run()
        task.waitUntilExit()
    }

    private static func resolveBridgeRoot() -> URL? {
        let fm = FileManager.default
        var candidates: [URL] = []

        if let res = Bundle.main.url(forResource: "bridge_root", withExtension: "txt"),
           let text = try? String(contentsOf: res, encoding: .utf8) {
            let path = text.trimmingCharacters(in: .whitespacesAndNewlines)
            if !path.isEmpty {
                candidates.append(URL(fileURLWithPath: path))
            }
        }

        let appURL = Bundle.main.bundleURL
        // dist/Caption Studio Bridge.app → ../local-bridge
        // macos-bridge-app/dist/... → ../../local-bridge
        candidates.append(contentsOf: [
            appURL.deletingLastPathComponent().appendingPathComponent("local-bridge"),
            appURL.deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("local-bridge"),
            appURL.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
                .appendingPathComponent("local-bridge"),
        ])

        // Common clone location (this machine / default docs path).
        let home = fm.homeDirectoryForCurrentUser
        candidates.append(
            home
                .appendingPathComponent("Documents/YouTube JP Caption Studio/local-bridge")
        )

        for url in candidates {
            let start = url.appendingPathComponent("start.sh")
            if fm.fileExists(atPath: start.path) {
                return url
            }
        }
        return nil
    }
}
