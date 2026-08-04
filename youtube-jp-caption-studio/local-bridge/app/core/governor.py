"""Resource governor: caps from machine specs + runtime memory pressure."""

from __future__ import annotations

import os
import threading
import time
from dataclasses import dataclass, field

from app.schemas.models import Caps


@dataclass
class GovernorState:
    caps: Caps = field(default_factory=Caps)
    pressure: str = "low"
    process_rss_gb: float = 0.0
    free_ram_gb: float = 0.0
    hard_max_ocr: int = 3
    hard_max_mt: int = 3
    hard_max_in_flight: int = 4
    hard_max_fps: int = 12
    mem_budget_gb: float = 6.0
    _lock: threading.Lock = field(default_factory=threading.Lock)
    _stop: threading.Event = field(default_factory=threading.Event)
    _thread: threading.Thread | None = None
    _base_caps: Caps = field(default_factory=Caps)


def _detect_machine() -> tuple[int, float]:
    cpu = os.cpu_count() or 4
    mem_gb = 8.0
    try:
        import psutil

        mem_gb = psutil.virtual_memory().total / (1024**3)
    except Exception:
        pass
    return cpu, mem_gb


def compute_caps(cpu: int | None = None, mem_gb: float | None = None) -> Caps:
    if cpu is None or mem_gb is None:
        cpu, mem_gb = _detect_machine()
    # Tokenize/dict only — no OCR/MT worker pools.
    n = min(4, max(1, cpu // 4))
    fps = 10 if mem_gb >= 16 else 8
    return Caps(max_in_flight=n, max_fps=fps, w_ocr=0, w_mt=0)


class Governor:
    def __init__(self) -> None:
        cpu, mem_gb = _detect_machine()
        caps = compute_caps(cpu, mem_gb)
        self.state = GovernorState(
            caps=caps,
            _base_caps=Caps(**caps.model_dump()),
            mem_budget_gb=max(2.0, min(8.0, mem_gb * 0.30)),
        )
        self._active_jobs = 0
        self._jobs_lock = threading.Lock()

    def start(self) -> None:
        if self.state._thread and self.state._thread.is_alive():
            return
        self.state._stop.clear()
        self.state._thread = threading.Thread(target=self._pressure_loop, daemon=True)
        self.state._thread.start()

    def stop(self) -> None:
        self.state._stop.set()

    def _pressure_loop(self) -> None:
        while not self.state._stop.wait(2.0):
            self._refresh_pressure()

    def _refresh_pressure(self) -> None:
        free_gb = 8.0
        rss_gb = 0.0
        try:
            import psutil

            vm = psutil.virtual_memory()
            free_gb = vm.available / (1024**3)
            rss_gb = psutil.Process().memory_info().rss / (1024**3)
        except Exception:
            pass

        with self.state._lock:
            self.state.free_ram_gb = free_gb
            self.state.process_rss_gb = rss_gb
            high = free_gb < 3.0 or rss_gb > self.state.mem_budget_gb
            self.state.pressure = "high" if high else "low"
            base = self.state._base_caps
            if high:
                self.state.caps = Caps(
                    max_in_flight=max(1, base.max_in_flight - 1),
                    max_fps=max(6, base.max_fps - 2),
                    w_ocr=max(1, base.w_ocr - 1),
                    w_mt=max(1, base.w_mt - 1),
                )
            else:
                self.state.caps = Caps(**base.model_dump())

    def try_acquire(self) -> bool:
        with self._jobs_lock:
            if self._active_jobs >= self.state.caps.max_in_flight:
                return False
            self._active_jobs += 1
            return True

    def release(self) -> None:
        with self._jobs_lock:
            self._active_jobs = max(0, self._active_jobs - 1)

    def snapshot(self) -> dict:
        with self.state._lock:
            return {
                "caps": self.state.caps.model_dump(),
                "pressure": self.state.pressure,
                "process_rss_gb": round(self.state.process_rss_gb, 2),
                "free_ram_gb": round(self.state.free_ram_gb, 2),
                "active_jobs": self._active_jobs,
            }


governor = Governor()
