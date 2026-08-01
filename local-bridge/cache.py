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

    def get(self, key: str) -> T | None:
        with self._lock:
            if key not in self._data:
                return None
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


dict_cache: LRUCache[dict] = LRUCache(2048)
