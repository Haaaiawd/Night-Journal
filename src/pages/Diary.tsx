import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "framer-motion";
import {
  Filter,
  Check,
  BookOpen,
  ChevronRight,
  FileText,
} from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { format, isToday, isThisWeek, isThisMonth, parseISO } from "date-fns";
import { zhCN } from "date-fns/locale";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

type TimeRange = "all" | "today" | "week" | "month";
type StatusFilter = "generated" | "generating" | "draft";
type StyleFilter = string;

interface FilterState {
  timeRange: TimeRange;
  statuses: StatusFilter[];
  styles: StyleFilter[];
}

const EASE_PRIMARY = [0.25, 0.1, 0.25, 1] as [number, number, number, number];

/* ------------------------------------------------------------------ */
/*  Helper: map generationStatus → design status                     */
/* ------------------------------------------------------------------ */

function mapStatus(diary: {
  generationStatus: string | null;
  title: string | null;
  content: string | null;
}): "generating" | "generated" | "draft" {
  if (diary.generationStatus === "pending") return "generating";
  if (diary.title && diary.content) return "generated";
  if (diary.generationStatus === "failed") return "draft";
  return diary.title || diary.content ? "generated" : "draft";
}

/* ------------------------------------------------------------------ */
/*  Date helpers                                                      */
/* ------------------------------------------------------------------ */

function formatDiaryDate(dateStr: string | Date): string {
  const d = typeof dateStr === "string" ? parseISO(dateStr) : dateStr;
  return format(d, "M月d日 EEEE", { locale: zhCN });
}

function diaryDateToYMD(dateStr: string | Date): string {
  const d = typeof dateStr === "string" ? parseISO(dateStr) : dateStr;
  return format(d, "yyyy-MM-dd");
}

function matchesTimeRange(dateStr: string | Date, range: TimeRange): boolean {
  const d = typeof dateStr === "string" ? parseISO(dateStr) : dateStr;
  switch (range) {
    case "today":
      return isToday(d);
    case "week":
      return isThisWeek(d, { weekStartsOn: 1 });
    case "month":
      return isThisMonth(d);
    default:
      return true;
  }
}

/* ------------------------------------------------------------------ */
/*  Status chip                                                       */
/* ------------------------------------------------------------------ */

function StatusChip({ status }: { status: "generating" | "generated" | "draft" }) {
  if (status === "generating") {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
        style={{ backgroundColor: "var(--accent-soft)", color: "var(--accent)" }}
        aria-label="生成状态：正在生成"
      >
        <span className="relative flex h-2 w-2">
          <span
            className="absolute inline-flex h-full w-full animate-pulse-dot rounded-full"
            style={{ backgroundColor: "var(--accent)" }}
          />
          <span
            className="relative inline-flex h-2 w-2 rounded-full"
            style={{ backgroundColor: "var(--accent)" }}
          />
        </span>
        生成中...
      </span>
    );
  }

  if (status === "generated") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
        style={{ backgroundColor: "rgba(107,143,113,0.12)", color: "var(--success)" }}
        aria-label="生成状态：已生成"
      >
        <Check size={14} strokeWidth={2.5} />
        已生成
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ backgroundColor: "rgba(158,152,146,0.12)", color: "var(--text-tertiary)" }}
      aria-label="生成状态：草稿"
    >
      <FileText size={14} strokeWidth={2} />
      草稿
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Skeleton card                                                     */
/* ------------------------------------------------------------------ */

function SkeletonCard() {
  return (
    <div
      className="animate-skeleton-pulse rounded-2xl p-5"
      style={{ backgroundColor: "var(--bg-surface)" }}
      aria-hidden="true"
    >
      <div className="flex items-center justify-between">
        <div className="h-4 w-24 rounded-md" style={{ backgroundColor: "var(--divider)" }} />
        <div className="h-6 w-16 rounded-full" style={{ backgroundColor: "var(--divider)" }} />
      </div>
      <div className="mt-3 h-5 w-3/4 rounded-md" style={{ backgroundColor: "var(--divider)" }} />
      <div className="mt-2 h-4 w-full rounded-md" style={{ backgroundColor: "var(--divider)" }} />
      <div className="mt-1.5 h-4 w-5/6 rounded-md" style={{ backgroundColor: "var(--divider)" }} />
      <div className="mt-1.5 h-4 w-4/6 rounded-md" style={{ backgroundColor: "var(--divider)" }} />
      <div className="mt-3 h-3 w-20 rounded-md" style={{ backgroundColor: "var(--divider)" }} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Empty state                                                       */
/* ------------------------------------------------------------------ */

function EmptyState() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center px-6 py-20">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, damping: 25, type: "spring" }}
      >
        <BookOpen
          size={80}
          strokeWidth={1}
          style={{ color: "var(--text-tertiary)" }}
        />
      </motion.div>
      <motion.p
        className="mt-6 text-center font-body text-base"
        style={{ color: "var(--text-secondary)" }}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.35, ease: EASE_PRIMARY }}
      >
        还没有日记
      </motion.p>
      <motion.p
        className="mt-2 text-center font-ui text-xs"
        style={{ color: "var(--text-tertiary)" }}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.16, duration: 0.35, ease: EASE_PRIMARY }}
      >
        先去记录页留下一些碎片吧
      </motion.p>
      <motion.button
        className="mt-8 inline-flex items-center gap-1 rounded-lg px-5 py-2.5 font-ui text-sm font-medium"
        style={{ color: "var(--accent)" }}
        onClick={() => navigate("/")}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.22, duration: 0.35, ease: EASE_PRIMARY }}
        whileTap={{ scale: 0.96 }}
      >
        去记录
        <ChevronRight size={16} />
      </motion.button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Filter drawer (Vaul)                                              */
