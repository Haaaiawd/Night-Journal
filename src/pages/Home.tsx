import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  X,
  ImagePlus,
  Sun,
  Cloud,
  CloudRain,
  Moon,
  Zap,
  Wind,
  FileText,
  AlignLeft,
  Image,
  Smile,
} from 'lucide-react'
import { trpc } from '@/providers/trpc'
import { useAuth } from '@/hooks/useAuth'
import { format } from 'date-fns'

// ──────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────

interface Fragment {
  id: string
  type: 'text' | 'image' | 'mixed'
  content?: string
  images?: string[]
  mood?: MoodKey
  timestamp: string
}

type MoodKey = 'happy' | 'calm' | 'sad' | 'tired' | 'excited' | 'anxious'
type DrawerTab = 'text' | 'longtext' | 'image' | 'mood'

// ──────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────

const PROMPTS = [
  '今天留下些什么？',
  '不用完整，先放在这里。',
  '一句话也算。',
  '把今天交给夜晚整理。',
]

const MOODS: { key: MoodKey; label: string; Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>; color: string }[] = [
  { key: 'happy', label: '开心', Icon: Sun, color: '#D4A853' },
  { key: 'calm', label: '平静', Icon: Cloud, color: '#7BA3A0' },
  { key: 'sad', label: '难过', Icon: CloudRain, color: '#8B9BB4' },
  { key: 'tired', label: '疲惫', Icon: Moon, color: '#A08E8E' },
  { key: 'excited', label: '兴奋', Icon: Zap, color: '#C4826A' },
  { key: 'anxious', label: '焦虑', Icon: Wind, color: '#9B8AA5' },
]

const TAB_CONFIG: { key: DrawerTab; label: string; Icon: React.ComponentType<{ size?: number }> }[] = [
  { key: 'text', label: '文字', Icon: FileText },
  { key: 'longtext', label: '长文本', Icon: AlignLeft },
  { key: 'image', label: '图片', Icon: Image },
  { key: 'mood', label: '情绪', Icon: Smile },
]

const DRAWER_SPRING = { damping: 30, stiffness: 300 }
const SOFT_EASE = [0.25, 0.1, 0.25, 1] as [number, number, number, number]

// ──────────────────────────────────────────────────────────
// Helper: format date
// ──────────────────────────────────────────────────────────

function getFormattedDate(): { yearMonth: string; dayWeek: string } {
  const now = new Date()
  const month = now.getMonth() + 1
  const date = now.getDate()
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
  const week = weekdays[now.getDay()]
  return {
    yearMonth: `${now.getFullYear()}年${month}月`,
    dayWeek: `${month}月${date}日 ${week}`,
  }
}

function formatTime(date?: Date | string | null): string {
  const d = date ? (typeof date === 'string' ? new Date(date) : date) : new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ──────────────────────────────────────────────────────────
// Empty State SVG Component
// ──────────────────────────────────────────────────────────

function EmptyStateIllustration() {
  return (
    <svg width="160" height="160" viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="40" y="30" width="80" height="100" rx="8" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.3" />
      <rect x="50" y="45" width="60" height="4" rx="2" fill="currentColor" fillOpacity="0.15" />
      <rect x="50" y="55" width="40" height="4" rx="2" fill="currentColor" fillOpacity="0.15" />
      <rect x="50" y="65" width="50" height="4" rx="2" fill="currentColor" fillOpacity="0.15" />
      <path d="M75 95C75 95 78 88 85 88C92 88 95 95 95 95" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.3" strokeLinecap="round" />
      <circle cx="120" cy="40" r="12" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.25" />
      <circle cx="115" cy="38" r="2" fill="currentColor" fillOpacity="0.2" />
      <path d="M30 55L34 59M34 55L30 59" stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.2" strokeLinecap="round" />
      <path d="M126 70L130 74M130 70L126 74" stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.2" strokeLinecap="round" />
    </svg>
  )
}

// ──────────────────────────────────────────────────────────
// Mood Tag Component
// ──────────────────────────────────────────────────────────

function MoodTag({ moodKey }: { moodKey: MoodKey }) {
  const mood = MOODS.find((m) => m.key === moodKey)
  if (!mood) return null
  const { label, Icon, color } = mood
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium"
      style={{
        backgroundColor: `${color}1E`,
        color,
      }}
    >
      <Icon size={14} />
      {label}
    </span>
  )
}

// ──────────────────────────────────────────────────────────
// Fragment Card Component
// ──────────────────────────────────────────────────────────

