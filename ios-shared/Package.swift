// swift-tools-version: 6.0
import PackageDescription

// Shared Swift between the iPad and iPhone apps (audit C-1). The two apps used
// to carry byte-identical copies of these files with a "MIRRORED FILE" header
// convention that failed repeatedly (B-6, B-10, B-11): one side got the fix,
// the other did not. One package, one copy.
let package = Package(
    name: "CaptionShared",
    platforms: [.iOS(.v17)],
    products: [
        .library(name: "CaptionShared", targets: ["CaptionShared"]),
    ],
    targets: [
        .target(
            name: "CaptionShared",
            path: "Sources/CaptionShared",
            // NOTE: no linkerSettings on purpose. DictionaryService (raw C sqlite3,
            // mutable singleton handle) stays app-local until a dedicated step proves
            // systemLibrary bridging across the Xcode matrix — see plan step C.
        ),
    ]
)
