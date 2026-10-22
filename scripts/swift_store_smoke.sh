#!/usr/bin/env bash
# Runs the Swift store self-test (BackupSmoke) headlessly on macOS.
#
# Why: `BackupSmoke.run()` is the only proof for the snapshot encode/apply/merge
# path, but it lives behind `#if DEBUG` inside the iOS app and can only run on a
# device. This compiles the *same* sources for macOS (the iOS-only folder-picker
# UI is stripped — it has no macOS counterpart) and runs the asserts here.
#
# Usage: scripts/swift_store_smoke.sh [ipad-app|iphone-app]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="${1:-ipad-app}"
APP_DIR="$ROOT/$APP"
[ -f "$APP_DIR/Services/BackupService.swift" ] || { echo "no such app: $APP" >&2; exit 2; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Strip the UIDocumentPicker UIViewControllerRepresentable (iOS-only, absent on macOS)
# and the failure-injection block: SwiftData's in-memory store does not enforce the
# unique constraint on macOS, so "a duplicate videoId must fail the apply" cannot hold
# there. That assert still runs on iOS inside the app.
awk '
  /^\/\/ MARK: - Folder picker/ { skip = 1 }
  skip == 1 && /^#if DEBUG/ { skip = 0 }
  /^        \/\/ A failing apply must not wipe the store:/ { print "#if !os(macOS)"; fail = 1 }
  fail == 1 && /"failed apply rolls back/ { print; print "#endif"; fail = 0; next }
  skip == 0 { print }
' "$APP_DIR/Services/BackupService.swift" > "$TMP/BackupService.swift"

# VocabSync pulls in the iOS-only OAuth plumbing; stub the one call the
# snapshot path makes.
cat > "$TMP/stubs.swift" <<'SW'
import Foundation
import SwiftData

enum VocabSync {
    static let shared = Stub()
    final class Stub {
        func schedulePush(context: ModelContext) {}
    }
}
SW

cat > "$TMP/main.swift" <<'SW'
import Foundation
MainActor.assumeIsolated {
    BackupSmoke.run()
    ScriptStoreSmoke.run()
}
print("swift_store_smoke: ok")
SW

swiftc -swift-version 5 -Onone -D DEBUG \
  -target "$(uname -m)-apple-macosx14.0" \
  -o "$TMP/smoke" \
  "$TMP/main.swift" \
  "$TMP/stubs.swift" \
  "$TMP/BackupService.swift" \
  "$APP_DIR/Models/ScriptStore.swift" \
  "$APP_DIR/Models/VocabStore.swift" \
  "$APP_DIR/Services/SubtitleParser.swift" \
  "$APP_DIR/Services/NLPTagger.swift" \
  "$APP_DIR/Services/FreqService.swift"

"$TMP/smoke"
