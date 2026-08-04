import SwiftUI
import SwiftData
import AVFoundation

@main
struct YouTubeJPCaptionStudioApp: App {
    init() {
        try? AVAudioSession.sharedInstance().setCategory(.playback)
        try? AVAudioSession.sharedInstance().setActive(true)
        #if DEBUG
        DriveScriptsSmoke.run()
        DriveAPISmoke.run()
        SettingsSyncSmoke.run()
        VocabSyncSmoke.run()
        #endif
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .modelContainer(for: [VideoScript.self, ScriptCue.self, Vocabulary.self])
    }
}
