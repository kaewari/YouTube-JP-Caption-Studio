import Foundation

struct Cue: Identifiable, Codable {
    let id: String
    let startTime: Double // milliseconds
    let duration: Double  // milliseconds
    let text: String
    var isDeleted: Bool = false
}

class SubtitleParser {
    
    /// Chuyển đổi payload JSON3 của YouTube thành danh sách Cue
    static func parseJSON3(payload: String) -> [Cue] {
        guard let data = payload.data(using: .utf8) else { return [] }
        var cues: [Cue] = []
        
        do {
            if let json = try JSONSerialization.jsonObject(with: data, options: []) as? [String: Any],
               let events = json["events"] as? [[String: Any]] {
                
                for event in events {
                    guard let tStartMs = event["tStartMs"] as? Int,
                          let dDurationMs = event["dDurationMs"] as? Int,
                          let segs = event["segs"] as? [[String: Any]] else {
                        continue
                    }
                    
                    var text = ""
                    for seg in segs {
                        if let utf8 = seg["utf8"] as? String {
                            text += utf8
                        }
                    }
                    
                    text = text.trimmingCharacters(in: .whitespacesAndNewlines)
                    if text.isEmpty || text == "\n" { continue }
                    
                    let cue = Cue(id: UUID().uuidString,
                                  startTime: Double(tStartMs),
                                  duration: Double(dDurationMs),
                                  text: text)
                    cues.append(cue)
                }
            }
        } catch {
            print("Error parsing JSON3: \(error)")
        }
        
        return cues
    }
}
