import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  addMonths,
  subMonths,
  getYear,
  getMonth,
} from "date-fns";
import { zhCN } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { LOGIN_PATH } from "@/const";

// ─── Types ──────────────────────────────────────────────────────────

type DayRecord = {
  date: string; // YYYY-MM-DD
  fragmentCount: number;
  hasDiary: boolean;
  diaryStatus: string | null;
  diaryTitle: string | null;
  diarySummary: string | null;
};

// ─── Helpers ────────────────────────────────────────────────────────

function toDateKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function getWeekdayLabels(): string[] {
  return ["日", "一", "二", "三", "四", "五", "六"];
}

function formatMonthYear(date: Date): string {
  return format(date, "yyyy年M月", { locale: zhCN });
}

function formatDisplayDate(date: Date): string {
  return format(date, "M月d日 EEEE", { locale: zhCN });
}

function getDaysForGrid(month: Date): Date[] {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  return eachDayOfInterval({ start: gridStart, end: gridEnd });
}

function buildRecordsMap(
  entries: Array<{ entryDate: Date }>,
  diaries: Array<{
    diaryDate: Date;
    generationStatus: string;
    title: string | null;
    summary: string | null;
  }>,
): Map<string, DayRecord> {
  const map = new Map<string, DayRecord>();

  // Count entries per date
  for (const entry of entries) {
    const dateKey = format(entry.entryDate, "yyyy-MM-dd");
    const existing = map.get(dateKey);
    if (existing) {
      existing.fragmentCount += 1;
    } else {
      map.set(dateKey, {
        date: dateKey,
        fragmentCount: 1,
        hasDiary: false,
        diaryStatus: null,
        diaryTitle: null,
        diarySummary: null,
      });
    }
  }

  // Merge diary data
  for (const diary of diaries) {
    const dateKey = format(diary.diaryDate, "yyyy-MM-dd");
    const existing = map.get(dateKey);
    if (existing) {
      existing.hasDiary = true;
      existing.diaryStatus = diary.generationStatus;
      existing.diaryTitle = diary.title;
      existing.diarySummary = diary.summary;
    } else {
      map.set(dateKey, {
        date: dateKey,
        fragmentCount: 0,
        hasDiary: true,
        diaryStatus: diary.generationStatus,
        diaryTitle: diary.title,
        diarySummary: diary.summary,
      });
    }
  }

  return map;
}

// ─── Status Chip Component ──────────────────────────────────────────

function StatusChip({ status }: { status: string }) {
  if (status === "generated") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
        style={{
          backgroundColor: "rgba(107,143,113,0.12)",
          color: "var(--success)",
        }}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
        已生成
      </span>
    );
  }
  if (status === "pending" || status === "generating") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
        style={{
          backgroundColor: "rgba(184,138,100,0.12)",
          color: "var(--accent)",
        }}
      >
        <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-current" />
        生成中...
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{
        backgroundColor: "rgba(158,152,146,0.12)",
        color: "var(--text-tertiary)",
      }}
    >
      草稿
    </span>
  );
}

// ─── Month Stats Component ──────────────────────────────────────────

