import sys
import time
import ctypes

cg = ctypes.cdll.LoadLibrary('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics')
cf = ctypes.cdll.LoadLibrary('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation')

class CGPoint(ctypes.Structure):
    _fields_ = [('x', ctypes.c_double), ('y', ctypes.c_double)]

cg.CGEventCreateMouseEvent.restype = ctypes.c_void_p
cg.CGEventCreateMouseEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint32, CGPoint, ctypes.c_uint32]
cg.CGEventPost.restype = None
cg.CGEventPost.argtypes = [ctypes.c_uint32, ctypes.c_void_p]
cg.CGEventSetIntegerValueField.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.c_int64]
cf.CFRelease.argtypes = [ctypes.c_void_p]

# Event types
kCGEventLeftMouseDown = 1
kCGEventLeftMouseUp = 2
kCGEventMouseMoved = 5
kCGEventLeftMouseDragged = 6
kCGMouseButtonLeft = 0
kCGHIDEventTap = 0
kCGMouseEventClickState = 1

def move(x, y):
    pt = CGPoint(x, y)
    ev = cg.CGEventCreateMouseEvent(None, kCGEventMouseMoved, pt, kCGMouseButtonLeft)
    cg.CGEventPost(kCGHIDEventTap, ev)
    cf.CFRelease(ev)

def click(x, y):
    pt = CGPoint(x, y)
    move(x, y)
    time.sleep(0.05)
    
    down = cg.CGEventCreateMouseEvent(None, kCGEventLeftMouseDown, pt, kCGMouseButtonLeft)
    cg.CGEventSetIntegerValueField(down, kCGMouseEventClickState, 1)
    cg.CGEventPost(kCGHIDEventTap, down)
    cf.CFRelease(down)
    time.sleep(0.05)
    
    up = cg.CGEventCreateMouseEvent(None, kCGEventLeftMouseUp, pt, kCGMouseButtonLeft)
    cg.CGEventSetIntegerValueField(up, kCGMouseEventClickState, 1)
    cg.CGEventPost(kCGHIDEventTap, up)
    cf.CFRelease(up)
    print(f"Native Mouse CLICK at ({x}, {y})")

def dblclick(x, y):
    pt = CGPoint(x, y)
    move(x, y)
    time.sleep(0.05)
    
    # 1st click
    down1 = cg.CGEventCreateMouseEvent(None, kCGEventLeftMouseDown, pt, kCGMouseButtonLeft)
    cg.CGEventSetIntegerValueField(down1, kCGMouseEventClickState, 1)
    cg.CGEventPost(kCGHIDEventTap, down1)
    cf.CFRelease(down1)
    time.sleep(0.04)
    
    up1 = cg.CGEventCreateMouseEvent(None, kCGEventLeftMouseUp, pt, kCGMouseButtonLeft)
    cg.CGEventSetIntegerValueField(up1, kCGMouseEventClickState, 1)
    cg.CGEventPost(kCGHIDEventTap, up1)
    cf.CFRelease(up1)
    time.sleep(0.06)
    
    # 2nd click
    down2 = cg.CGEventCreateMouseEvent(None, kCGEventLeftMouseDown, pt, kCGMouseButtonLeft)
    cg.CGEventSetIntegerValueField(down2, kCGMouseEventClickState, 2)
    cg.CGEventPost(kCGHIDEventTap, down2)
    cf.CFRelease(down2)
    time.sleep(0.04)
    
    up2 = cg.CGEventCreateMouseEvent(None, kCGEventLeftMouseUp, pt, kCGMouseButtonLeft)
    cg.CGEventSetIntegerValueField(up2, kCGMouseEventClickState, 2)
    cg.CGEventPost(kCGHIDEventTap, up2)
    cf.CFRelease(up2)
    print(f"Native Mouse DBLCLICK at ({x}, {y})")

def drag(x1, y1, x2, y2):
    pt1 = CGPoint(x1, y1)
    pt2 = CGPoint(x2, y2)
    move(x1, y1)
    time.sleep(0.05)
    
    down = cg.CGEventCreateMouseEvent(None, kCGEventLeftMouseDown, pt1, kCGMouseButtonLeft)
    cg.CGEventPost(kCGHIDEventTap, down)
    cf.CFRelease(down)
    time.sleep(0.08)
    
    steps = 15
    for i in range(1, steps + 1):
        cx = x1 + (x2 - x1) * i / steps
        cy = y1 + (y2 - y1) * i / steps
        pt = CGPoint(cx, cy)
        d = cg.CGEventCreateMouseEvent(None, kCGEventLeftMouseDragged, pt, kCGMouseButtonLeft)
        cg.CGEventPost(kCGHIDEventTap, d)
        cf.CFRelease(d)
        time.sleep(0.015)
    
    up = cg.CGEventCreateMouseEvent(None, kCGEventLeftMouseUp, pt2, kCGMouseButtonLeft)
    cg.CGEventPost(kCGHIDEventTap, up)
    cf.CFRelease(up)
    print(f"Native Mouse DRAG from ({x1}, {y1}) to ({x2}, {y2})")

def hold(x, y, duration=1.0):
    pt = CGPoint(x, y)
    move(x, y)
    time.sleep(0.05)
    
    down = cg.CGEventCreateMouseEvent(None, kCGEventLeftMouseDown, pt, kCGMouseButtonLeft)
    cg.CGEventSetIntegerValueField(down, kCGMouseEventClickState, 1)
    cg.CGEventPost(kCGHIDEventTap, down)
    cf.CFRelease(down)
    print(f"Native Mouse HOLD DOWN at ({x}, {y}) for {duration}s")
    time.sleep(duration)
    
    up = cg.CGEventCreateMouseEvent(None, kCGEventLeftMouseUp, pt, kCGMouseButtonLeft)
    cg.CGEventSetIntegerValueField(up, kCGMouseEventClickState, 1)
    cg.CGEventPost(kCGHIDEventTap, up)
    cf.CFRelease(up)
    print(f"Native Mouse RELEASE at ({x}, {y})")

def hover(x, y, duration=1.0):
    pt = CGPoint(x, y)
    move(x, y)
    print(f"Native Mouse HOVER at ({x}, {y}) for {duration}s")
    steps = int(duration / 0.1)
    for _ in range(max(1, steps)):
        ev = cg.CGEventCreateMouseEvent(None, kCGEventMouseMoved, pt, kCGMouseButtonLeft)
        cg.CGEventPost(kCGHIDEventTap, ev)
        cf.CFRelease(ev)
        time.sleep(0.1)

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: mouse.py <click|dblclick|move|drag|hold|hover> <x> <y> [x2/dur y2]")
        sys.exit(1)
    act = sys.argv[1]
    x = float(sys.argv[2])
    y = float(sys.argv[3])
    if act == "click":
        click(x, y)
    elif act == "dblclick":
        dblclick(x, y)
    elif act == "move":
        move(x, y)
    elif act == "drag":
        x2 = float(sys.argv[4])
        y2 = float(sys.argv[5])
        drag(x, y, x2, y2)
    elif act == "hold":
        dur = float(sys.argv[4]) if len(sys.argv) > 4 else 1.0
        hold(x, y, dur)
    elif act == "hover":
        dur = float(sys.argv[4]) if len(sys.argv) > 4 else 1.0
        hover(x, y, dur)
