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

    /// Upsert by unique `word`: update + bump `frequencyCount` on hit, insert on miss.
    /// Blind `insert` of a duplicate makes `save()` throw on the unique constraint —
    /// and `saveAndScheduleBackup` swallows it, so the word silently never persists.
    @MainActor
    static func upsert(word: String, reading: String, meaning: String, jlptLevel: Int? = nil, context: ModelContext) -> Vocabulary {
        let descriptor = FetchDescriptor<Vocabulary>(predicate: #Predicate { $0.word == word })
        if let existing = try? context.fetch(descriptor).first {
            existing.reading = reading
            existing.meaning = meaning
            if let jlptLevel { existing.jlptLevel = jlptLevel }
            existing.frequencyCount += 1
            existing.savedAt = Date()
            return existing
        }
        let v = Vocabulary(word: word, reading: reading, meaning: meaning, jlptLevel: jlptLevel)
        context.insert(v)
        return v
    }
}
