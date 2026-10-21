"""Latency metrics collectors for local bridge."""

from __future__ import annotations

from collections import deque

# One sample series is the single source of truth: every recorded sample used
# to be appended to two deques, so the percentiles could only differ by the
# tail-window boundary.
_latencies: deque[float] = deque(maxlen=50)


def record_tokenize_latency(ms: float) -> None:
    _latencies.append(ms)


def p50_latency() -> float:
    if not _latencies:
        return 0.0
    s = sorted(_latencies)
    return s[len(s) // 2]


def p95_latency() -> float:
    if not _latencies:
        return 0.0
    s = sorted(_latencies)
    return s[min(len(s) - 1, int(len(s) * 0.95))]
