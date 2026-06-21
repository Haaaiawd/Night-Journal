import { useState, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router";
import { motion, AnimatePresence, useScroll, useTransform } from "framer-motion";
import {
  ChevronLeft,
  MoreHorizontal,
  RotateCcw,
  Copy,
  Download,
  Trash2,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { format, parseISO } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Drawer } from "vaul";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface Fragment {
  id: number;
  contentText: string;
  moodLabel: string | null;
  createdAt: Date;
  hasImages: boolean;
  attachments?: Array<{
    id: number;
    fileUrl: string;
    visionSummary: string | null;
  }>;
}

const EASE_PRIMARY = [0.25, 0.1, 0.25, 1] as [number, number, number, number];

/* ------------------------------------------------------------------ */
/*  Date helpers                                                      */
/* ------------------------------------------------------------------ */

function formatDiaryDate(dateStr: string | Date): string {
  const d = typeof dateStr === "string" ? parseISO(dateStr) : dateStr;
  return format(d, "M月d日", { locale: zhCN });
}

function formatDiaryWeekday(dateStr: string | Date): string {
  const d = typeof dateStr === "string" ? parseISO(dateStr) : dateStr;
  return format(d, "EEEE", { locale: zhCN });
}

function formatDiaryFullDate(dateStr: string | Date): string {
  const d = typeof dateStr === "string" ? parseISO(dateStr) : dateStr;
  return format(d, "yyyy年M月d日 EEEE", { locale: zhCN });
}

function formatTime(dateStr: string | Date | null): string {
  if (!dateStr) return "";
  const d = typeof dateStr === "string" ? parseISO(dateStr) : dateStr;
  return format(d, "HH:mm", { locale: zhCN });
}

/* ------------------------------------------------------------------ */
/*  Map entry list response to local Fragment type                    */
/* ------------------------------------------------------------------ */

function mapEntriesToFragments(
  entries: Array<{
    id: number;
    contentText: string;
    moodLabel: string | null;
    createdAt: Date;
    hasImages: boolean;
    attachments?: Array<{
      id: number;
      fileUrl: string;
      visionSummary: string | null;
    }>;
  }>,
): Fragment[] {
  return entries.map((entry) => ({
    id: entry.id,
    contentText: entry.contentText,
    moodLabel: entry.moodLabel,
    createdAt: entry.createdAt,
    hasImages: entry.hasImages,
    attachments: entry.attachments,
  }));
}

/* ------------------------------------------------------------------ */
/*  Map generationStatus to readable text                             */
/* ------------------------------------------------------------------ */
/*  Photo Gallery Section                                             */
/* ------------------------------------------------------------------ */

function PhotoGallery({ fragments }: { fragments: Fragment[] }) {
  const photos = fragments
    .filter((f) => f.hasImages && f.attachments && f.attachments.length > 0)
    .flatMap((f) => f.attachments!)
    .filter((a) => a.fileUrl);

  if (photos.length === 0) return null;

  return (
    <motion.section
      className="px-5 pt-8 pb-4"
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.3, ease: EASE_PRIMARY }}
    >
      <h3
        className="font-display text-lg"
        style={{ color: "var(--text-primary)" }}
      >
        今日图片
      </h3>
      <div
        className="no-scrollbar mt-4 flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2"
        style={{ paddingRight: 20 }}
        role="region"
        aria-label="今日图片"
      >
        {photos.map((photo, i) => (
          <motion.div
            key={photo.id}
            className="relative flex-shrink-0 snap-start overflow-hidden rounded-xl"
            style={{ width: 280, aspectRatio: "4/3" }}
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{
              duration: 0.4,
              delay: i * 0.1,
              ease: EASE_PRIMARY,
            }}
          >
            <img
              src={photo.fileUrl}
              alt={photo.visionSummary ?? "图片"}
              className="h-full w-full object-cover"
              loading="lazy"
            />
            {/* Gradient overlay */}
            <div
              className="absolute bottom-0 left-0 right-0 h-10"
              style={{
                background:
                  "linear-gradient(to top, rgba(0,0,0,0.4), transparent)",
              }}
            />
            {photo.visionSummary && (
              <span
                className="absolute bottom-2 left-3 font-ui text-xs text-white/90"
                style={{ textShadow: "0 1px 2px rgba(0,0,0,0.3)" }}
              >
                {photo.visionSummary}
              </span>
            )}
          </motion.div>
        ))}
      </div>
    </motion.section>
  );
}

