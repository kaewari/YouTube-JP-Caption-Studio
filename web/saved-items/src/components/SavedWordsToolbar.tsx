"use client";

import { SearchIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import {
  STATUS_ORDER,
  VOCAB_STATUS_META,
  type VocabStatus,
  type VocabStatusFilter,
} from "@/types/vocab";

interface SavedWordsToolbarProps {
  query: string;
  onQueryChange: (q: string) => void;
  filter: VocabStatusFilter;
  onFilterChange: (f: VocabStatusFilter) => void;
  counts: Record<VocabStatus | "all", number>;
}

export function SavedWordsToolbar({
  query,
  onQueryChange,
  filter,
  onFilterChange,
  counts,
}: SavedWordsToolbarProps) {
  return (
    <div className="flex w-full max-w-none flex-col gap-3 px-1 pt-4 sm:px-0">
      <div className="flex w-full flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onFilterChange("all")}
          className={cn(
            "inline-flex h-[30px] items-center gap-1.5 rounded-[15px] border-[1.5px] border-white/50 px-3 text-[13px] font-medium transition-colors",
            filter === "all"
              ? "bg-white text-[#111]"
              : "bg-transparent text-white/85 hover:bg-white/10",
          )}
        >
          Tất cả
          <span className="font-semibold tabular-nums">{counts.all}</span>
        </button>

        {STATUS_ORDER.map((status) => {
          const meta = VOCAB_STATUS_META[status];
          const on = filter === status;
          return (
            <button
              key={status}
              type="button"
              onClick={() => onFilterChange(status)}
              className={cn(
                "inline-flex h-[30px] items-center gap-1.5 rounded-[15px] border-[1.5px] px-3 text-[13px] font-medium transition-colors",
                on ? "text-[#111]" : "bg-transparent",
              )}
              style={{
                borderColor: meta.color,
                color: on ? "#111" : meta.color,
                background: on ? meta.color : "transparent",
              }}
            >
              {meta.label}
              <span className="font-semibold tabular-nums">{counts[status]}</span>
            </button>
          );
        })}

        {/* LR tag-color filters — not in extension yet */}
        <div
          className="ml-1 flex items-center gap-1 opacity-40"
          title="Tag màu LR — sắp có"
        >
          {["#38ad00", "#f1ff94", "#ff6658", "#67e6ff"].map((c) => (
            <button
              key={c}
              type="button"
              disabled
              className="size-[22px] cursor-not-allowed rounded-[3px] bg-white/10 text-[12px]"
              style={{ color: c }}
              aria-label="Tag màu — sắp có"
            >
              ◆
            </button>
          ))}
          <span className="pl-1 text-[11px] text-white/45">tag · sắp có</span>
        </div>
      </div>

      <div className="relative w-full max-w-none">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-white/40" />
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Tìm lemma / nghĩa / ngữ cảnh…"
          className="h-9 w-full rounded-md border border-white/15 bg-white/5 pr-3 pl-9 text-[14px] text-white outline-none placeholder:text-white/35 focus:border-[#9c40bf]/70"
        />
      </div>
    </div>
  );
}
