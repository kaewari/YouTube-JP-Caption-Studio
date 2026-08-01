import Foundation
import SwiftData

@Model
class Vocabulary {
    @Attribute(.unique) var word: String
    var reading: String
    var meaning: String
    var jlptLevel: Int?
    var frequencyCount: Int
    var savedAt: Date
    
    init(word: String, reading: String, meaning: String, jlptLevel: Int? = nil, frequencyCount: Int = 1) {
        self.word = word
        self.reading = reading
        self.meaning = meaning
        self.jlptLevel = jlptLevel
        self.frequencyCount = frequencyCount
        self.savedAt = Date()
    }
}
