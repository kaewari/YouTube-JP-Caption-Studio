import SwiftUI

/// Wrapping row of tappable JA tokens (furigana + JLPT colors).
struct TokenizedJAView: View {
    let text: String
    var fontSize: CGFloat = 22
    var weight: Font.Weight = .bold
    var showFurigana: Bool = true
    var centered: Bool = false
    /// Soft outline for video / dark bars (skip on light side-panel).
    var shadowed: Bool = false
    var onTapToken: (Token) -> Void

    private var tokens: [Token] { NLPTagger.tokenize(text) }

    var body: some View {
        FlowLayout(alignment: centered ? .center : .leading, spacing: 0) {
            ForEach(tokens) { tok in
                tokenLabel(tok)
                    .contentShape(Rectangle())
                    .onTapGesture { onTapToken(tok) }
            }
        }
    }

    @ViewBuilder
    private func tokenLabel(_ tok: Token) -> some View {
        let color = VocabStyle.color(for: tok) ?? (shadowed ? Color.white : Color.primary)
        let surface = Text(tok.surface)
            .font(.system(size: fontSize, weight: weight))
            .foregroundStyle(color)

        Group {
            if showFurigana, !tok.reading.isEmpty, tok.isContentWord {
                VStack(spacing: max(1, fontSize * 0.08)) {
                    Text(tok.reading)
                        .font(.system(size: max(11, fontSize * 0.5), weight: .semibold))
                        .foregroundStyle(color)
                        .lineLimit(1)
                        .minimumScaleFactor(0.45)
                    surface
                }
            } else {
                surface
            }
        }
        .shadow(color: shadowed ? .black.opacity(0.95) : .clear, radius: shadowed ? 1.2 : 0, y: shadowed ? 0.5 : 0)
    }
}

/// Minimal wrap layout (no Dependency).
struct FlowLayout: Layout {
    var alignment: HorizontalAlignment = .leading
    var spacing: CGFloat = 0

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = arrange(proposal: proposal, subviews: subviews)
        let w = proposal.width ?? rows.map(\.width).max() ?? 0
        return CGSize(width: w, height: rows.last.map { $0.y + $0.height } ?? 0)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let rows = arrange(proposal: ProposedViewSize(width: bounds.width, height: proposal.height), subviews: subviews)
        for row in rows {
            let x0: CGFloat = {
                switch alignment {
                case .center: return bounds.minX + (bounds.width - row.width) / 2
                case .trailing: return bounds.maxX - row.width
                default: return bounds.minX
                }
            }()
            // Bottom-align so surface kanji share a baseline (furigana tokens are taller).
            for item in row.items {
                subviews[item.index].place(
                    at: CGPoint(x: x0 + item.x, y: bounds.minY + row.y + row.height - item.size.height),
                    proposal: ProposedViewSize(item.size)
                )
            }
        }
    }

    private struct Row {
        var y: CGFloat
        var height: CGFloat
        var width: CGFloat
        var items: [(index: Int, x: CGFloat, size: CGSize)]
    }

    private func arrange(proposal: ProposedViewSize, subviews: Subviews) -> [Row] {
        let maxW = proposal.width ?? .infinity
        var rows: [Row] = []
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowH: CGFloat = 0
        var items: [(index: Int, x: CGFloat, size: CGSize)] = []

        func flush() {
            guard !items.isEmpty else { return }
            rows.append(Row(y: y, height: rowH, width: x, items: items))
            y += rowH
            x = 0
            rowH = 0
            items = []
        }

        for (i, sub) in subviews.enumerated() {
            let size = sub.sizeThatFits(.unspecified)
            if x + size.width > maxW, !items.isEmpty { flush() }
            items.append((i, x, size))
            x += size.width + spacing
            rowH = max(rowH, size.height)
        }
        flush()
        return rows
    }
}
