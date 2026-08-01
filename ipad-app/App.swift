import SwiftUI
import SwiftData

@main
struct YouTubeJPCaptionStudioApp: App {
    init() {
        #if DEBUG
        SubtitleParserSmoke.run()
        LayoutSmoke.run()
        ImportSmoke.run()
        NLPTaggerSmoke.run()
        DictionarySmoke.run()
        BackupSmoke.run()
        #endif
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .modelContainer(for: [VideoScript.self, ScriptCue.self, Vocabulary.self])
    }
}
