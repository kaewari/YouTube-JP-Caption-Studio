"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { ComingSoonPanel } from "@/components/ComingSoonPanel";
import { PageTabs } from "@/components/PageTabs";
import { SavedWordsList } from "@/components/SavedWordsList";
import { SavedWordsToolbar } from "@/components/SavedWordsToolbar";
import { SettingsPanel } from "@/components/SettingsPanel";
import { SideNav, type NavId } from "@/components/SideNav";
import { isExtensionPage } from "@/lib/chrome-env";
import {
  loadWordsAsync,
  persistWordsAsync,
  resetToMock,
  setWordStatus,
  subscribeVocab,
  type DataSource,
} from "@/lib/vocab-store";
import {
  STATUS_ORDER,
  type SavedItemsTab,
  type SavedWord,
  type VocabStatus,
  type VocabStatusFilter,
} from "@/types/vocab";

type AppView = Extract<NavId, "saved" | "settings">;

export function SavedItemsApp() {
  /** Sidebar open (labels visible) by default — collapsed on first render in the popup. */
  const [collapsed, setCollapsed] = useState(() => isExtensionPage());
  const isExt = useMemo(() => isExtensionPage(), []);
  const [view, setView] = useState<AppView>(() => {
    try {
      return new URLSearchParams(window.location.search).get("v") === "settings"
        ? "settings"
        : "saved";
    } catch {
      return "saved";
    }
  });
  const [tab, setTab] = useState<SavedItemsTab>("saved-words");
  const [words, setWords] = useState<SavedWord[]>([]);
  const wordsRef = useRef<SavedWord[]>([]);
  const persistChain = useRef<Promise<void>>(Promise.resolve());
  const [source, setSource] = useState<DataSource>("mock");
  const [note, setNote] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<VocabStatusFilter>("all");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    wordsRef.current = words;
  }, [words]);

  useEffect(() => {
    if (isExt) {
      document.documentElement.classList.add("hs-ext-popup");
    }
  }, [isExt]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await loadWordsAsync();
      if (cancelled) return;
      setWords(result.words);
      setSource(result.source);
      setNote(result.note);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return subscribeVocab((next, src) => {
      setWords(next);
      setSource(src);
      setNote(
        src === "chrome.storage"
          ? "Live · chrome.storage userVocab"
          : src === "bridge"
            ? "Live · bridge /extension_state"
            : "Đã cập nhật",
      );
    }, () => wordsRef.current);
  }, []);

  const counts = useMemo(() => {
    const base = {
      all: words.length,
      known: 0,
      learning: 0,
      ignored: 0,
      special: 0,
    } as Record<VocabStatus | "all", number>;
    for (const w of words) base[w.status] += 1;
    return base;
  }, [words]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return words
      .filter((w) => (filter === "all" ? true : w.status === filter))
      .filter((w) => {
        if (!q) return true;
        return [w.lemma, w.reading, w.glossVi, w.glossEn, w.contextJa]
          .filter(Boolean)
          .some((s) => String(s).toLowerCase().includes(q));
      })
      .sort((a, b) => {
        const ai = STATUS_ORDER.indexOf(a.status);
        const bi = STATUS_ORDER.indexOf(b.status);
        if (ai !== bi) return ai - bi;
        return b.updatedAt - a.updatedAt;
      });
  }, [words, filter, query]);

  function handleStatus(lemma: string, status: VocabStatus | null) {
    setWords((prev) => {
      const next = setWordStatus(prev, lemma, status);
      // Serialize writes — rapid clicks must persist in order, never out of date.
      persistChain.current = persistChain.current
        .then(() => persistWordsAsync(next))
        .then((src) => {
          setSource(src);
          setNote(
            src === "chrome.storage"
              ? "Đã ghi chrome.storage · userVocab"
              : "Đã lưu localStorage + bridge",
          );
        })
        .catch(() => {});
      return next;
    });
  }

  function handleReset() {
    const next = resetToMock();
    setWords(next);
    setSource("mock");
    setNote("Đã reset về dữ liệu demo.");
    setFilter("all");
    setQuery("");
  }

  function handleNavigate(id: NavId) {
    if (id === "saved" || id === "settings") setView(id);
  }

  return (
    <div className="hs-popup-root flex min-h-screen w-full max-w-none bg-[var(--background)] text-white">
      <SideNav
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        activeId={view}
        onNavigate={handleNavigate}
      />
      <div
        className="flex min-h-screen min-w-0 flex-1 flex-col transition-[padding] duration-200"
        style={{ paddingLeft: collapsed ? (isExt ? 52 : 64) : (isExt ? 160 : 240) }}
      >
        {view === "saved" && (
          <>
            <PageTabs tab={tab} onChange={setTab} />

            <main className="lri-SavedItems-wrap w-full max-w-none flex-1 px-3 pt-6 pb-28 sm:px-4">
              {tab === "saved-words" && (
                <>
                  <div className="mb-2 flex w-full flex-wrap items-center gap-2 px-1 text-[12px] text-white/40">
                    <span>
                      Nguồn: <code className="text-white/55">{source}</code>
                    </span>
                    <span className="hidden sm:inline">·</span>
                    <span className="min-w-0 flex-1 truncate">
                      {ready ? note : "Đang tải…"}
                    </span>
                    {!isExt && (
                      <button
                        type="button"
                        onClick={handleReset}
                        className="ml-auto rounded border border-white/15 px-2 py-0.5 text-[11px] text-white/55 hover:bg-white/8 hover:text-white/80"
                      >
                        Reset demo
                      </button>
                    )}
                  </div>
                  <SavedWordsToolbar
                    query={query}
                    onQueryChange={setQuery}
                    filter={filter}
                    onFilterChange={setFilter}
                    counts={counts}
                  />
                  <SavedWordsList words={visible} onStatus={handleStatus} />
                </>
              )}

              {tab === "vocabulary" && (
                <ComingSoonPanel
                  title="Tất cả từ (theo tần suất)"
                  description="Panel All Words kiểu Language Reactor — đánh dấu hàng loạt theo frequency catalog. Chưa có trong extension; giữ chỗ UI."
                />
              )}

              {tab === "saved-phrases" && (
                <ComingSoonPanel
                  title="Câu đã lưu"
                  description="Lưu câu / ngữ cảnh từ phụ đề (sao LR). Extension hiện chỉ lưu trạng thái lemma trong userVocab — câu sẽ thêm sau."
                />
              )}
            </main>
          </>
        )}

        {view === "settings" && (
          <main className="w-full max-w-none flex-1 px-3 pt-6 pb-28 sm:px-4">
            <SettingsPanel />
          </main>
        )}
      </div>
    </div>
  );
}