function MonthStats({
  recordDays,
  fragmentCount,
  diaryCount,
}: {
  recordDays: number;
  fragmentCount: number;
  diaryCount: number;
}) {
  const stats = [
    { value: recordDays, label: "天有记录" },
    { value: fragmentCount, label: "个碎片" },
    { value: diaryCount, label: "篇日记" },
  ];

  return (
    <div className="grid grid-cols-3 gap-3 px-4 pb-8 pt-4">
      {stats.map((stat, i) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            delay: i * 0.08,
            duration: 0.35,
            ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number],
          }}
          className="rounded-xl p-4"
          style={{ backgroundColor: "var(--bg-surface)" }}
        >
          <div
            className="font-ui text-2xl font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            {stat.value}
          </div>
          <div
            className="mt-1 font-ui text-xs"
            style={{ color: "var(--text-tertiary)" }}
          >
            {stat.label}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ─── Main Calendar Page ─────────────────────────────────────────────

export default function CalendarPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth({
    redirectOnUnauthenticated: true,
    redirectPath: LOGIN_PATH,
  });

  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [direction, setDirection] = useState(0);
  const calendarRef = useRef<HTMLDivElement>(null);

  const year = getYear(currentMonth);
  const month = getMonth(currentMonth) + 1;

  const { data: monthEntries, isLoading: entriesLoading } =
    trpc.entries.listByMonth.useQuery(
      { year, month },
      { enabled: isAuthenticated, staleTime: 1000 * 60 * 2 },
    );

  const { data: monthDiaries, isLoading: diariesLoading } =
    trpc.diaries.listByMonth.useQuery(
      { year, month },
      { enabled: isAuthenticated, staleTime: 1000 * 60 * 2 },
    );

  const recordsByDate = useMemo(() => {
    if (!monthEntries || !monthDiaries) return new Map<string, DayRecord>();
    return buildRecordsMap(monthEntries, monthDiaries);
  }, [monthEntries, monthDiaries]);

  const days = useMemo(() => getDaysForGrid(currentMonth), [currentMonth]);

  const monthStats = useMemo(() => {
    let recordDays = 0;
    let fragmentCount = 0;
    let diaryCount = 0;
    recordsByDate.forEach((record) => {
      recordDays += 1;
      fragmentCount += record.fragmentCount;
      if (record.hasDiary) diaryCount += 1;
    });
    return { recordDays, fragmentCount, diaryCount };
  }, [recordsByDate]);

  const selectedRecord = useMemo(() => {
    if (!selectedDate) return null;
    return recordsByDate.get(toDateKey(selectedDate)) ?? null;
  }, [selectedDate, recordsByDate]);

  // ─── Navigation ───────────────────────────────────────────────────

  const goToPrevMonth = useCallback(() => {
    setDirection(-1);
    setSelectedDate(null);
    setCurrentMonth((m) => subMonths(m, 1));
  }, []);

  const goToNextMonth = useCallback(() => {
    setDirection(1);
    setSelectedDate(null);
    setCurrentMonth((m) => addMonths(m, 1));
  }, []);

  const goToToday = useCallback(() => {
    const today = startOfMonth(new Date());
    setDirection(getMonth(today) > getMonth(currentMonth) ? 1 : -1);
    setSelectedDate(null);
    setCurrentMonth(today);
  }, [currentMonth]);

  const handleDayTap = useCallback(
    (day: Date) => {
      const dateKey = toDateKey(day);
      const record = recordsByDate.get(dateKey);

      if (!record || (record.fragmentCount === 0 && !record.hasDiary)) {
        // Empty day: shake feedback (handled visually via selection flash)
        setSelectedDate(day);
        setTimeout(() => setSelectedDate(null), 400);
        return;
      }

      setSelectedDate(day);
    },
    [recordsByDate],
  );

  const handleNavigateToDetail = useCallback(
    (date: Date) => {
      const dateKey = toDateKey(date);
      navigate(`/diary/${dateKey}`);
    },
    [navigate],
  );

  // ─── Swipe Gesture ────────────────────────────────────────────────

  const x = useMotionValue(0);
  const opacity = useTransform(x, [-200, 0, 200], [0.4, 1, 0.4]);

  const handlePanEnd = useCallback(
    (_: unknown, info: { offset: { x: number }; velocity: { x: number } }) => {
      const swipeX = info.offset.x + info.velocity.x * 0.2;
      if (swipeX < -80) {
        goToNextMonth();
      } else if (swipeX > 80) {
        goToPrevMonth();
      }
    },
    [goToNextMonth, goToPrevMonth],
  );

  // ─── Dismiss panel on outside tap ─────────────────────────────────

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (target.closest("[data-day-cell]")) return;
      if (target.closest("[data-day-panel]")) return;
      setSelectedDate(null);
    }
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  // ─── Render ───────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <div
          className="h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent"
          style={{ color: "var(--accent)" }}
        />
      </div>
    );
  }

  const weekdayLabels = getWeekdayLabels();
  const isLoading = entriesLoading || diariesLoading;

  return (
    <div className="flex min-h-[100dvh] flex-col" style={{ backgroundColor: "var(--bg-primary)" }}>
      {/* ── Month Navigator ────────────────────────────────────────── */}
      <div
        className="sticky top-0 z-20 px-4 pb-4 pt-5"
        style={{
          backgroundColor: "var(--bg-primary)",
          background: `linear-gradient(to bottom, var(--bg-primary) 80%, transparent)`,
        }}
      >
        <div className="flex items-center justify-between">
          <motion.button
            onClick={goToPrevMonth}
            className="flex h-11 w-11 items-center justify-center rounded-full"
            whileTap={{ scale: 0.9 }}
            transition={{ duration: 0.1 }}
            aria-label="上个月"
          >
            <ChevronLeft size={24} strokeWidth={2} style={{ color: "var(--text-secondary)" }} />
          </motion.button>

          <div className="flex items-center gap-3">
            <AnimatePresence mode="wait" initial={false}>
              <motion.h1
                key={formatMonthYear(currentMonth)}
                className="font-display text-[22px] tracking-wide"
                style={{ color: "var(--text-primary)" }}
                initial={{ opacity: 0, x: direction * 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: direction * -20 }}
                transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] }}
              >
                {formatMonthYear(currentMonth)}
              </motion.h1>
            </AnimatePresence>

            {!isSameMonth(currentMonth, new Date()) && (
              <motion.button
                onClick={goToToday}
                className="font-ui text-xs font-medium"
                style={{ color: "var(--accent)" }}
                whileTap={{ scale: 0.92 }}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                今天
              </motion.button>
            )}
          </div>

          <motion.button
            onClick={goToNextMonth}
            className="flex h-11 w-11 items-center justify-center rounded-full"
            whileTap={{ scale: 0.9 }}
            transition={{ duration: 0.1 }}
            aria-label="下个月"
          >
            <ChevronRight size={24} strokeWidth={2} style={{ color: "var(--text-secondary)" }} />
          </motion.button>
        </div>
      </div>

      {/* ── Weekday Headers ────────────────────────────────────────── */}
      <div className="grid grid-cols-7 px-3 pb-2 pt-1">
        {weekdayLabels.map((label, i) => (
          <div
            key={label}
            className="py-2 text-center font-ui text-xs"
            style={{
              color: i === 0 || i === 6 ? "var(--text-secondary)" : "var(--text-tertiary)",
            }}
          >
            {label}
          </div>
        ))}
      </div>

      {/* ── Calendar Grid ──────────────────────────────────────────── */}
      <div className="flex-1 px-3" ref={calendarRef}>
        <motion.div
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.15}
          onPanEnd={handlePanEnd}
          style={{ x, opacity, cursor: "grab" }}
          className="select-none active:cursor-grabbing"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={`${year}-${month}`}
              className="grid grid-cols-7 gap-1"
              initial={{ opacity: 0, x: direction * 60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction * -60 }}
              transition={{
                duration: 0.25,
                ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number],
              }}
            >
              {days.map((day, index) => {
                const dateKey = toDateKey(day);
                const record = recordsByDate.get(dateKey);
                const inCurrentMonth = isSameMonth(day, currentMonth);
                const dayIsToday = isToday(day);
                const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;

                const hasFragments = record && record.fragmentCount > 0;
                const hasDiary = record && record.hasDiary;
                const isEmpty = !hasFragments && !hasDiary;

                return (
                  <motion.button
                    key={dateKey}
                    data-day-cell
                    onClick={() => handleDayTap(day)}
                    className="relative flex aspect-square flex-col items-center justify-center rounded-xl"
                    role="gridcell"
                    aria-label={
                      record
                        ? `${format(day, "M月d日")}，${record.fragmentCount}个碎片${record.hasDiary ? "，日记已生成" : ""}`
                        : format(day, "M月d日")
                    }
                    aria-selected={isSelected}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{
                      delay: index * 0.015,
                      duration: 0.3,
                      ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number],
                    }}
                    whileTap={!isEmpty ? { scale: 0.95 } : { scale: 0.92 }}
                    style={{
                      backgroundColor: dayIsToday
                        ? "var(--accent)"
                        : isSelected
                          ? "var(--accent-soft)"
                          : hasDiary
                            ? "var(--accent-soft)"
                            : "transparent",
                      opacity: !inCurrentMonth ? 0.4 : 1,
                    }}
                  >
                    {/* Ring indicator for generated diary */}
                    {hasDiary && !dayIsToday && (
                      <motion.div
                        className="absolute inset-[3px] rounded-full border-2"
                        style={{ borderColor: "var(--accent)" }}
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: index * 0.015 + 0.1, duration: 0.3 }}
                      />
                    )}

                    {/* Date number */}
                    <span
                      className="font-ui text-xs"
                      style={{
                        color: dayIsToday
                          ? "#FFFFFF"
                          : hasDiary
                            ? "var(--text-primary)"
                            : hasFragments
                              ? "var(--text-secondary)"
                              : "var(--text-tertiary)",
                        fontWeight: dayIsToday ? 600 : hasDiary ? 500 : 400,
                      }}
                    >
                      {format(day, "d")}
                    </span>

                    {/* Dot indicators */}
                    {!dayIsToday && hasFragments && !hasDiary && (
                      <div className="mt-0.5 flex items-center gap-0.5">
                        {record.fragmentCount >= 3 ? (
                          <>
                            <span
                              className="block h-1 w-1 rounded-full"
                              style={{ backgroundColor: "var(--text-tertiary)" }}
                            />
                            <span
                              className="block h-1 w-1 rounded-full"
                              style={{ backgroundColor: "var(--text-tertiary)" }}
                            />
                            <span
                              className="block h-1 w-1 rounded-full"
                              style={{ backgroundColor: "var(--text-tertiary)" }}
                            />
                          </>
                        ) : record.fragmentCount >= 2 ? (
                          <>
                            <span
                              className="block h-1 w-1 rounded-full"
                              style={{ backgroundColor: "var(--text-tertiary)" }}
                            />
                            <span
                              className="block h-1 w-1 rounded-full"
                              style={{ backgroundColor: "var(--text-tertiary)" }}
                            />
                          </>
                        ) : (
                          <span
                            className="block h-1 w-1 rounded-full"
                            style={{ backgroundColor: "var(--text-tertiary)" }}
                          />
                        )}
                      </div>
                    )}

                    {/* Dot for diary days */}
                    {!dayIsToday && hasDiary && (
                      <div className="mt-0.5 flex items-center gap-0.5">
                        {record.fragmentCount >= 3 ? (
                          <>
                            <span
                              className="block h-1 w-1 rounded-full"
                              style={{ backgroundColor: "var(--accent)" }}
                            />
                            <span
                              className="block h-1 w-1 rounded-full"
                              style={{ backgroundColor: "var(--accent)" }}
                            />
                            <span
                              className="block h-1 w-1 rounded-full"
                              style={{ backgroundColor: "var(--accent)" }}
                            />
                          </>
                        ) : record.fragmentCount >= 2 ? (
                          <>
                            <span
                              className="block h-1 w-1 rounded-full"
                              style={{ backgroundColor: "var(--accent)" }}
                            />
                            <span
                              className="block h-1 w-1 rounded-full"
                              style={{ backgroundColor: "var(--accent)" }}
                            />
                          </>
                        ) : record.fragmentCount >= 1 ? (
                          <span
                            className="block h-1 w-1 rounded-full"
                            style={{ backgroundColor: "var(--accent)" }}
                          />
                        ) : null}
                      </div>
                    )}
                  </motion.button>
                );
              })}
            </motion.div>
          </AnimatePresence>
        </motion.div>

        {/* ── Day Summary Panel ──────────────────────────────────── */}
        <AnimatePresence>
          {selectedDate && (
            <motion.div
              key="day-panel"
              data-day-panel
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{
                type: "spring",
                damping: 30,
                stiffness: 300,
              }}
              className="mx-1 mt-3 cursor-pointer rounded-2xl p-5"
              style={{ backgroundColor: "var(--bg-surface)" }}
              onClick={() => {
                if (selectedRecord && selectedRecord.hasDiary) {
                  handleNavigateToDetail(selectedDate);
                } else if (selectedRecord && selectedRecord.fragmentCount > 0) {
                  // Has fragments but no diary - show fragments on journal page
                  navigate(`/?date=${toDateKey(selectedDate)}`);
                } else {
                  // No records - go to journal
                  navigate("/");
                }
              }}
            >
              {selectedRecord &&
              (selectedRecord.fragmentCount > 0 || selectedRecord.hasDiary) ? (
                <>
                  <div className="flex items-center justify-between">
                    <span
                      className="font-ui text-[15px] font-medium"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {formatDisplayDate(selectedDate)}
                    </span>
                    {selectedRecord.hasDiary && selectedRecord.diaryStatus && (
                      <StatusChip status={selectedRecord.diaryStatus} />
                    )}
                  </div>

                  <div className="mt-2 flex items-center gap-3">
                    <span className="font-ui text-xs" style={{ color: "var(--text-secondary)" }}>
                      {selectedRecord.fragmentCount} 个碎片
                    </span>
                    {selectedRecord.hasDiary && (
                      <span className="font-ui text-xs" style={{ color: "var(--success)" }}>
                        日记已生成
                      </span>
                    )}
                    {!selectedRecord.hasDiary && selectedRecord.fragmentCount > 0 && (
                      <span className="font-ui text-xs" style={{ color: "var(--text-tertiary)" }}>
                        日记尚未生成
                      </span>
                    )}
                  </div>

                  {selectedRecord.diaryTitle && (
                    <p
                      className="mt-2 font-body text-sm"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {selectedRecord.diaryTitle}
                    </p>
                  )}

                  {selectedRecord.diarySummary && (
                    <p
                      className="mt-1 font-body text-sm line-clamp-2"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      {selectedRecord.diarySummary}
                    </p>
                  )}

                  <div className="mt-3 flex items-center gap-1 font-ui text-xs font-medium" style={{ color: "var(--accent)" }}>
                    <Eye size={14} strokeWidth={2} />
                    <span>查看详情</span>
                    <ChevronRight size={14} strokeWidth={2} />
                  </div>
                </>
              ) : (
                <>
                  <p
                    className="font-body text-sm"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    这一天没有记录
                  </p>
                  <div className="mt-3 flex items-center gap-1 font-ui text-xs font-medium" style={{ color: "var(--accent)" }}>
                    <span>去记录页添加</span>
                    <ChevronRight size={14} strokeWidth={2} />
                  </div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Month Stats ──────────────────────────────────────────── */}
        {!isLoading && (
          <MonthStats
            recordDays={monthStats.recordDays}
            fragmentCount={monthStats.fragmentCount}
            diaryCount={monthStats.diaryCount}
          />
        )}

        {/* Loading skeleton for stats */}
        {isLoading && (
          <div className="grid grid-cols-3 gap-3 px-4 pb-8 pt-4">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="animate-skeleton-pulse rounded-xl p-4"
                style={{ backgroundColor: "var(--bg-surface)" }}
              >
                <div className="h-7 w-8 rounded" style={{ backgroundColor: "var(--divider)" }} />
                <div
                  className="mt-2 h-4 w-12 rounded"
                  style={{ backgroundColor: "var(--divider)" }}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
