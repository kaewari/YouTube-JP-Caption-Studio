"use client";

import type { ReactNode } from "react";

import { BookmarkIcon, SavedListIcon, StarIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { SavedItemsTab } from "@/types/vocab";

interface PageTabsProps {
  tab: SavedItemsTab;
  onChange: (tab: SavedItemsTab) => void;
}

const TABS: {
  id: SavedItemsTab;
  label: string;
  icon: ReactNode;
  soon?: boolean;
}[] = [
  {
    id: "vocabulary",
    label: "Từ vựng",
    icon: <SavedListIcon />,
    soon: true,
  },
  {
    id: "saved-words",
    label: "Từ đã lưu",
    icon: <BookmarkIcon />,
  },
  {
    id: "saved-phrases",
    label: "Câu đã lưu",
    icon: <StarIcon />,
    soon: true,
  },
];

export function PageTabs({ tab, onChange }: PageTabsProps) {
  return (
    <header className="sticky top-0 z-30 w-full max-w-none border-b border-white/8 bg-[color-mix(in_srgb,#1a1c1f_92%,transparent)] backdrop-blur-sm">
      <div className="flex h-12 w-full items-center gap-1 px-3">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange(t.id)}
              className={cn(
                "relative flex h-10 items-center gap-2 rounded-t-md px-3 text-[14px] transition-colors",
                active
                  ? "bg-white/[0.09] text-white"
                  : "text-white/55 hover:bg-white/5 hover:text-white/85",
              )}
            >
              <span
                className={cn(
                  "PageTabs-icon",
                  active ? "text-[#ffec8e]" : "text-white/60",
                )}
              >
                {t.icon}
              </span>
              <span>{t.label}</span>
              {t.soon && (
                <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/45">
                  sắp có
                </span>
              )}
              {active && (
                <span className="absolute inset-x-2 -bottom-px h-0.5 rounded bg-[#9c40bf]" />
              )}
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-1 text-white/40">
          <span className="hidden text-[12px] sm:inline">
            JA → VI · extension vocab
          </span>
        </div>
      </div>
    </header>
  );
}
