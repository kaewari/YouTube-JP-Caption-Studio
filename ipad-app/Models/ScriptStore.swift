import Foundation
import SwiftData

@Model
class VideoScript {
    @Attribute(.unique) var videoId: String
    var title: String
    var savedAt: Date
    
    // Relationship
    @Relationship(deleteRule: .cascade, inverse: \ScriptCue.video)
    var cues: [ScriptCue] = []
    
    init(videoId: String, title: String) {
        self.videoId = videoId
        self.title = title
        self.savedAt = Date()
    }
}

@Model
class ScriptCue {
    var id: String
    var startTime: Double
    var duration: Double
    var text: String
    var translation: String?
    var isDeleted: Bool // Tombstone flag
    
    var video: VideoScript?
    
    init(id: String, startTime: Double, duration: Double, text: String, translation: String? = nil, isDeleted: Bool = false) {
        self.id = id
        self.startTime = startTime
        self.duration = duration
        self.text = text
        self.translation = translation
        self.isDeleted = isDeleted
    }
}
