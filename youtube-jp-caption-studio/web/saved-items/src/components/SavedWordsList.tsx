"use client";

import { EmptyListIcon } from "@/components/icons";
import { VocabRow } from "@/components/VocabRow";
import type { SavedWord, VocabStatus } from "@/types/vocab";

interface SavedWordsListProps {
  words: SavedWord[];
  onStatus: (lemma: string, status: VocabStatus | null) => void;
}

export function SavedWordsList({ words, onStatus }: SavedWordsListProps) {
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

  return (
    <div className="mt-3 w-full max-w-none divide-y divide-white/6 px-0 pb-24">
      {words.map((w) => (
        <VocabRow key={w.lemma} word={w} onStatus={onStatus} />
      ))}
    </div>
  );
}
