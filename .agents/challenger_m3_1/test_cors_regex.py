"""Empirical test harness for local-bridge CORS origin regex."""

import re

# Exact regex from main.py line 55
CORS_REGEX = re.compile(r"^chrome-extension://.*|^http://(localhost|127\.0\.0\.1)(:\d+)?$")

# Stricter recommended regex for comparison
STRICT_CORS_REGEX = re.compile(r"^(chrome-extension://[a-p]{32}|http://(localhost|127\.0\.0\.1)(:\d+)?)$")

def run_tests():
    print("--- Testing CORS Origin Regex ---")
    
    valid_origins = [
        ("chrome-extension://nkbihfbeogaeaoehlefnkodbefgpgknn", "Standard Chrome Extension ID"),
        ("chrome-extension://abcdefghijklmnopqrstuvwxyzabcdef", "32-char lowercase extension ID"),
        ("http://localhost", "Localhost default port"),
        ("http://127.0.0.1", "127.0.0.1 default port"),
        ("http://localhost:8765", "Localhost bridge port"),
        ("http://127.0.0.1:8765", "127.0.0.1 bridge port"),
        ("http://localhost:3000", "Localhost dev frontend"),
        ("http://127.0.0.1:5173", "127.0.0.1 Vite port"),
    ]

    invalid_origins = [
        ("http://localhost.attacker.com", "Subdomain hijack attempt on localhost"),
        ("http://127.0.0.1.attacker.com", "Subdomain hijack attempt on 127.0.0.1"),
        ("http://attacker.com", "External domain"),
        ("https://localhost", "HTTPS localhost (if unexpected)"),
        ("https://127.0.0.1", "HTTPS 127.0.0.1"),
        ("http://localhost:abc", "Invalid non-numeric port"),
        ("http://localhost:8765.attacker.com", "Port suffix hijack attempt"),
        ("chrome-extension-fake://foo", "Fake extension scheme"),
        ("https://chrome-extension://foo", "Prepended scheme attack"),
        ("null", "Null origin from iframe / file"),
        ("file://", "File scheme origin"),
        ("http://evil-localhost.com", "Prefix match attempt"),
    ]

    # Oversized / Malicious Extension IDs (Over-permissive wildcard test)
    overpermissive_origins = [
        ("chrome-extension://malicious.website.com", "URL in extension host part"),
        ("chrome-extension://", "Empty extension ID"),
        ("chrome-extension://too_short", "Short non-standard extension ID"),
        ("chrome-extension://../../etc/passwd", "Path traversal in extension ID"),
        ("chrome-extension://<script>alert(1)</script>", "XSS injection in extension ID"),
    ]

    print("\n--- 1. Valid Origins Check ---")
    valid_pass = True
    for origin, desc in valid_origins:
        match = bool(CORS_REGEX.match(origin))
        status = "PASS" if match else "FAIL"
        if not match: valid_pass = False
        print(f"[{status}] {origin!r} ({desc}) -> Matched: {match}")

    print("\n--- 2. Invalid / Bypass Origins Check ---")
    invalid_pass = True
    for origin, desc in invalid_origins:
        match = bool(CORS_REGEX.match(origin))
        status = "PASS" if not match else "FAIL (SECURITY RISKS!)"
        if match: invalid_pass = False
        print(f"[{status}] {origin!r} ({desc}) -> Matched: {match}")

    print("\n--- 3. Over-Permissive Wildcard Extension IDs Check ---")
    for origin, desc in overpermissive_origins:
        match = bool(CORS_REGEX.match(origin))
        strict_match = bool(STRICT_CORS_REGEX.match(origin))
        print(f"[INFO] {origin!r} ({desc}) -> Current Match: {match} | Strict Match: {strict_match}")

    print("\n--- Summary ---")
    print(f"Valid origins accepted: {valid_pass}")
    print(f"Invalid origins rejected: {invalid_pass}")

if __name__ == "__main__":
    run_tests()
