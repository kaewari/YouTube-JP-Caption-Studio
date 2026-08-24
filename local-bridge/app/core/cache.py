"""LRU cache for dictionary lookups."""

from __future__ import annotations

from collections import OrderedDict
from threading import Lock
from typing import Generic, TypeVar

T = TypeVar("T")


class LRUCache(Generic[T]):
    def __init__(self, capacity: int = 256) -> None:
        self.capacity = capacity
        self._data: OrderedDict[str, T] = OrderedDict()
        self._lock = Lock()
        self._hits = 0
        self._misses = 0

    def get(self, key: str) -> T | None:
        with self._lock:
            if key not in self._data:
                self._misses += 1
                return None
            self._hits += 1
            self._data.move_to_end(key)
            return self._data[key]

    def set(self, key: str, value: T) -> None:
        with self._lock:
            if key in self._data:
                self._data.move_to_end(key)
            self._data[key] = value
            while len(self._data) > self.capacity:
                self._data.popitem(last=False)

    def clear(self) -> None:
        with self._lock:
            self._data.clear()
            self._hits = 0
            self._misses = 0

    @property
    def hit_ratio(self) -> float:
        with self._lock:
            total = self._hits + self._misses
            return round(self._hits / total, 4) if total > 0 else 0.0


dict_cache: LRUCache[dict] = LRUCache(2048)
