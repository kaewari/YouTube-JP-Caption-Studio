/**
 * macOS input-source switcher for the local bridge / native-messaging host.
 *
 * Usage:
 *   ime-select current
 *   ime-select list
 *   ime-select ax
 *   ime-select set <source-id>
 *
 * Why CGEvent Kana/Eisu:
 *   TISSelectInputSource from a background helper often updates the menu-bar
 *   icon but leaves Chromium typing in ABC (openradar #5021326444232704).
 *   Posting virtual keyCode 104 (Kana) / 102 (Eisu) updates the focused app's
 *   IMK session. Requires Accessibility once for this helper:
 *   System Settings → Privacy & Security → Accessibility → enable
 *   "ime-select" (or the Terminal/Python that launched it).
 *
 * Do NOT activate Chrome unless we can post HID — app.activate() can blur the
 * side-panel textarea and cancel JA edit before the first keystroke.
 */
import AppKit
import ApplicationServices
import Carbon
import Foundation

let kEisuKey: CGKeyCode = 102
let kKanaKey: CGKeyCode = 104

func sourceID(_ src: TISInputSource) -> String? {
  guard let raw = TISGetInputSourceProperty(src, kTISPropertyInputSourceID) else {
    return nil
  }
  return Unmanaged<CFString>.fromOpaque(raw).takeUnretainedValue() as String
}

func sourceCategory(_ src: TISInputSource) -> String? {
  guard let raw = TISGetInputSourceProperty(src, kTISPropertyInputSourceCategory) else {
    return nil
  }
  return Unmanaged<CFString>.fromOpaque(raw).takeUnretainedValue() as String
}

func isSelectable(_ src: TISInputSource) -> Bool {
  guard let raw = TISGetInputSourceProperty(src, kTISPropertyInputSourceIsSelectCapable) else {
    return false
  }
  return Unmanaged<CFBoolean>.fromOpaque(raw).takeUnretainedValue() == kCFBooleanTrue
}

func currentID() -> String {
  let src = TISCopyCurrentKeyboardInputSource().takeRetainedValue()
  return sourceID(src) ?? ""
}

func listSources() -> [String] {
  guard let cfList = TISCreateInputSourceList(nil, false)?.takeRetainedValue() as? [TISInputSource]
  else {
    return []
  }
  var out: [String] = []
  for src in cfList {
    guard isSelectable(src), let id = sourceID(src) else { continue }
    let cat = sourceCategory(src) ?? ""
    if cat == (kTISCategoryKeyboardInputSource as String) || cat.isEmpty {
      out.append(id)
    }
  }
  return out.sorted()
}

func isJapaneseID(_ id: String) -> Bool {
  let low = id.lowercased()
  return low.contains("japanese") || low.contains("kotoeri")
}

/// Prompt once if needed. Returns whether we may post HID events.
func ensureAccessibility(prompt: Bool) -> Bool {
  if AXIsProcessTrusted() { return true }
  if !prompt { return false }
  let opts = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
  return AXIsProcessTrustedWithOptions(opts)
}

func sendVirtualKey(_ keyCode: CGKeyCode) -> Bool {
  guard AXIsProcessTrusted() else { return false }
  let source = CGEventSource(stateID: .hidSystemState)
  let keyDown = CGEvent(keyboardEventSource: source, virtualKey: keyCode, keyDown: true)
  let keyUp = CGEvent(keyboardEventSource: source, virtualKey: keyCode, keyDown: false)
  keyDown?.flags = []
  keyUp?.flags = []
  // Prefer HID tap; session tap as fallback for some Chromium builds.
  keyDown?.post(tap: .cghidEventTap)
  keyUp?.post(tap: .cghidEventTap)
  usleep(8_000)
  keyDown?.post(tap: .cgSessionEventTap)
  keyUp?.post(tap: .cgSessionEventTap)
  return true
}

/// Bring Chrome/Chromium to front only when we are about to post Kana/Eisu.
func activateChromeIfPresent() {
  let names = ["Google Chrome", "Chromium", "Google Chrome Canary", "Brave Browser", "Microsoft Edge", "Arc"]
  let apps = NSWorkspace.shared.runningApplications
  for name in names {
    if let app = apps.first(where: { $0.localizedName == name }) {
      app.activate()
      return
    }
  }
}

func selectViaTIS(_ id: String) -> Bool {
  let filter = [kTISPropertyInputSourceID as String: id] as CFDictionary
  guard let cfList = TISCreateInputSourceList(filter, false)?.takeRetainedValue() as? [TISInputSource],
        let src = cfList.first
  else {
    return false
  }
  // Enable if disabled, then select (Hiragana input mode IDs are TISTypeKeyboardInputMode).
  TISEnableInputSource(src)
  let ok = TISSelectInputSource(src) == noErr
  // Second select after a beat — helps some IMK clients notice the change.
  usleep(15_000)
  _ = TISSelectInputSource(src)
  return ok
}

func selectID(_ id: String) -> (ok: Bool, ax: Bool, hid: Bool) {
  let ja = isJapaneseID(id)
  // Prompt for Accessibility so Kana/Eisu HID can reach Chrome.
  let ax = ensureAccessibility(prompt: true)
  let tisOk = selectViaTIS(id)

  var hidOk = false
  if ax {
    // Activate frontmost browser only when HID will actually post.
    activateChromeIfPresent()
    usleep(40_000)
    // TIS first, then Kana/Eisu twice — Chrome often ignores a single synthetic key.
    hidOk = sendVirtualKey(ja ? kKanaKey : kEisuKey)
    usleep(30_000)
    _ = sendVirtualKey(ja ? kKanaKey : kEisuKey)
    usleep(20_000)
    _ = selectViaTIS(id)
  }

  let cur = currentID()
  let matched: Bool
  if ja {
    matched = isJapaneseID(cur)
  } else {
    matched = !isJapaneseID(cur) || cur == id
  }
  // TIS success is enough for exit 0; without AX, Chrome may still type Latin
  // (openradar). Bridge/UI should surface needs_accessibility from stderr.
  return (ok: matched || tisOk, ax: ax, hid: hidOk)
}

let args = CommandLine.arguments
let cmd = args.count > 1 ? args[1] : "current"

switch cmd {
case "current":
  print(currentID())
  exit(0)
case "list":
  for id in listSources() {
    print(id)
  }
  exit(0)
case "ax":
  let trusted = AXIsProcessTrusted()
  print(trusted ? "trusted" : "denied")
  exit(trusted ? 0 : 1)
case "set":
  guard args.count > 2 else {
    fputs("usage: ime-select set <source-id>\n", stderr)
    exit(2)
  }
  let result = selectID(args[2])
  print(currentID())
  fputs("ax=\(result.ax ? 1 : 0) hid=\(result.hid ? 1 : 0) ok=\(result.ok ? 1 : 0)\n", stderr)
  if !result.ax && isJapaneseID(args[2]) {
    fputs(
      "needs_accessibility: enable ime-select in System Settings → Privacy & Security → Accessibility\n",
      stderr
    )
  }
  // Exit 0 if input source ID selected; AX warning is advisory (romaji fallback covers typing).
  exit(result.ok ? 0 : 1)
default:
  fputs("usage: ime-select current|list|ax|set <id>\n", stderr)
  exit(2)
}