function FragmentCard({ fragment, index }: { fragment: Fragment; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: SOFT_EASE, delay: index * 0.06 }}
      className="rounded-2xl p-4"
      style={{
        backgroundColor: 'var(--bg-surface)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
        border: '1px solid var(--divider)',
      }}
    >
      {/* Top row: mood + timestamp */}
      <div className="mb-3 flex items-center justify-between">
        <div>{fragment.mood && <MoodTag moodKey={fragment.mood} />}</div>
        <span
          className="text-xs font-ui"
          style={{ color: 'var(--text-tertiary)' }}
        >
          {fragment.timestamp}
        </span>
      </div>

      {/* Content */}
      {fragment.content && (
        <p
          className="whitespace-pre-wrap font-body text-[15px] leading-relaxed"
          style={{ color: 'var(--text-primary)' }}
        >
          {fragment.content}
        </p>
      )}

      {/* Images */}
      {fragment.images && fragment.images.length > 0 && (
        <div
          className={`mt-3 grid gap-2 ${fragment.images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}
        >
          {fragment.images.map((img, i) => (
            <motion.div
              key={i}
              initial={{ scale: 1.02 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.2 }}
              className={`overflow-hidden rounded-xl ${fragment.images!.length === 1 ? 'aspect-[4/3]' : 'aspect-square'}`}
            >
              <img
                src={img}
                alt={`图片 ${i + 1}`}
                className="h-full w-full object-cover"
              />
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  )
}

// ──────────────────────────────────────────────────────────
// Bottom Drawer Component
// ──────────────────────────────────────────────────────────

function BottomDrawer({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (fragment: Omit<Fragment, 'id' | 'timestamp'>) => void
}) {
  const [tab, setTab] = useState<DrawerTab>('text')
  const [textValue, setTextValue] = useState('')
  const [longTextValue, setLongTextValue] = useState('')
  const [selectedMood, setSelectedMood] = useState<MoodKey | null>(null)
  const [moodNote, setMoodNote] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragAreaRef = useRef<HTMLDivElement>(null)

  const resetState = useCallback(() => {
    setTextValue('')
    setLongTextValue('')
    setSelectedMood(null)
    setMoodNote('')
    setImages([])
    setIsSubmitting(false)
    setShowSuccess(false)
    setTab('text')
  }, [])

  const handleClose = useCallback(() => {
    onClose()
    setTimeout(resetState, 300)
  }, [onClose, resetState])

  const handleSubmit = useCallback(async () => {
    let content = ''
    let type: Fragment['type'] = 'text'
    let mood = selectedMood
    let fragmentImages: string[] | undefined

    switch (tab) {
      case 'text':
        if (!textValue.trim()) return
        content = textValue.trim()
        type = 'text'
        break
      case 'longtext':
        if (!longTextValue.trim()) return
        content = longTextValue.trim()
        type = 'text'
        break
      case 'image':
        if (images.length === 0) return
        fragmentImages = images
        type = 'image'
        break
      case 'mood':
        if (!selectedMood) return
        content = moodNote.trim()
        type = selectedMood ? 'text' : 'text'
        break
    }

    setIsSubmitting(true)
    await new Promise((r) => setTimeout(r, 300))

    onSubmit({
      type,
      content: content || undefined,
      images: fragmentImages,
      mood: mood || undefined,
    })

    setIsSubmitting(false)
    setShowSuccess(true)
    await new Promise((r) => setTimeout(r, 400))
    handleClose()
  }, [tab, textValue, longTextValue, selectedMood, moodNote, images, onSubmit, handleClose])

  const canSubmit =
    (tab === 'text' && textValue.trim().length > 0) ||
    (tab === 'longtext' && longTextValue.trim().length > 0) ||
    (tab === 'image' && images.length > 0) ||
    (tab === 'mood' && selectedMood !== null)

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (!files) return
      Array.from(files).forEach((file) => {
        if (images.length >= 9) return
        const url = URL.createObjectURL(file)
        setImages((prev) => [...prev, url])
      })
    },
    [images.length]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (dragAreaRef.current) {
      dragAreaRef.current.style.borderColor = 'var(--accent)'
    }
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (dragAreaRef.current) {
      dragAreaRef.current.style.borderColor = 'var(--divider)'
    }
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      if (dragAreaRef.current) {
        dragAreaRef.current.style.borderColor = 'var(--divider)'
      }
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.type.startsWith('image/')
      )
      files.forEach((file) => {
        if (images.length >= 9) return
        const url = URL.createObjectURL(file)
        setImages((prev) => [...prev, url])
      })
    },
    [images.length]
  )

  const removeImage = useCallback((index: number) => {
    setImages((prev) => {
      const next = [...prev]
      next.splice(index, 1)
      return next
    })
  }, [])

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-overlay"
            style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}
            onClick={handleClose}
          />

          {/* Drawer */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={DRAWER_SPRING}
            className="fixed bottom-0 left-0 right-0 z-drawer mx-auto max-w-[480px]"
            style={{
              height: '85vh',
              maxHeight: '640px',
              backgroundColor: 'var(--bg-elevated)',
              borderRadius: '24px 24px 0 0',
            }}
          >
            {/* Handle pill */}
            <div className="flex justify-center pt-3 pb-2">
              <div
                className="h-1 w-10 rounded-full"
                style={{ backgroundColor: 'var(--divider)' }}
              />
            </div>

            {/* Header */}
            <div className="relative flex items-center justify-center px-5 pb-3">
              <h2
                className="font-display text-lg"
                style={{ color: 'var(--text-primary)' }}
              >
                记录此刻
              </h2>
              <button
                onClick={handleClose}
                className="absolute right-4 flex h-11 w-11 items-center justify-center rounded-full"
                style={{ color: 'var(--text-secondary)' }}
              >
                <X size={22} />
              </button>
            </div>

            {/* Tab bar */}
            <div
              className="mx-5 mb-4 flex gap-1 rounded-xl p-1"
              style={{ backgroundColor: 'var(--bg-surface)' }}
            >
              {TAB_CONFIG.map(({ key, label, Icon }) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className="flex flex-1 items-center justify-center gap-1 rounded-lg py-2.5 text-sm font-medium transition-colors duration-200"
                  style={{
                    backgroundColor:
                      tab === key ? 'var(--bg-elevated)' : 'transparent',
                    color:
                      tab === key
                        ? 'var(--text-primary)'
                        : 'var(--text-tertiary)',
                  }}
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
            </div>

            {/* Content area */}
            <div className="flex-1 overflow-y-auto px-5 pb-4">
              <AnimatePresence mode="wait">
                {/* ── Text Tab ── */}
                {tab === 'text' && (
                  <motion.div
                    key="text"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <textarea
                      autoFocus
                      value={textValue}
                      onChange={(e) => setTextValue(e.target.value)}
                      placeholder="此刻在想什么..."
                      className="w-full resize-none rounded-xl border p-4 font-body text-[15px] leading-relaxed outline-none transition-all duration-200 focus:shadow-[0_0_0_3px_var(--accent-soft)]"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--divider)',
                        color: 'var(--text-primary)',
                        minHeight: '120px',
                        maxHeight: '200px',
                      }}
                      rows={3}
                    />
                    {textValue.length > 50 && (
                      <p
                        className="mt-1 text-right text-xs font-ui"
                        style={{ color: 'var(--text-tertiary)' }}
                      >
                        {textValue.length} 字
                      </p>
                    )}
                  </motion.div>
                )}

                {/* ── Long Text Tab ── */}
                {tab === 'longtext' && (
                  <motion.div
                    key="longtext"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <textarea
                      autoFocus
                      value={longTextValue}
                      onChange={(e) => setLongTextValue(e.target.value)}
                      placeholder="把今天的故事写下来..."
                      className="w-full resize-none rounded-xl border p-4 font-body text-[15px] leading-relaxed outline-none transition-all duration-200 focus:shadow-[0_0_0_3px_var(--accent-soft)]"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--divider)',
                        color: 'var(--text-primary)',
                        minHeight: '200px',
                        maxHeight: '320px',
                      }}
                      rows={6}
                    />
                    <p
                      className="mt-1 text-right text-xs font-ui"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      {longTextValue.length} 字
                    </p>
                  </motion.div>
                )}

                {/* ── Image Tab ── */}
                {tab === 'image' && (
                  <motion.div
                    key="image"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    {images.length === 0 ? (
                      <div
                        ref={dragAreaRef}
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-12 transition-colors duration-200 hover:border-[var(--accent)]"
                        style={{ borderColor: 'var(--divider)' }}
                      >
                        <ImagePlus
                          size={48}
                          style={{ color: 'var(--text-tertiary)' }}
                        />
                        <p
                          className="mt-3 text-sm font-ui"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          点击或拖拽上传图片
                        </p>
                        <p
                          className="mt-1 text-xs font-ui"
                          style={{ color: 'var(--text-tertiary)' }}
                        >
                          支持 JPG, PNG, HEIC
                        </p>
                      </div>
                    ) : (
                      <div>
                        <div className="grid grid-cols-3 gap-2">
                          {images.map((img, i) => (
                            <div
                              key={i}
                              className="relative aspect-square overflow-hidden rounded-xl"
                            >
                              <img
                                src={img}
                                alt={`预览 ${i + 1}`}
                                className="h-full w-full object-cover"
                              />
                              <button
                                onClick={() => removeImage(i)}
                                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ))}
                          {images.length < 9 && (
                            <button
                              onClick={() => fileInputRef.current?.click()}
                              className="flex aspect-square items-center justify-center rounded-xl border-2 border-dashed"
                              style={{ borderColor: 'var(--divider)' }}
                            >
                              <Plus
                                size={24}
                                style={{ color: 'var(--text-tertiary)' }}
                              />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={handleFileSelect}
                    />
                  </motion.div>
                )}

                {/* ── Mood Tab ── */}
                {tab === 'mood' && (
                  <motion.div
                    key="mood"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <div className="grid grid-cols-2 gap-3">
                      {MOODS.map(({ key, label, Icon, color }) => {
                        const isSelected = selectedMood === key
                        return (
                          <motion.button
                            key={key}
                            onClick={() => setSelectedMood(key)}
                            whileTap={{ scale: 1.05 }}
                            className="flex items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition-colors duration-200"
                            style={{
                              backgroundColor: isSelected
                                ? `${color}26`
                                : 'var(--bg-surface)',
                              borderColor: isSelected ? color : 'var(--divider)',
                              borderWidth: isSelected ? '1.5px' : '1px',
                            }}
                          >
                            <span style={{ color }}>
                              <Icon
                                size={24}
                                strokeWidth={2}
                              />
                            </span>
                            <span
                              className="text-sm font-medium"
                              style={{
                                color: isSelected
                                  ? color
                                  : 'var(--text-primary)',
                              }}
                            >
                              {label}
                            </span>
                          </motion.button>
                        )
                      })}
                    </div>
                    {selectedMood && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2 }}
                        className="mt-4"
                      >
                        <textarea
                          value={moodNote}
                          onChange={(e) => setMoodNote(e.target.value)}
                          placeholder="备注...（可选）"
                          className="w-full resize-none rounded-xl border p-4 font-body text-[15px] leading-relaxed outline-none transition-all duration-200 focus:shadow-[0_0_0_3px_var(--accent-soft)]"
                          style={{
                            backgroundColor: 'var(--bg-surface)',
                            borderColor: 'var(--divider)',
                            color: 'var(--text-primary)',
                            minHeight: '80px',
                          }}
                          rows={2}
                        />
                      </motion.div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Submit button */}
            <div className="px-5 pb-[max(16px,env(safe-area-inset-bottom))]">
              <motion.button
                whileTap={canSubmit && !isSubmitting ? { scale: 0.97 } : {}}
                onClick={handleSubmit}
                disabled={!canSubmit || isSubmitting}
                className="flex h-[52px] w-full items-center justify-center rounded-[14px] font-ui text-sm font-semibold text-white transition-opacity duration-200 disabled:opacity-40"
                style={{ backgroundColor: 'var(--accent)' }}
              >
                {showSuccess ? (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="flex items-center gap-2"
                  >
                    已保存
                  </motion.span>
                ) : isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <svg
                      className="h-4 w-4 animate-spin"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    保存中...
                  </span>
                ) : (
                  <span>
                    {tab === 'mood' ? '保存情绪' : '保存'}
                  </span>
                )}
              </motion.button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// ──────────────────────────────────────────────────────────
// Helper: get today's date string (YYYY-MM-DD)
// ──────────────────────────────────────────────────────────

function getTodayDateString(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

// ──────────────────────────────────────────────────────────
// Main Journal Page
// ──────────────────────────────────────────────────────────

export default function Home() {
  const { isAuthenticated } = useAuth()
  const utils = trpc.useUtils()

  const todayDate = getTodayDateString()

  // Load today's entries from the server
  const { data: serverEntries = [] } = trpc.entries.list.useQuery(
    { date: todayDate },
    { enabled: isAuthenticated, staleTime: 1000 * 30 },
  )

  // Mutation to persist a new entry
  const createEntry = trpc.entries.create.useMutation({
    onSuccess: () => {
      utils.entries.list.invalidate({ date: todayDate })
    },
    onError: () => {
      // Toast is handled by the drawer's submit handler; just log here
      console.error('[Home] Failed to create entry')
    },
  })

  // Convert server entries to the local Fragment type for rendering
  const serverFragments: Fragment[] = serverEntries.map((entry) => ({
    id: String(entry.id),
    type: entry.hasImages ? 'image' : 'text',
    content: entry.contentText || undefined,
    images: undefined, // images are loaded via attachments; not shown here as blob URLs
    mood: (entry.moodLabel as MoodKey) || undefined,
    timestamp: formatTime(entry.createdAt), // use actual creation time, not current time
  }))

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [promptIndex, setPromptIndex] = useState(0)
  const [dateInfo] = useState(getFormattedDate)
  const [headerStyle, setHeaderStyle] = useState({ opacity: 1, y: 0 })
  const scrollRef = useRef<HTMLDivElement>(null)

  // Prompt rotation every 8s
  useEffect(() => {
    const interval = setInterval(() => {
      setPromptIndex((prev) => (prev + 1) % PROMPTS.length)
    }, 8000)
    return () => clearInterval(interval)
  }, [])

  // Scroll handler for header fade
  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const scrollY = el.scrollTop
    if (scrollY > 60) {
      setHeaderStyle({ opacity: 0.7, y: -4 })
    } else {
      setHeaderStyle({ opacity: 1, y: 0 })
    }
  }, [])

  // Persist entry to backend; image-only entries are not yet supported (upload TODO)
  const handleAddFragment = useCallback(
    async (data: Omit<Fragment, 'id' | 'timestamp'>) => {
      if (!isAuthenticated) return

      const contentText = data.content?.trim() || (data.mood ? `[情绪: ${data.mood}]` : '')
      if (!contentText && (!data.images || data.images.length === 0)) return

      await createEntry.mutateAsync({
        contentText: contentText || '(图片)',
        moodLabel: data.mood || undefined,
        entryDate: todayDate,
      })
    },
    [isAuthenticated, createEntry, todayDate],
  )

  const fragments = serverFragments

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="no-scrollbar relative h-[100dvh] overflow-y-auto"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      {/* ── Date Header ── */}
      <motion.header
        className="sticky top-0 z-20 px-4 pb-3 pt-5"
        style={{
          backgroundColor: 'var(--bg-primary)',
          opacity: headerStyle.opacity,
          y: headerStyle.y,
          transition: 'opacity 200ms ease, transform 200ms ease',
          background: `linear-gradient(to bottom, var(--bg-primary) 0%, var(--bg-primary) 85%, transparent 100%)`,
        }}
      >
        <p
          className="text-xs font-ui tracking-wide"
          style={{ color: 'var(--text-tertiary)' }}
        >
          {dateInfo.yearMonth}
        </p>
        <h1
          className="mt-0.5 font-ui text-[15px] font-medium tracking-wide"
          style={{ color: 'var(--text-primary)' }}
        >
          {dateInfo.dayWeek}
        </h1>
        <div className="mt-1 h-5 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.p
              key={promptIndex}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.6, ease: SOFT_EASE }}
              className="text-sm font-ui"
              style={{ color: 'var(--text-secondary)' }}
            >
              {PROMPTS[promptIndex]}
            </motion.p>
          </AnimatePresence>
        </div>
      </motion.header>

      {/* ── Fragment Stream ── */}
      <div className="px-4 pb-32 pt-3">
        {fragments.length === 0 ? (
          /* ── Empty State ── */
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="flex flex-col items-center justify-center"
            style={{
              minHeight: 'calc(100dvh - 200px)',
              color: 'var(--text-tertiary)',
            }}
          >
            <EmptyStateIllustration />
            <p className="mt-4 font-body text-[15px]" style={{ color: 'var(--text-tertiary)' }}>
              今天还没有记录
            </p>
            <p className="mt-1 text-xs font-ui" style={{ color: 'var(--text-tertiary)' }}>
              点击下面的 + 开始吧
            </p>
          </motion.div>
        ) : (
          /* ── Fragment Cards ── */
          <div className="flex flex-col gap-3">
            <AnimatePresence>
              {fragments.map((fragment, index) => (
                <FragmentCard key={fragment.id} fragment={fragment} index={index} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* ── Quick-Add FAB ── */}
      <motion.button
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{
          type: 'spring',
          damping: 20,
          stiffness: 300,
          delay: 0.4,
        }}
        whileTap={{ scale: 0.88 }}
        onClick={() => setDrawerOpen(true)}
        className="fixed left-1/2 z-fab flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full text-white shadow-fab"
        style={{
          bottom: '88px',
          backgroundColor: 'var(--accent)',
        }}
        aria-label="添加记录"
      >
        <motion.div
          animate={{ scale: [1, 1.03, 1] }}
          transition={{
            duration: 2,
            ease: 'easeInOut',
            repeat: Infinity,
            repeatDelay: 3,
          }}
        >
          <Plus size={20} strokeWidth={2.5} />
        </motion.div>
      </motion.button>

      {/* ── Bottom Drawer ── */}
      <BottomDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSubmit={handleAddFragment}
      />
    </div>
  )
}
