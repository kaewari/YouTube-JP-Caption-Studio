"""Latency metrics collectors for local bridge."""

from __future__ import annotations

from collections import deque

_latencies: deque[float] = deque(maxlen=50)
_batch_latencies: deque[float] = deque(maxlen=50)


def record_tokenize_latency(ms: float) -> None:
    _latencies.append(ms)
    _batch_latencies.append(ms)


def p50_latency() -> float:
    if not _latencies:
        return 0.0
    s = sorted(_latencies)
    return s[len(s) // 2]


def p95_latency() -> float:
    if not _batch_latencies:
        return 0.0
    s = sorted(_batch_latencies)
    return s[min(len(s) - 1, int(len(s) * 0.95))]
