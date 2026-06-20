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
  Loader2,
  Check,
  AlertTriangle,
} from 'lucide-react'
import { trpc } from '@/providers/trpc'
import { useAuth } from '@/hooks/useAuth'
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight'
import { format } from 'date-fns'

// ──────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────

interface AttachmentMeta {
  fileUrl: string
  visionStatus: string
  visionSummary?: string
  visionModelUsed?: string
}

interface Fragment {
  id: string
  type: 'text' | 'image' | 'mixed'
  content?: string
  images?: string[]
  attachmentMetas?: AttachmentMeta[]
  mood?: MoodKey
  timestamp: string
}

interface UploadedAttachment {
  fileUrl: string
  fileType: string
  fileName: string
  storagePath: string
}

type MoodKey = 'happy' | 'calm' | 'sad' | 'tired' | 'excited' | 'anxious'

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
// Vision Status Badge
// ──────────────────────────────────────────────────────────

function VisionBadge({ meta }: { meta: AttachmentMeta }) {
  const [expanded, setExpanded] = useState(false)

  if (meta.visionStatus === 'completed' && meta.visionSummary) {
    return (
      <>
        <button
          onClick={() => setExpanded(!expanded)}
          className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full transition-colors"
          style={{
            backgroundColor: 'rgba(34, 197, 94, 0.85)',
            backdropFilter: 'blur(4px)',
            boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
          }}
          title="图片已分析 — 点击查看结果"
        >
          <Check size={12} strokeWidth={3} color="#fff" />
        </button>
        {expanded && (
          <div
            className="absolute bottom-0 left-0 right-0 z-10 max-h-[40%] overflow-y-auto rounded-b-xl px-3 py-2"
            style={{
              backgroundColor: 'rgba(0,0,0,0.72)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <button
              onClick={() => setExpanded(false)}
              className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-white/80"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            <p className="text-xs leading-relaxed text-white/90 pr-4">
              {meta.visionSummary}
            </p>
            {meta.visionModelUsed && (
              <p className="mt-1 text-[10px] text-white/40">
                via {meta.visionModelUsed}
              </p>
            )}
          </div>
        )}
      </>
    )
  }

  if (meta.visionStatus === 'failed') {
    return (
      <div
        className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full"
        style={{
          backgroundColor: 'rgba(239, 68, 68, 0.85)',
          backdropFilter: 'blur(4px)',
          boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
        }}
        title="图片分析失败"
      >
        <AlertTriangle size={12} strokeWidth={2.5} color="#fff" />
      </div>
    )
  }

  // pending — spinning loader
  return (
    <div
      className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full"
      style={{
        backgroundColor: 'rgba(255,255,255,0.85)',
        backdropFilter: 'blur(4px)',
        boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
      }}
      title="图片分析中…"
    >
      <Loader2 size={13} strokeWidth={2.5} className="animate-spin" style={{ color: 'var(--text-secondary)' }} />
    </div>
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
              className={`group relative overflow-hidden rounded-xl ${fragment.images!.length === 1 ? 'aspect-[4/3]' : 'aspect-square'}`}
            >
              <img
                src={img}
                alt={`图片 ${i + 1}`}
                className="h-full w-full object-cover"
              />
                {fragment.attachmentMetas?.[i] && <VisionBadge meta={fragment.attachmentMetas[i]} />}
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
  onSubmit: (fragment: Omit<Fragment, 'id' | 'timestamp'>, attachments?: UploadedAttachment[]) => void
}) {
  const [selectedMood, setSelectedMood] = useState<MoodKey | null>(null)
  const [textValue, setTextValue] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const keyboardHeight = useKeyboardHeight()

  // Lock body scroll when drawer is open.
  // We avoid position:fixed on the body because it causes layout jumps on
  // keyboard show/hide that get misinterpreted as clicks on the overlay.
  // Instead we use overflow + overscroll-behavior on html/body and block
  // touchmove events outside the drawer's scrollable content area, which
  // reliably prevents iOS Safari background scroll-through.
  useEffect(() => {
    if (!open) return

    const html = document.documentElement
    const body = document.body

    body.style.overflow = 'hidden'
    html.style.overflow = 'hidden'
    body.style.overscrollBehavior = 'none'
    html.style.overscrollBehavior = 'none'

    const preventTouchMove = (e: TouchEvent) => {
      if (contentRef.current?.contains(e.target as Node)) return
      e.preventDefault()
    }
    document.addEventListener('touchmove', preventTouchMove, { passive: false })

    return () => {
      body.style.overflow = ''
      html.style.overflow = ''
      body.style.overscrollBehavior = ''
      html.style.overscrollBehavior = ''
      document.removeEventListener('touchmove', preventTouchMove)
    }
  }, [open])

  const resetState = useCallback(() => {
    setSelectedMood(null)
    setTextValue('')
    setImages([])
    setImageFiles([])
    setIsSubmitting(false)
    setShowSuccess(false)
  }, [])

  const handleClose = useCallback(() => {
    onClose()
    setTimeout(resetState, 300)
  }, [onClose, resetState])

  const handleSubmit = useCallback(async () => {
    if (!selectedMood || !textValue.trim()) return

    setIsSubmitting(true)

    // Upload image files to the server
    let uploadedAttachments: UploadedAttachment[] | undefined
    if (imageFiles.length > 0) {
      uploadedAttachments = []
      for (const file of imageFiles) {
        try {
          const formData = new FormData()
          formData.append('file', file)
          const res = await fetch('/api/upload/file', {
            method: 'POST',
            body: formData,
          })
          if (res.ok) {
            const data = await res.json()
            uploadedAttachments.push({
              fileUrl: data.fileUrl,
              fileType: file.type,
              fileName: data.fileName,
              storagePath: data.storagePath,
            })
          }
        } catch (err) {
          console.error('[Home] Failed to upload image:', err)
        }
      }
    }

    await onSubmit({
      type: imageFiles.length > 0 ? 'mixed' : 'text',
      content: textValue.trim(),
      images: uploadedAttachments?.map((a) => a.fileUrl),
      mood: selectedMood,
    }, uploadedAttachments)

    setIsSubmitting(false)
    setShowSuccess(true)
    await new Promise((r) => setTimeout(r, 400))
    handleClose()
  }, [selectedMood, textValue, imageFiles, onSubmit, handleClose])

  const canSubmit = selectedMood !== null && textValue.trim().length > 0

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (!files) return
      Array.from(files).forEach((file) => {
        if (images.length >= 9) return
        const url = URL.createObjectURL(file)
        setImages((prev) => [...prev, url])
        setImageFiles((prev) => [...prev, file])
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
    setImageFiles((prev) => {
      const next = [...prev]
      next.splice(index, 1)
      return next
    })
  }, [])

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop — sits BELOW the drawer (z-overlay < z-drawer).
              Clicks are ignored while the keyboard is open to prevent
              accidental close when the keyboard dismisses and the layout
              shifts, which would otherwise register as a tap on the overlay. */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-overlay"
            style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}
            onClick={keyboardHeight > 0 ? undefined : handleClose}
          />

          {/* Drawer — sits ABOVE the overlay so its controls are always
              tappable. Height is a stable 85vh (max 640px normally); when the
              keyboard opens we shift bottom up and cap maxHeight to the
              remaining visible viewport so the header never clips off-screen. */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={DRAWER_SPRING}
            className="fixed left-0 right-0 z-drawer mx-auto flex max-w-[480px] flex-col"
            style={{
              bottom: `${keyboardHeight}px`,
              height: '85vh',
              maxHeight: keyboardHeight > 0
                ? `${window.innerHeight - keyboardHeight}px`
                : '640px',
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

            {/* Content area — unified form: mood (required) → text (required) → images (optional) */}
            <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
              {/* ── Step 1: Mood (required) ── */}
              <div className="mb-2 flex items-center gap-2">
                <span
                  className="text-xs font-medium"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  心情
                </span>
                <span
                  className="text-xs"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  ·必选
                </span>
              </div>
              <div className="mb-5 grid grid-cols-3 gap-2">
                {MOODS.map(({ key, label, Icon, color }) => {
                  const isSelected = selectedMood === key
                  return (
                    <motion.button
                      key={key}
                      onClick={() => setSelectedMood(key)}
                      whileTap={{ scale: 1.05 }}
                      className="flex flex-col items-center gap-1.5 rounded-xl border py-3 transition-colors duration-200"
                      style={{
                        backgroundColor: isSelected
                          ? `${color}26`
                          : 'var(--bg-surface)',
                        borderColor: isSelected ? color : 'var(--divider)',
                        borderWidth: isSelected ? '1.5px' : '1px',
                      }}
                    >
                      <span style={{ color }}>
                        <Icon size={22} strokeWidth={2} />
                      </span>
                      <span
                        className="text-xs font-medium"
                        style={{
                          color: isSelected ? color : 'var(--text-primary)',
                        }}
                      >
                        {label}
                      </span>
                    </motion.button>
                  )
                })}
              </div>

              {/* ── Step 2: Text (required) ── */}
              <div className="mb-2 flex items-center gap-2">
                <span
                  className="text-xs font-medium"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  记录
                </span>
                <span
                  className="text-xs"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  ·必填
                </span>
              </div>
              <textarea
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                onFocus={(e) => {
                  setTimeout(() => {
                    e.target.scrollIntoView({ block: 'center', behavior: 'smooth' })
                  }, 300)
                }}
                placeholder="此刻在想什么..."
                className="w-full resize-none rounded-xl border p-4 font-body text-[15px] leading-relaxed outline-none transition-all duration-200 focus:shadow-[0_0_0_3px_var(--accent-soft)]"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--divider)',
                  color: 'var(--text-primary)',
                  minHeight: '120px',
                  maxHeight: '240px',
                }}
                rows={4}
              />
              {textValue.length > 0 && (
                <p
                  className="mt-1 text-right text-xs font-ui"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  {textValue.length} 字
                </p>
              )}

              {/* ── Step 3: Images (optional) ── */}
              <div className="mb-2 mt-5 flex items-center gap-2">
                <span
                  className="text-xs font-medium"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  图片
                </span>
                <span
                  className="text-xs"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  ·可选
                </span>
              </div>
              {images.length === 0 ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 transition-colors duration-200"
                  style={{ borderColor: 'var(--divider)' }}
                >
                  <ImagePlus size={36} style={{ color: 'var(--text-tertiary)' }} />
                  <p
                    className="mt-2 text-sm font-ui"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    点击上传图片
                  </p>
                  <p
                    className="mt-0.5 text-xs font-ui"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    支持 JPG, PNG, HEIC
                  </p>
                </div>
              ) : (
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
                      <Plus size={24} style={{ color: 'var(--text-tertiary)' }} />
                    </button>
                  )}
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
                  <span>保存</span>
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
  const serverFragments: Fragment[] = serverEntries.map((entry) => {
    const attachments = (entry as { attachments?: Array<{
      fileUrl: string
      visionStatus: string
      visionSummary?: string
      visionModelUsed?: string
    }> }).attachments
    const attachmentUrls = attachments
      ?.map((a) => a.fileUrl)
      .filter(Boolean)
    const attachmentMetas = attachments?.map((a) => ({
      fileUrl: a.fileUrl,
      visionStatus: a.visionStatus,
      visionSummary: a.visionSummary,
      visionModelUsed: a.visionModelUsed,
    }))
    return {
      id: String(entry.id),
      type: entry.hasImages ? (entry.contentText ? 'mixed' : 'image') : 'text',
      content: entry.contentText || undefined,
      images: attachmentUrls && attachmentUrls.length > 0 ? attachmentUrls : undefined,
      attachmentMetas: attachmentMetas && attachmentMetas.length > 0 ? attachmentMetas : undefined,
      mood: (entry.moodLabel as MoodKey) || undefined,
      timestamp: formatTime(entry.createdAt),
    }
  })

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

  const handleAddFragment = useCallback(
    async (data: Omit<Fragment, 'id' | 'timestamp'>, attachments?: UploadedAttachment[]) => {
      if (!isAuthenticated) return

      await createEntry.mutateAsync({
        contentText: data.content!.trim(),
        moodLabel: data.mood!,
        entryDate: todayDate,
        attachments: attachments && attachments.length > 0 ? attachments : undefined,
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
        initial={{ scale: 0, opacity: 0, x: '-50%' }}
        animate={{ scale: 1, opacity: 1, x: '-50%' }}
        transition={{
          type: 'spring',
          damping: 20,
          stiffness: 300,
          delay: 0.4,
        }}
        whileTap={{ scale: 0.88, x: '-50%' }}
        onClick={() => setDrawerOpen(true)}
        className="fixed left-1/2 z-fab flex h-14 w-14 items-center justify-center rounded-full text-white shadow-fab"
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
