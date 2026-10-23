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
            linkerSettings: [
                // DictionaryService reads dict.sqlite through the C API directly;
                // the iOS SDK ships the module, this links the library.
                .linkedLibrary("sqlite3"),
            ]
        ),
    ]
)
