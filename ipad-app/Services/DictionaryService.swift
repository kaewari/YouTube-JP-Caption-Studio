import Foundation
// import GRDB // Requires GRDB package via Swift Package Manager

/// Lớp xử lý kết nối tới Database JMdict SQLite được đóng gói sẵn trong App Bundle
class DictionaryService {
    static let shared = DictionaryService()
    
    // private var dbQueue: DatabaseQueue?
    
    private init() {
        setupDatabase()
    }
    
    private func setupDatabase() {
        // Tìm file jmdict.db trong Bundle của App
        guard let dbPath = Bundle.main.path(forResource: "jmdict", ofType: "db") else {
            print("[DictionaryService] Could not find jmdict.db in app bundle.")
            return
        }
        
        do {
            // Khởi tạo kết nối tới Database (Chỉ đọc - ReadOnly vì bundle không cho phép ghi)
            // dbQueue = try DatabaseQueue(path: dbPath)
            print("[DictionaryService] Connected to bundled jmdict.db at \(dbPath)")
        } catch {
            print("[DictionaryService] Failed to connect to database: \(error)")
        }
    }
    
    /// Hàm mẫu tìm kiếm từ vựng tiếng Nhật
    func searchWord(_ word: String) -> [String] {
        // guard let dbQueue = dbQueue else { return [] }
        
        var results: [String] = []
        
        /*
        do {
            try dbQueue.read { db in
                // Mẫu câu truy vấn tìm từ vựng trong JMdict
                let rows = try Row.fetchAll(db, sql: "SELECT sense, reading FROM entries WHERE keb = ? OR reb = ?", arguments: [word, word])
                for row in rows {
                    let sense: String = row["sense"]
                    let reading: String = row["reading"]
                    results.append("[\(reading)] \(sense)")
                }
            }
        } catch {
            print("[DictionaryService] Query failed: \(error)")
        }
        */
        
        return results
    }
}
