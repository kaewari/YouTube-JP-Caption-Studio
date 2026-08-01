import Foundation
import NaturalLanguage

struct Token {
    let surface: String
    let baseForm: String
    let pos: String // Part of speech
    let reading: String
}

class NLPTagger {
    
    /// Phân tích một chuỗi tiếng Nhật thành các Token (từ, từ loại, cách đọc)
    static func tokenize(text: String) -> [Token] {
        var tokens: [Token] = []
        
        let tagger = NLTagger(tagSchemes: [.lexicalClass])
        tagger.string = text
        
        let options: NLTagger.Options = [.omitWhitespace, .omitPunctuation]
        let range = text.startIndex..<text.endIndex
        
        tagger.enumerateTags(in: range, unit: .word, scheme: .lexicalClass, options: options) { tag, tokenRange in
            let surface = String(text[tokenRange])
            let pos = tag?.rawValue ?? "Unknown"
            
            // Lấy cách đọc bằng CFStringTokenizer (Furigana/Romaji)
            let reading = getReading(for: surface)
            
            // NLTagger không cung cấp baseForm dễ dàng cho tiếng Nhật, 
            // có thể cần dùng Apple's LinguisticTagger hoặc gọi MeCab nếu cần chính xác cao.
            // Tạm thời giả định baseForm = surface cho các từ không biến đổi.
            let baseForm = surface
            
            tokens.append(Token(surface: surface, baseForm: baseForm, pos: pos, reading: reading))
            
            return true
        }
        
        return tokens
    }
    
    /// Hàm hỗ trợ lấy cách đọc (Katakana/Hiragana) của một từ Hán Tự bằng CFStringTokenizer
    private static func getReading(for text: String) -> String {
        let locale = Locale(identifier: "ja_JP") as CFLocale
        let tokenizer = CFStringTokenizerCreate(kCFAllocatorDefault, text as CFString, CFRangeMake(0, text.utf16.count), kCFStringTokenizerUnitWord, locale)
        
        CFStringTokenizerAdvanceToNextToken(tokenizer)
        if let type = CFStringTokenizerCopyCurrentTokenAttribute(tokenizer, kCFStringTokenizerAttributeLatinTranscription) as? String {
            return type // Latin (Romaji)
        }
        return ""
    }
}
