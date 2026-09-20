"use client";

import { useMemo, useState } from "react";
import { DownloadIcon, SearchIcon, TrashIcon } from "@/components/icons";
import type { SavedCue } from "@/types/vocab";
import { exportSavedCuesAnki } from "@/lib/vocab-store";

interface SavedCuesListProps {
  cues: SavedCue[];
  onDelete: (id: string) => void;
}

function formatTime(sec: number): string {
  const t = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function SavedCuesList({ cues, onDelete }: SavedCuesListProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cues;
    return cues.filter((c) => {
      return (
        (c.source && c.source.toLowerCase().includes(q)) ||
        (c.vi && c.vi.toLowerCase().includes(q)) ||
        (c.en && c.en.toLowerCase().includes(q)) ||
        (c.videoTitle && c.videoTitle.toLowerCase().includes(q))
      );
    });
  }, [cues, search]);

  return (
    <div className="flex w-full flex-col gap-4 pt-4">
      {/* Toolbar */}
      <div className="flex w-full flex-wrap items-center justify-between gap-3 px-1 sm:px-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-white/90">
            Câu đã lưu
          </span>
          <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[12px] font-semibold text-[#ffec8e]">
            {cues.length}
          </span>
        </div>

        {cues.length > 0 && (
          <button
            type="button"
            onClick={() => exportSavedCuesAnki(filtered)}
            className="inline-flex h-[30px] items-center gap-1.5 rounded-[15px] border border-white/20 bg-white/10 px-3 text-[12px] font-medium text-white transition-colors hover:bg-white/20"
            title="Xuất các câu đang hiển thị sang file Anki TSV"
          >
            <DownloadIcon className="size-3.5" />
            <span>Xuất Anki ({filtered.length})</span>
          </button>
        )}
      </div>

      {/* Search box */}
      <div className="relative w-full">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-white/40" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm câu tiếng Nhật / bản dịch / video…"
          className="h-9 w-full rounded-md border border-white/15 bg-white/5 pr-3 pl-9 text-[14px] text-white outline-none placeholder:text-white/35 focus:border-[#9c40bf]/70"
        />
      </div>

      {/* Cues List */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-white/15 py-12 text-center text-white/50">
          {cues.length === 0 ? (
            <p>Chưa có câu nào được lưu. Bấm dấu ★ trên Side Panel hoặc phím [S] trên video để lưu câu.</p>
          ) : (
            <p>Không tìm thấy câu nào khớp với từ khóa &ldquo;{search}&rdquo;.</p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((cue) => {
            const timeRange = `${formatTime(cue.startTime)} – ${formatTime(cue.endTime)}`;
            return (
              <div
                key={cue.id}
                className="group relative flex flex-col gap-2 rounded-lg border border-white/10 bg-[#1e2029]/70 p-3.5 transition-colors hover:border-white/25 hover:bg-[#232634]"
              >
                {/* Meta header */}
                <div className="flex items-center justify-between gap-2 text-[12px] text-white/40">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[11px] text-[#ffec8e]">
                      {timeRange}
                    </span>
                    {cue.videoTitle && (
                      <span className="truncate text-white/60" title={cue.videoTitle}>
                        {cue.videoTitle}
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => onDelete(cue.id)}
                    className="flex size-7 items-center justify-center rounded text-white/40 opacity-70 transition-all hover:bg-rose-500/20 hover:text-rose-300 group-hover:opacity-100"
                    title="Xóa câu đã lưu này"
                  >
                    <TrashIcon className="size-4" />
                  </button>
                </div>

                {/* Japanese text */}
                <div className="text-[16px] font-medium leading-relaxed text-[#f5f5f7]">
                  {cue.source}
                </div>

                {/* Vietnamese translation */}
                {cue.vi && (
                  <div className="flex items-start gap-1.5 text-[14px] text-[#a7d7b5]">
                    <span className="mt-0.5 rounded bg-[#38ad00]/20 px-1 text-[10px] font-bold text-[#86efac]">
                      VI
                    </span>
                    <span className="leading-snug">{cue.vi}</span>
                  </div>
                )}

                {/* English translation */}
                {cue.en && (
                  <div className="flex items-start gap-1.5 text-[13.5px] text-[#b8bdd0]">
                    <span className="mt-0.5 rounded bg-blue-500/20 px-1 text-[10px] font-bold text-[#93c5fd]">
                      EN
                    </span>
                    <span className="leading-snug">{cue.en}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
