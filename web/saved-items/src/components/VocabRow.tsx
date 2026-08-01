"use client";

import { cn } from "@/lib/utils";
import {
  VOCAB_STATUS_META,
  type SavedWord,
  type VocabStatus,
} from "@/types/vocab";

interface VocabRowProps {
  word: SavedWord;
  onStatus: (lemma: string, status: VocabStatus | null) => void;
}

const MARKS: { id: VocabStatus | ""; label: string }[] = [
  { id: "known", label: "Đã biết" },
  { id: "learning", label: "Học" },
  { id: "ignored", label: "Đừng học" },
  { id: "special", label: "Đặc biệt" },
  { id: "", label: "Xóa" },
];

export function VocabRow({ word, onStatus }: VocabRowProps) {
  const color = VOCAB_STATUS_META[word.status].color;

  return (
    <article
      className="group flex w-full max-w-none flex-col gap-2 rounded-md border border-transparent px-3 py-3 transition-colors hover:border-white/8 hover:bg-white/[0.06] sm:flex-row sm:items-start sm:gap-4"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span
            className="text-[20px] font-medium text-white"
            style={{ textDecoration: `underline 2px ${color}` }}
          >
            {word.lemma}
          </span>
          {word.reading && (
            <span className="text-[13px] text-white/45">{word.reading}</span>
          )}
          {word.jlpt && (
            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[11px] uppercase text-white/55">
              {word.jlpt}
            </span>
          )}
          <span
            className="rounded px-1.5 py-0.5 text-[11px] font-medium"
            style={{
              color,
              background: `color-mix(in srgb, ${color} 18%, transparent)`,
            }}
          >
            {VOCAB_STATUS_META[word.status].label}
          </span>
        </div>
        <p className="mt-1 text-[14px] text-white/85">
          {word.glossVi || "—"}
          {word.glossEn && (
            <span className="text-white/45"> · {word.glossEn}</span>
          )}
        </p>
        {word.contextJa && (
          <p className="mt-1 text-[13px] text-white/40">{word.contextJa}</p>
        )}
        {word.videoTitle && (
          <p className="mt-0.5 text-[12px] text-white/30">{word.videoTitle}</p>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap gap-1 sm:justify-end">
        {MARKS.map((m) => {
          const active = m.id !== "" && word.status === m.id;
          const accent =
            m.id && m.id in VOCAB_STATUS_META
              ? VOCAB_STATUS_META[m.id as VocabStatus].color
              : undefined;
          return (
            <button
              key={m.label}
              type="button"
              onClick={() => onStatus(word.lemma, m.id || null)}
              className={cn(
                "rounded border px-2 py-1 text-[12px] transition-colors",
                active
                  ? "border-transparent text-[#111]"
                  : "border-white/15 bg-[#2a2a3a] text-[#ddd] hover:bg-[#3a3a50]",
              )}
              style={
                active && accent
                  ? { background: accent, borderColor: accent }
                  : undefined
              }
            >
              {m.label}
            </button>
          );
        })}
      </div>
    </article>
  );
}