/* ------------------------------------------------------------------ */
/*  Mood icon helper                                                  */
/* ------------------------------------------------------------------ */

function MoodDot({ mood }: { mood: string | null }) {
  const colorMap: Record<string, string> = {
    happy: "var(--mood-happy)",
    calm: "var(--mood-calm)",
    sad: "var(--mood-sad)",
    tired: "var(--mood-tired)",
    excited: "var(--mood-excited)",
    anxious: "var(--mood-anxious)",
  };
  const color = mood ? colorMap[mood] ?? "var(--text-tertiary)" : "var(--text-tertiary)";

  return (
    <span
      className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0"
      style={{ backgroundColor: color }}
      aria-hidden="true"
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Source Fragments Collapsible Section                              */
/* ------------------------------------------------------------------ */

function SourceFragments({ fragments }: { fragments: Fragment[] }) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (fragments.length === 0) return null;

  return (
    <section className="px-5 py-6">
      {/* Header */}
      <button
        className="flex w-full items-center justify-between py-2"
        onClick={() => setIsExpanded((v) => !v)}
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-2">
          <h3
            className="font-display text-lg"
            style={{ color: "var(--text-primary)" }}
          >
            今日碎片来源
          </h3>
          <span
            className="font-ui text-xs"
            style={{ color: "var(--text-tertiary)" }}
          >
            {fragments.length} 个碎片
          </span>
        </div>
        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
        >
          <ChevronDown
            size={20}
            style={{ color: "var(--text-tertiary)" }}
          />
        </motion.div>
      </button>

      {/* Expanded content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, damping: 30, type: "spring" }}
            className="overflow-hidden"
          >
            <div className="mt-3 flex flex-col gap-2">
              <AnimatePresence>
                {fragments.map((fragment, i) => (
                  <motion.div
                    key={fragment.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{
                      delay: i * 0.05,
                      duration: 0.25,
                      ease: EASE_PRIMARY,
                    }}
                    className="flex items-center gap-3 rounded-xl px-4 py-3"
                    style={{ backgroundColor: "var(--bg-surface)" }}
                  >
                    {/* Thumbnail if image */}
                    {fragment.hasImages &&
                    fragment.attachments &&
                    fragment.attachments[0]?.fileUrl ? (
                      <img
                        src={fragment.attachments[0].fileUrl}
                        alt=""
                        className="h-12 w-12 flex-shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <MoodDot mood={fragment.moodLabel} />
                    )}
                    <div className="min-w-0 flex-1">
                      <p
                        className="truncate font-body text-sm"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {fragment.contentText}
                      </p>
                      <p
                        className="mt-0.5 font-ui text-xs"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        {formatTime(fragment.createdAt)}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Draft Diary View (fragments exist but diary not generated yet)      */
/* ------------------------------------------------------------------ */

function DraftDiaryView({
  date,
  fragments,
  onGenerate,
  isGenerating,
}: {
  date: string;
  fragments: Fragment[];
  onGenerate: () => void;
  isGenerating: boolean;
}) {
  const navigate = useNavigate();
  const weekday = formatDiaryWeekday(date);
  const fullDate = formatDiaryFullDate(date);

  return (
    <div className="relative min-h-[100dvh]">
      <motion.header
        className="fixed top-0 left-0 right-0 z-30 mx-auto flex h-14 max-w-[480px] items-center justify-between px-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <motion.button
          className="flex items-center gap-0.5 font-ui text-sm"
          style={{ color: "var(--text-secondary)" }}
          onClick={() => navigate("/diary")}
          whileTap={{ scale: 0.96 }}
          aria-label="返回日记列表"
        >
          <ChevronLeft size={24} strokeWidth={2} />
          <span className="hidden sm:inline">返回</span>
        </motion.button>

        <span
          className="absolute left-1/2 -translate-x-1/2 font-ui text-[15px] font-medium"
          style={{ color: "var(--text-primary)" }}
        >
          {formatDiaryDate(date)}
        </span>
      </motion.header>

      <motion.main
        className="px-5 pt-[72px] pb-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <motion.p
          className="font-ui text-xs uppercase tracking-[0.08em]"
          style={{ color: "var(--text-tertiary)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.3 }}
        >
          {weekday}
        </motion.p>

        <motion.h1
          className="mt-2 font-display text-[22px] leading-[1.3] tracking-[0.02em]"
          style={{ color: "var(--text-primary)" }}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4, ease: EASE_PRIMARY }}
        >
          {fullDate}
        </motion.h1>

        <motion.div
          className="my-6 h-px w-full origin-left"
          style={{ backgroundColor: "var(--divider)" }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 0.4, duration: 0.4, ease: EASE_PRIMARY }}
        />

        <motion.p
          className="font-body text-base"
          style={{ color: "var(--text-secondary)", lineHeight: 1.75 }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.4, ease: EASE_PRIMARY }}
        >
          这篇日记还没有生成。点击下方按钮，AI 会根据当天的碎片和图片为你整理。
        </motion.p>

        <motion.button
          className="mt-6 inline-flex items-center gap-2 rounded-xl px-6 py-3 font-ui text-sm font-medium text-white"
          style={{ backgroundColor: "var(--accent)" }}
          onClick={onGenerate}
          disabled={isGenerating}
          whileTap={{ scale: 0.96 }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.4, ease: EASE_PRIMARY }}
        >
          {isGenerating ? (
            <>
              <motion.span
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
              >
                <RotateCcw size={18} />
              </motion.span>
              生成中...
            </>
          ) : (
            <>
              <Sparkles size={18} />
              生成日记
            </>
          )}
        </motion.button>
      </motion.main>

      <PhotoGallery fragments={fragments} />
      <SourceFragments fragments={fragments} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  More Action Menu (Drawer)                                         */
/* ------------------------------------------------------------------ */

function MoreActionMenu({
  open,
  onClose,
  onCopy,
  onExport,
  onDelete,
  isDeleting,
}: {
  open: boolean;
  onClose: () => void;
  onCopy: () => void;
  onExport: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const menuItems = [
    {
      label: "复制全文",
      icon: Copy,
      color: "var(--text-primary)",
      action: () => {
        onCopy();
        onClose();
      },
    },
    {
      label: "导出为文本",
      icon: Download,
      color: "var(--text-primary)",
      action: () => {
        onExport();
        onClose();
      },
    },
    {
      label: isDeleting ? "删除中..." : "删除这篇日记",
      icon: Trash2,
      color: "var(--error)",
      action: () => {
        onDelete();
        onClose();
      },
    },
  ];

  return (
    <Drawer.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay
          className="fixed inset-0 z-overlay"
          style={{ backgroundColor: "rgba(0,0,0,0.3)" }}
          onClick={onClose}
        />
        <Drawer.Content
          className="fixed bottom-0 left-0 right-0 z-drawer mx-auto max-w-[480px] rounded-t-3xl outline-none"
          style={{ backgroundColor: "var(--bg-elevated)" }}
        >
          <div className="flex justify-center pt-3 pb-1">
            <div
              className="h-1 w-10 rounded-full"
              style={{ backgroundColor: "var(--divider)" }}
            />
          </div>
          <div className="px-4 pb-6 pt-2">
            {menuItems.map((item, i) => (
              <motion.button
                key={item.label}
                className="flex w-full items-center gap-3 rounded-xl px-4 py-3.5 font-ui text-base"
                style={{ color: item.color }}
                onClick={item.action}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03, duration: 0.25 }}
                whileTap={{ scale: 0.98 }}
              >
                <item.icon size={20} strokeWidth={2} />
                {item.label}
              </motion.button>
            ))}
            <motion.button
              className="mt-2 flex w-full items-center justify-center rounded-xl py-3.5 font-ui text-sm font-medium"
              style={{ color: "var(--text-tertiary)" }}
              onClick={onClose}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.12 }}
              whileTap={{ scale: 0.98 }}
            >
              取消
            </motion.button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Diary Detail page                                            */
/* ------------------------------------------------------------------ */

export default function DiaryDetail() {
  const { date } = useParams<{ date: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const [showActionMenu, setShowActionMenu] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const { scrollY } = useScroll({ container: scrollRef });
  const navBgOpacity = useTransform(scrollY, [0, 20], [0, 0.95]);
  const navBlur = useTransform(scrollY, [0, 20], [0, 12]);
  const backdropBlur = useTransform(navBlur, (v) => `blur(${v}px)`);

  /* tRPC queries */
  const {
    data: diary,
    isLoading: diaryLoading,
    error: diaryError,
    refetch: refetchDiary,
  } = trpc.diaries.getByDate.useQuery(
    { date: date! },
    {
      enabled: !!date && isAuthenticated,
      retry: false,
      refetchInterval: (query) =>
        query.state.data?.generationStatus === "pending" ? 3000 : false,
    },
  );

  const { data: rawFragments } = trpc.entries.list.useQuery(
    { date: date! },
    { enabled: !!date && isAuthenticated, staleTime: 60_000 },
  );
  const fragments = useMemo(
    () => (rawFragments ? mapEntriesToFragments(rawFragments) : []),
    [rawFragments],
  );

  /* Mutations */
  const generateMutation = trpc.diaries.generate.useMutation({
    onSuccess: () => {
      toast.success("已开始生成日记，稍后查看");
      refetchDiary();
    },
    onError: () => {
      toast.error("生成失败，请检查 AI 设置");
    },
  });

  const regenerateMutation = trpc.diaries.regenerate.useMutation({
    onSuccess: () => {
      setIsRegenerating(false);
      toast.success("已开始重新生成，稍后查看");
      refetchDiary();
    },
    onError: () => {
      setIsRegenerating(false);
      toast.error("生成失败，请检查 AI 设置");
    },
  });

  const deleteMutation = trpc.diaries.delete.useMutation({
    onSuccess: () => {
      toast.success("日记已删除");
      navigate("/diary");
    },
    onError: () => {
      toast.error("删除失败，请重试");
    },
  });

  /* Handle actions */
  const handleCopy = useCallback(() => {
    if (!diary) return;
    const text = `${diary.title ?? "无标题"}\n\n${diary.content ?? ""}`;
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success("已复制到剪贴板"))
      .catch(() => toast.error("复制失败"));
  }, [diary]);

  const handleExport = useCallback(() => {
    if (!diary) return;
    const text = `${diary.title ?? "无标题"}\n\n${formatDiaryFullDate(diary.diaryDate)}\n\n${diary.content ?? ""}`;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${date ?? "diary"}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("导出成功");
  }, [diary, date]);

  const handleDelete = useCallback(() => {
    if (!diary) return;
    if (window.confirm("确定要删除这篇日记吗？此操作不可撤销。")) {
      deleteMutation.mutate({ id: diary.id });
    }
  }, [diary, deleteMutation]);

  const handleRegenerate = useCallback(() => {
    if (!date || isRegenerating) return;
    setIsRegenerating(true);
    regenerateMutation.mutate({ date });
  }, [date, isRegenerating, regenerateMutation]);

  const handleGenerate = useCallback(() => {
    if (!date || generateMutation.isPending) return;
    generateMutation.mutate({ date });
  }, [date, generateMutation]);

  /* Auth gate */
  if (!authLoading && !isAuthenticated) {
    return (
      <div
        className="flex min-h-[100dvh] flex-col items-center justify-center px-6"
        style={{ color: "var(--text-secondary)" }}
      >
        <Sparkles size={64} strokeWidth={1} style={{ color: "var(--text-tertiary)" }} />
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

  /* Loading state */
  if (diaryLoading) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4">
        <div
          className="h-6 w-32 animate-skeleton-pulse rounded-md"
          style={{ backgroundColor: "var(--divider)" }}
        />
        <div
          className="h-4 w-48 animate-skeleton-pulse rounded-md"
          style={{ backgroundColor: "var(--divider)" }}
        />
      </div>
    );
  }

  const diaryNotFound = diaryError?.message === "Diary not found for this date";
  const hasFragments = fragments.length > 0;

  /* Error / Not found */
  if (diaryError || !diary) {
    if (diaryNotFound && hasFragments) {
      return (
        <DraftDiaryView
          date={date!}
          fragments={fragments}
          onGenerate={handleGenerate}
          isGenerating={generateMutation.isPending}
        />
      );
    }
    return (
      <div
        className="flex min-h-[100dvh] flex-col items-center justify-center px-6"
        style={{ color: "var(--text-secondary)" }}
      >
        <FileTextIcon size={64} strokeWidth={1} style={{ color: "var(--text-tertiary)" }} />
        <p className="mt-4 font-display text-lg">
          {diaryNotFound ? "这篇日记不存在" : "加载失败"}
        </p>
        <p className="mt-2 font-ui text-sm" style={{ color: "var(--text-tertiary)" }}>
          {date}
        </p>
        <button
          onClick={() => navigate("/diary")}
          className="mt-6 inline-flex items-center gap-1 rounded-xl px-5 py-2.5 font-ui text-sm font-medium"
          style={{ color: "var(--accent)" }}
        >
          <ChevronLeft size={16} />
          返回日记列表
        </button>
      </div>
    );
  }

  /* Derived data */
  const weekday = formatDiaryWeekday(diary.diaryDate);
  const generationTime = formatTime(diary.generatedAt);
  const diaryStyle = diary.style ?? "温柔真实";
  const diaryContent = diary.content ?? "";
  const paragraphs = diaryContent.split("\n").filter((p) => p.trim().length > 0);

  return (
    <div className="relative min-h-[100dvh]">
      {/* ── Top Navigation Bar ── */}
      <motion.header
        className="fixed top-0 left-0 right-0 z-30 mx-auto flex h-14 max-w-[480px] items-center justify-between px-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        {/* Animated background */}
        <motion.div
          className="absolute inset-0 -z-10"
          style={{
            backgroundColor: "var(--bg-primary)",
            opacity: navBgOpacity,
            backdropFilter: backdropBlur,
            WebkitBackdropFilter: backdropBlur,
          }}
        />

        {/* Back button */}
        <motion.button
          className="flex items-center gap-0.5 font-ui text-sm"
          style={{ color: "var(--text-secondary)" }}
          onClick={() => navigate("/diary")}
          whileTap={{ scale: 0.96 }}
          aria-label="返回日记列表"
        >
          <ChevronLeft size={24} strokeWidth={2} />
          <span className="hidden sm:inline">返回</span>
        </motion.button>

        {/* Date */}
        <span
          className="absolute left-1/2 -translate-x-1/2 font-ui text-[15px] font-medium"
          style={{ color: "var(--text-primary)" }}
        >
          {formatDiaryDate(diary.diaryDate)}
        </span>

        {/* More options */}
        <motion.button
          className="flex h-11 w-11 items-center justify-center"
          style={{ color: "var(--text-secondary)" }}
          onClick={() => setShowActionMenu(true)}
          whileTap={{ scale: 0.92 }}
          aria-label="更多操作"
        >
          <MoreHorizontal size={22} />
        </motion.button>
      </motion.header>

      {/* ── Diary Content ── */}
      <motion.main
        className="px-5 pt-[72px] pb-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        {/* Day label */}
        <motion.p
          className="font-ui text-xs uppercase tracking-[0.08em]"
          style={{ color: "var(--text-tertiary)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.3 }}
        >
          {weekday}
        </motion.p>

        {/* Title */}
        <motion.h1
          className="mt-2 font-display text-[22px] leading-[1.3] tracking-[0.02em]"
          style={{ color: "var(--text-primary)" }}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4, ease: EASE_PRIMARY }}
        >
          {diary.title ?? "无标题日记"}
        </motion.h1>

        {/* Generation meta */}
        <motion.p
          className="mt-3 font-ui text-xs"
          style={{ color: "var(--text-tertiary)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35, duration: 0.3 }}
        >
          {generationTime && `AI 于 ${generationTime} 生成`}
          {generationTime && " · "}
          {diaryStyle}风格
        </motion.p>

        {/* Divider */}
        <motion.div
          className="my-6 h-px w-full origin-left"
          style={{ backgroundColor: "var(--divider)" }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 0.4, duration: 0.4, ease: EASE_PRIMARY }}
        />

        {/* Body text */}
        <div className="flex flex-col gap-4">
          {paragraphs.length > 0 ? (
            paragraphs.map((para, i) => (
              <motion.p
                key={i}
                className="font-body text-base"
                style={{
                  color: "var(--text-primary)",
                  lineHeight: 1.9,
                  letterSpacing: "0.02em",
                }}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: 0.5 + i * 0.08,
                  duration: 0.4,
                  ease: EASE_PRIMARY,
                }}
              >
                {para}
              </motion.p>
            ))
          ) : (
            <motion.p
              className="font-body text-base italic"
              style={{
                color: "var(--text-tertiary)",
                lineHeight: 1.9,
              }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.4, ease: EASE_PRIMARY }}
            >
              这篇日记还没有内容...
            </motion.p>
          )}
        </div>
      </motion.main>

      {/* ── Today's Photos ── */}
      <PhotoGallery fragments={fragments ?? []} />

      {/* ── Source Fragments ── */}
      <SourceFragments fragments={fragments ?? []} />

      {/* ── Regenerate Action ── */}
      <motion.section
        className="flex justify-center px-5 pt-4 pb-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6, duration: 0.3 }}
      >
        <motion.button
          className="inline-flex items-center gap-2 rounded-xl px-6 py-3 font-ui text-sm font-medium"
          style={{
            color: "var(--accent)",
            backgroundColor: "transparent",
          }}
          whileHover={{ backgroundColor: "var(--accent-soft)" }}
          whileTap={{ scale: 0.96, backgroundColor: "var(--accent-soft)" }}
          onClick={handleRegenerate}
          disabled={isRegenerating}
          aria-live="polite"
        >
          {isRegenerating ? (
            <>
              <motion.span
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
              >
                <RotateCcw size={18} />
              </motion.span>
              生成中...
            </>
          ) : (
            <>
              <RotateCcw size={18} />
              重新生成
            </>
          )}
        </motion.button>
      </motion.section>

      {/* ── More Action Menu ── */}
      <MoreActionMenu
        open={showActionMenu}
        onClose={() => setShowActionMenu(false)}
        onCopy={handleCopy}
        onExport={handleExport}
        onDelete={handleDelete}
        isDeleting={deleteMutation.isPending}
      />

    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Simple file icon for not-found state                              */
/* ------------------------------------------------------------------ */

function FileTextIcon({ size, strokeWidth, style }: { size: number; strokeWidth: number; style?: React.CSSProperties }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={style?.color ?? "currentColor"}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" x2="8" y1="13" y2="13" />
      <line x1="16" x2="8" y1="17" y2="17" />
      <line x1="10" x2="8" y1="9" y2="9" />
    </svg>
  );
}
