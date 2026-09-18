
import AppKit

let point = CGPoint(x: 800, y: 635) // logical coords for Errors button
let down = CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: point, mouseButton: .left)
let up = CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: point, mouseButton: .left)
down?.post(tap: .cghidEventTap)
usleep(50000)
up?.post(tap: .cghidEventTap)
print("Clicked at \(point)")
