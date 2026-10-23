"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { EmptyListIcon } from "@/components/icons";
import { VocabRow } from "@/components/VocabRow";
import { initialVisibleCount, nextVisibleCount } from "@/lib/incremental-list";
import type { SavedWord, VocabStatus } from "@/types/vocab";

interface SavedWordsListProps {
  words: SavedWord[];
  onStatus: (lemma: string, status: VocabStatus | null) => void;
}

/**
 * Renders a window of rows instead of the whole library: 5 000 words used to be
 * 5 000 DOM rows before the first paint. A sentinel below the list grows the
 * window as the user scrolls, and "Hiện tất cả" is the explicit escape hatch
 * (also what keyboard/screen-reader users get).
 */
export function SavedWordsList({ words, onStatus }: SavedWordsListProps) {
  const [visible, setVisible] = useState(() => initialVisibleCount(words.length));
  const sentinel = useRef<HTMLDivElement | null>(null);

  // A new filter/search result starts from the top again.
  useEffect(() => {
    setVisible(initialVisibleCount(words.length));
  }, [words]);

  const grow = useCallback(() => {
    setVisible((current) => nextVisibleCount(current, words.length));
  }, [words.length]);

  useEffect(() => {
    if (visible >= words.length) return;
    const node = sentinel.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) grow();
      },
      { rootMargin: "600px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [grow, visible, words.length]);

  if (!words.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-4 py-20 text-center">
        <EmptyListIcon />
        <p className="text-[15px] text-white/55">
          Không có từ nào khớp bộ lọc.
        </p>
        <p className="max-w-sm text-[13px] text-white/35">
          Đánh dấu từ trong dict popup của extension (Đã biết / Học / Đừng học /
          Đặc biệt) — trang này sẽ đọc `userVocab` khi bridge sẵn sàng.
        </p>
      </div>
    );
  }

  const shown = Math.min(visible, words.length);

  return (
    <div className="mt-3 w-full max-w-none divide-y divide-white/6 px-0 pb-24">
      {words.slice(0, shown).map((w) => (
        <VocabRow key={w.lemma} word={w} onStatus={onStatus} />
      ))}
      {shown < words.length && (
        <div className="flex flex-col items-center gap-2 py-4">
          <button
            type="button"
            onClick={() => setVisible(words.length)}
            className="rounded-md border border-white/15 px-3 py-1.5 text-[12px] text-white/70 hover:bg-white/10 hover:text-white"
          >
            Hiện tất cả ({words.length - shown} còn lại)
          </button>
          <div ref={sentinel} aria-hidden="true" className="h-px w-full" />
        </div>
      )}
    </div>
  );
}