/* ------------------------------------------------------------------ */

import { Drawer } from "vaul";

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "month", label: "本月" },
  { value: "week", label: "本周" },
  { value: "today", label: "今天" },
];

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "generated", label: "已生成" },
  { value: "generating", label: "生成中" },
  { value: "draft", label: "草稿" },
];

const STYLE_OPTIONS = [
  "温柔真实",
  "文学感",
  "克制冷静",
  "情绪充沛",
  "写给未来",
  "清醒冷漠",
];

function FilterDrawer({
  open,
  onClose,
  filters,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  filters: FilterState;
  onApply: (f: FilterState) => void;
}) {
  const [local, setLocal] = useState<FilterState>(filters);

  useEffect(() => {
    if (open) setLocal(filters);
  }, [open, filters]);

  const toggleStatus = (s: StatusFilter) =>
    setLocal((prev) => ({
      ...prev,
      statuses: prev.statuses.includes(s)
        ? prev.statuses.filter((x) => x !== s)
        : [...prev.statuses, s],
    }));

  const toggleStyle = (s: string) =>
    setLocal((prev) => ({
      ...prev,
      styles: prev.styles.includes(s)
        ? prev.styles.filter((x) => x !== s)
        : [...prev.styles, s],
    }));

  const handleReset = () =>
    setLocal({ timeRange: "all", statuses: [], styles: [] });

  return (
    <Drawer.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay
          className="fixed inset-0 z-overlay"
          style={{ backgroundColor: "rgba(0,0,0,0.3)" }}
          onClick={onClose}
        />
        <Drawer.Content
          className="fixed bottom-0 left-0 right-0 z-drawer mx-auto flex max-h-[50vh] max-w-[480px] flex-col rounded-t-3xl outline-none"
          style={{ backgroundColor: "var(--bg-elevated)" }}
        >
          {/* Handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div
              className="h-1 w-10 rounded-full"
              style={{ backgroundColor: "var(--divider)" }}
            />
          </div>

          <div className="flex-1 overflow-y-auto px-5 pb-8 pt-2">
            {/* Time range */}
            <p
              className="mb-3 font-ui text-sm font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              时间范围
            </p>
            <div className="flex gap-2">
              {TIME_RANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() =>
                    setLocal((p) => ({ ...p, timeRange: opt.value }))
                  }
                  className="flex-1 rounded-xl py-2.5 text-center font-ui text-sm font-medium transition-colors"
                  style={{
                    backgroundColor:
                      local.timeRange === opt.value
                        ? "var(--accent-soft)"
                        : "var(--bg-surface)",
                    color:
                      local.timeRange === opt.value
                        ? "var(--accent)"
                        : "var(--text-secondary)",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Status */}
            <p
              className="mb-3 mt-6 font-ui text-sm font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              生成状态
            </p>
            <div className="flex flex-wrap gap-2.5">
              {STATUS_OPTIONS.map((opt) => {
                const active = local.statuses.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    onClick={() => toggleStatus(opt.value)}
                    className="flex items-center gap-2 rounded-xl px-4 py-2.5 font-ui text-sm transition-colors"
                    style={{
                      backgroundColor: active
                        ? "var(--accent-soft)"
                        : "var(--bg-surface)",
                      color: active
                        ? "var(--accent)"
                        : "var(--text-secondary)",
                    }}
                  >
                    <div
                      className="flex h-4 w-4 items-center justify-center rounded border"
                      style={{
                        borderColor: active
                          ? "var(--accent)"
                          : "var(--divider)",
                        backgroundColor: active
                          ? "var(--accent)"
                          : "transparent",
                      }}
                    >
                      {active && <Check size={10} strokeWidth={3} className="text-white" />}
                    </div>
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {/* Style */}
            <p
              className="mb-3 mt-6 font-ui text-sm font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              日记风格
            </p>
            <div className="flex flex-wrap gap-2">
              {STYLE_OPTIONS.map((s) => {
                const active = local.styles.includes(s);
                return (
                  <button
                    key={s}
                    onClick={() => toggleStyle(s)}
                    className="rounded-full px-4 py-2 font-ui text-sm transition-colors"
                    style={{
                      backgroundColor: active
                        ? "var(--accent-soft)"
                        : "var(--bg-surface)",
                      color: active
                        ? "var(--accent)"
                        : "var(--text-secondary)",
                    }}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Footer */}
          <div
            className="flex items-center gap-3 border-t px-5 py-4"
            style={{ borderColor: "var(--divider)" }}
          >
            <button
              onClick={handleReset}
              className="rounded-xl px-5 py-3 font-ui text-sm font-medium"
              style={{ color: "var(--text-tertiary)" }}
            >
              重置
            </button>
            <button
              onClick={() => {
                onApply(local);
                onClose();
              }}
              className="flex-1 rounded-xl py-3 font-ui text-sm font-medium text-white"
              style={{ backgroundColor: "var(--accent)" }}
            >
              应用
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

/* ------------------------------------------------------------------ */
/*  Fragment count badge (uses entries.list per date)                */
/* ------------------------------------------------------------------ */

function FragmentCountBadge({ date }: { date: string }) {
  const { data: entries } = trpc.entries.list.useQuery(
    { date: diaryDateToYMD(date) },
    { staleTime: 60_000 },
  );

  const count = entries?.length ?? 0;
  if (count === 0) return null;

  return (
    <span className="mt-3 inline-block font-ui text-xs" style={{ color: "var(--text-tertiary)" }}>
      来自 {count} 个碎片
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Diary card                                                        */
/* ------------------------------------------------------------------ */

function DiaryCard({
  diary,
  index,
}: {
  diary: {
    id: number;
    diaryDate: string | Date;
    title: string | null;
    summary: string | null;
    content: string | null;
    generationStatus: string | null;
    style: string | null;
  };
  index: number;
}) {
  const navigate = useNavigate();
  const status = mapStatus(diary);
  const dateStr = diaryDateToYMD(diary.diaryDate);

  return (
    <motion.article
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        delay: index * 0.06,
        ease: EASE_PRIMARY,
      }}
      className="cursor-pointer rounded-2xl p-5 transition-colors active:scale-[0.98]"
      style={{
        backgroundColor: "var(--bg-surface)",
        boxShadow:
          "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)",
      }}
      onClick={() => navigate(`/diary/${dateStr}`)}
      whileTap={{ scale: 0.98, backgroundColor: "var(--accent-soft)" }}
      aria-labelledby={`diary-title-${diary.id}`}
    >
      {/* Date row + status */}
      <div className="flex items-center justify-between">
        <span
          className="font-ui text-[15px] font-medium"
          style={{ color: "var(--text-primary)" }}
        >
          {formatDiaryDate(diary.diaryDate)}
        </span>
        <StatusChip status={status} />
      </div>

      {/* Title */}
      <h3
        id={`diary-title-${diary.id}`}
        className="mt-3 font-display text-lg line-clamp-2"
        style={{ color: "var(--text-primary)", lineHeight: 1.4 }}
      >
        {diary.title ?? "无标题日记"}
      </h3>

      {/* Excerpt */}
      <p
        className="mt-2 font-body text-[15px] line-clamp-3"
        style={{ color: "var(--text-secondary)", lineHeight: 1.75 }}
      >
        {diary.summary ?? diary.content ?? ""}
      </p>

      {/* Fragment count */}
      <FragmentCountBadge date={dateStr} />
    </motion.article>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Diary page                                                   */
/* ------------------------------------------------------------------ */

export default function Diary() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  /* Filter state */
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    timeRange: "all",
    statuses: [],
    styles: [],
  });

  /* Pagination */
  const [allDiaries, setAllDiaries] = useState<
    Array<{
      id: number;
      diaryDate: string | Date;
      title: string | null;
      summary: string | null;
      content: string | null;
      generationStatus: string | null;
      style: string | null;
    }>
  >([]);

  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const limit = 20;
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  /* Auth gate */
  if (!authLoading && !isAuthenticated) {
    return (
      <div
        className="flex min-h-[100dvh] flex-col items-center justify-center px-6"
        style={{ color: "var(--text-secondary)" }}
      >
        <BookOpen size={64} strokeWidth={1} style={{ color: "var(--text-tertiary)" }} />
        <p className="mt-4 font-display text-lg">请先登录</p>
        <button
          onClick={() => navigate("/login")}
          className="mt-4 rounded-xl px-6 py-2.5 font-ui text-sm font-medium text-white"
          style={{ backgroundColor: "var(--accent)" }}
        >
          去登录
        </button>
      </div>
    );
  }

  /* tRPC queries */
  const { data, isLoading, refetch } = trpc.diaries.list.useQuery(
    { limit, offset: 0 },
    { enabled: isAuthenticated, staleTime: 30_000 },
  );

  /* Reset when filters change */
  useEffect(() => {
    setAllDiaries([]);
    setOffset(0);
    setHasMore(true);
    refetch();
  }, [filters, refetch]);

  /* Append new data */
  useEffect(() => {
    if (!data) return;
    const mapped = data.map((d) => ({
      id: d.id,
      diaryDate: d.diaryDate,
      title: d.title,
      summary: d.summary,
      content: d.content,
      generationStatus: d.generationStatus,
      style: d.style,
    }));

    if (offset === 0) {
      setAllDiaries(mapped);
    } else {
      setAllDiaries((prev) => {
        const existingIds = new Set(prev.map((p) => p.id));
        const newItems = mapped.filter((m) => !existingIds.has(m.id));
        return [...prev, ...newItems];
      });
    }

    if (mapped.length < limit) {
      setHasMore(false);
    }
    setLoadingMore(false);
  }, [data, offset]);

  /* Client-side filtering */
  const filteredDiaries = allDiaries.filter((d) => {
    const status = mapStatus(d);

    // Time range filter
    if (!matchesTimeRange(d.diaryDate, filters.timeRange)) return false;

    // Status filter
    if (filters.statuses.length > 0 && !filters.statuses.includes(status))
      return false;

    // Style filter
    if (filters.styles.length > 0) {
      const diaryStyle = d.style ?? "温柔真实";
      if (!filters.styles.includes(diaryStyle)) return false;
    }

    return true;
  });

  /* Infinite scroll */
  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const nextOffset = offset + limit;
    setOffset(nextOffset);
  }, [loadingMore, hasMore, offset]);

  useEffect(() => {
    if (!loadMoreRef.current || !hasMore) return;
    observerRef.current?.disconnect();
    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMore();
        }
      },
      { rootMargin: "100px" },
    );
    observerRef.current.observe(loadMoreRef.current);
    return () => observerRef.current?.disconnect();
  }, [loadMore, hasMore]);

  /* Show loading skeletons */
  const showSkeletons = isLoading && allDiaries.length === 0;

  return (
    <div className="relative">
      {/* ── Sticky Header ── */}
      <header
        className="sticky top-0 z-20 px-4 pb-4 pt-5"
        style={{
          backgroundColor: "var(--bg-primary)",
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <motion.h1
              className="font-display text-[22px]"
              style={{ color: "var(--text-primary)" }}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: EASE_PRIMARY }}
            >
              日记
            </motion.h1>
            <motion.p
              className="mt-1 font-ui text-sm"
              style={{ color: "var(--text-secondary)" }}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.06, duration: 0.35, ease: EASE_PRIMARY }}
            >
              AI 为你整理的记忆
            </motion.p>
          </div>
          <motion.button
            className="flex h-11 w-11 items-center justify-center rounded-full"
            style={{ color: "var(--text-tertiary)" }}
            onClick={() => setFilterDrawerOpen(true)}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.35, ease: EASE_PRIMARY }}
            whileTap={{ scale: 0.92 }}
            aria-label="筛选日记"
          >
            <Filter size={22} />
          </motion.button>
        </div>
        {/* Bottom fade gradient */}
        <div
          className="pointer-events-none absolute bottom-0 left-0 right-0 h-3 -translate-y-full"
          style={{
            background:
              "linear-gradient(to bottom, var(--bg-primary), transparent)",
          }}
        />
      </header>

      {/* ── Diary list ── */}
      <div className="flex flex-col gap-4 px-4 pb-24 pt-4">
        <AnimatePresence mode="popLayout">
          {showSkeletons ? (
            <>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : filteredDiaries.length === 0 ? (
            <EmptyState />
          ) : (
            filteredDiaries.map((diary, i) => (
              <DiaryCard key={diary.id} diary={diary} index={i} />
            ))
          )}
        </AnimatePresence>

        {/* Loading more skeletons */}
        {loadingMore && (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        )}

        {/* End of list */}
        {!hasMore && filteredDiaries.length > 0 && (
          <p
            className="py-10 text-center font-ui text-xs"
            style={{ color: "var(--text-tertiary)" }}
          >
            没有更多日记了
          </p>
        )}

        {/* Intersection observer target */}
        <div ref={loadMoreRef} className="h-4" />
      </div>

      {/* ── Filter drawer ── */}
      <FilterDrawer
        open={filterDrawerOpen}
        onClose={() => setFilterDrawerOpen(false)}
        filters={filters}
        onApply={setFilters}
      />
    </div>
  );
}
