import SwiftUI

/// Dark pill toolbar matching extension side panel.
struct SidePanelToolbar: View {
    var overlayOn: Bool
    var onReload: () -> Void
    var onAddCue: () -> Void
    var onToggleOverlay: () -> Void
    var onClearTranslations: () -> Void
    var onWipeScript: () -> Void
    var onExport: () -> Void
    var onImport: () -> Void
    var onSettings: () -> Void

    private let accent = Color(red: 0.48, green: 0.28, blue: 0.85)

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                toolButton("Reload", action: onReload)
                toolButton("+ Cue", action: onAddCue)
                toolButton("Overlay", active: overlayOn, action: onToggleOverlay)
                toolButton("Xóa dịch", action: onClearTranslations)
                toolButton("Xóa sub", action: onWipeScript)
                toolButton("Export", action: onExport)
                toolButton("Import", action: onImport)
                Button(action: onSettings) {
                    Image(systemName: "gearshape.fill")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.white)
                        .frame(width: 32, height: 28)
                        .background(Color(white: 0.22), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }
        .background(Color.black)
    }

    private func toolButton(_ title: String, active: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.white)
                .padding(.horizontal, 12)
                .padding(.vertical, 7)
                .background(
                    active ? accent : Color(white: 0.22),
                    in: RoundedRectangle(cornerRadius: 8, style: .continuous)
                )
        }
        .buttonStyle(.plain)
    }
}

struct SidePanelSettingsSheet: View {
    @AppStorage("hardsubOverlayOn") var overlayOn = true
    @AppStorage("sidePanelOn") var sidePanelOn = true
    @AppStorage("hardsubShowJA") var showJA = true
    @AppStorage("hardsubShowEN") var showEN = false
    @AppStorage("hardsubShowVI") var showVI = false
    @AppStorage("hardsubBarScale") var overlayFontScale = 1.0
    @AppStorage("sidePanelFontScale") var sidePanelFontScale = 1.0
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section("Hiển thị") {
                    Toggle("Overlay", isOn: $overlayOn)
                    Toggle("Side panel", isOn: $sidePanelOn)
                    Toggle("Hiện JA", isOn: $showJA)
                    Toggle("Hiện EN", isOn: $showEN)
                    Toggle("Hiện VI", isOn: $showVI)
                }
                Section("Cỡ chữ") {
                    Stepper(value: $overlayFontScale, in: 0.55...2.4, step: 0.1) {
                        Text("Overlay \(String(format: "%.1f", overlayFontScale))×")
                    }
                    Stepper(value: $sidePanelFontScale, in: 0.7...1.8, step: 0.1) {
                        Text("Side panel \(String(format: "%.1f", sidePanelFontScale))×")
                    }
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Xong") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium])
    }
}
