import { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router'
import {
  Settings,
  User,
  Image,
  PenTool,
  Palette,
  Database,
  LogOut,
  Eye,
  EyeOff,
  TestTube,
  Check,
  X,
  Loader2,
  Download,
  Trash2,
  AlertTriangle,
  Monitor,
  Sun,
  Moon,
  ChevronRight,
  Sparkles,
  RotateCcw,
  Save,
  FolderOpen,
} from 'lucide-react'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

import { trpc } from '@/providers/trpc'
import { useAuth } from '@/hooks/useAuth'
import { LOGIN_PATH } from '@/const'
import useTheme from '@/hooks/useTheme'

/* ── default prompts ── */
const DEFAULT_VISION_PROMPT = `你是一个私人记忆整理系统中的图片理解助手。你的任务不是普通看图识物，而是把用户上传的图片转化成可以用于日记写作的"记忆素材"。\n\n你会收到：\n1. 图片\n2. 图片对应记录的文字\n3. 图片创建时间\n4. 当天前后若干条文字记录作为上下文\n5. 当天日期\n\n请你根据图片和上下文，生成一段适合放入日记写作素材中的图片概要。\n\n要求：\n1. 先描述图片中客观可见的内容\n2. 再结合上下文，轻微总结这张图片在当天中的情绪位置\n3. 可以有感性，但不能夸张\n4. 可以有生活气息，但不能编造事实\n5. 不要推测用户身份、健康状况等敏感属性\n6. 不要进行心理诊断\n7. 不要把图片写成广告文案\n8. 不要输出过长内容\n9. 如果图片内容不清楚，请明确说明"不确定"\n10. 如果图片中有文字，尽量提取关键信息\n\n输出 JSON：\n{\n  "objective_description": "图片中客观可见的内容",\n  "emotional_summary": "结合上下文后的感性概要",\n  "usable_diary_material": "适合传给日记模型使用的一段综合描述"\n}`

const DEFAULT_DIARY_PROMPT = `你是一个私人日记整理助手。你的任务不是写总结、不是写任务清单、不是写公众号文章，而是根据用户一天中零散留下的文字、情绪、经历和图片概要，整理成一篇自然、有情绪、有生活质感的日记。\n\n你会收到：\n1. 日期\n2. 用户当天所有文字碎片\n3. 每条碎片的时间\n4. 用户可选的情绪标签\n5. 图片理解模型生成的图片概要\n6. 用户选择的日记风格\n7. 用户选择的日记长度\n\n请遵守：\n1. 不要虚构重大事件\n2. 可以基于用户表达进行轻微文学化整理，但不能改变事实\n3. 不要进行心理诊断\n4. 不要用"你应该""你必须"说教\n5. 不要写成鸡汤\n6. 不要写成公众号文章\n7. 不要写成工作总结\n8. 不要过度积极\n9. 不要过度美化痛苦\n10. 不要制造不存在的人际关系\n11. 信息少时就写短一点，不要硬凑\n12. 保留用户原本的语气、混乱感和情绪纹理\n13. 日记要像用户自己写的，但更完整、更清晰、更有流动感\n14. 图片概要可以融入正文，但不要在正文中插入图片链接\n15. 正文结尾可以留一句轻微的余味，但不要鸡汤\n\n日记长度：\n- 短：300到500字\n- 中：700到1000字\n- 长：1200到1800字\n\n输出 JSON：\n{\n  "title": "日记标题",\n  "summary": "一句话摘要",\n  "content": "完整日记正文"\n}`

/* ── constants ── */
const DIARY_STYLES = [
  { value: '温柔真实', desc: '像朋友间的轻声倾诉' },
  { value: '文学感', desc: '细腻的文学化表达' },
  { value: '克制冷静', desc: '简洁、观察者的视角' },
  { value: '情绪充沛', desc: '饱满的情感流露' },
  { value: '像写给未来的自己', desc: '时间胶囊般的叙述' },
  { value: '清醒但不冷漠', desc: '理性中带着温度' },
] as const

// Default per-style prompt snippets. Users can edit and override these.
// When generating a diary, the selected style's snippet gets injected into
// the main diary prompt to steer the LLM's writing voice.
const DEFAULT_STYLE_PROMPTS: Record<string, string> = {
  '温柔真实': '像朋友间的轻声倾诉，语气温柔但真实。不刻意渲染情绪，让日常细节自然流露。多用短句，偶尔停下来，像在想什么事情。',
  '文学感': '用细腻的文学化语言，可以有比喻和意象。句式错落有致，注重画面感和节奏感。允许适度的文学化加工，但不能改变事实。',
  '克制冷静': '简洁、客观、观察者的视角。少用形容词，让事实本身说话。情绪藏在留白和沉默里，不直接说出来。',
  '情绪充沛': '允许情感饱满地流露，可以直抒胸臆。不用克制，但不要无病呻吟。情绪是真实的，就让它出来。',
  '像写给未来的自己': '以时间胶囊的口吻叙述，像在跟未来的自己对话。可以带有回顾和期许，但不要说教。把今天留给未来的自己去读。',
  '清醒但不冷漠': '理性中带着温度。有观察有思考，但不冷硬。保持对生活的善意，看清楚了依然温柔。',
}

const DIARY_LENGTHS = [
  { value: '短', range: '300-500字' },
  { value: '中', range: '700-1000字' },
  { value: '长', range: '1200-1800字' },
] as const

const LANGUAGES = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
  { value: 'jp', label: '日本語' },
  { value: 'ko', label: '한국어' },
] as const

/* ── animation variants ── */
const tabContentVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
}

const cardStagger = {
  visible: { transition: { staggerChildren: 0.06 } },
}

const cardItem = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] },
  },
}

/* ── types ── */
type TabId = 'account' | 'image' | 'writer' | 'theme' | 'data'

interface TabDef {
  id: TabId
  label: string
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>
}

const TABS: TabDef[] = [
  { id: 'account', label: '账户', Icon: User },
  { id: 'image', label: '图片模型', Icon: Image },
  { id: 'writer', label: '写作模型', Icon: PenTool },
  { id: 'theme', label: '主题', Icon: Palette },
  { id: 'data', label: '数据', Icon: Database },
]

/* ═══════════════════════════════════════════
   Preset Manager Component
   ═══════════════════════════════════════════ */
function PresetManager({
  type,
  currentApiBase,
  currentApiKey,
  currentModel,
  onLoadPreset,
}: {
  type: 'vision' | 'diary'
  currentApiBase: string
  currentApiKey: string
  currentModel: string
  onLoadPreset: (preset: { apiBaseUrl: string | null; apiKey: string | null; model: string | null }) => void
}) {
  const utils = trpc.useUtils()
  const { data: allPresets } = trpc.aiSettings.listPresets.useQuery()
  const createPresetMutation = trpc.aiSettings.createPreset.useMutation({
    onSuccess: () => utils.aiSettings.listPresets.invalidate(),
  })
  const deletePresetMutation = trpc.aiSettings.deletePreset.useMutation({
    onSuccess: () => utils.aiSettings.listPresets.invalidate(),
  })
  const loadPresetMutation = trpc.aiSettings.loadPreset.useMutation({
    onSuccess: () => utils.aiSettings.get.invalidate(),
  })

  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [presetName, setPresetName] = useState('')

  const presets = allPresets?.filter((p) => p.type === type) ?? []

  const handleSave = useCallback(() => {
    if (!presetName.trim()) return
    createPresetMutation.mutate({
      name: presetName.trim(),
      type,
      apiBaseUrl: currentApiBase || undefined,
      apiKey: currentApiKey || undefined,
      model: currentModel || undefined,
    })
    setPresetName('')
    setShowSaveDialog(false)
  }, [presetName, type, currentApiBase, currentApiKey, currentModel, createPresetMutation])

  const handleLoad = useCallback((presetId: number) => {
    const preset = presets.find((p) => p.id === presetId)
    if (!preset) return
    loadPresetMutation.mutate({ id: presetId })
    onLoadPreset(preset)
  }, [presets, loadPresetMutation, onLoadPreset])

  return (
    <motion.div variants={cardItem}>
      <Card
        className="overflow-hidden rounded-2xl border-0 shadow-none"
        style={{ backgroundColor: 'var(--bg-surface)' }}
      >
        <CardHeader className="px-4 pt-4 pb-0">
          <CardTitle
            className="text-base font-medium"
            style={{
              fontFamily: "'DM Sans', sans-serif",
              color: 'var(--text-primary)',
            }}
          >
            配置预设
          </CardTitle>
          <CardDescription style={{ color: 'var(--text-tertiary)' }} className="text-xs">
            保存和切换不同供应商的 API 配置
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 p-4">
          {/* Save current as preset */}
          {showSaveDialog ? (
            <div className="flex gap-2">
              <Input
                placeholder="预设名称（如：OpenAI、DeepSeek）"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                className="rounded-lg border-0 text-sm flex-1"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  color: 'var(--text-primary)',
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave()
                  if (e.key === 'Escape') setShowSaveDialog(false)
                }}
                autoFocus
              />
              <Button
                size="sm"
                className="rounded-lg"
                style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
                onClick={handleSave}
                disabled={!presetName.trim() || createPresetMutation.isPending}
              >
                {createPresetMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="rounded-lg"
                onClick={() => setShowSaveDialog(false)}
              >
                <X size={14} />
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              className="w-full gap-2 rounded-lg border-0"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                color: 'var(--text-primary)',
              }}
              onClick={() => setShowSaveDialog(true)}
              disabled={!currentApiBase && !currentApiKey && !currentModel}
            >
              <Save size={16} />
              保存当前配置为预设
            </Button>
          )}

          {/* Preset list */}
          {presets.length > 0 && (
            <div className="flex flex-col gap-1.5 mt-1">
              {presets.map((preset) => (
                <div
                  key={preset.id}
                  className="flex items-center gap-2 rounded-xl px-3 py-2.5"
                  style={{ backgroundColor: 'var(--bg-elevated)' }}
                >
                  <FolderOpen size={14} style={{ color: 'var(--text-tertiary)' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                      {preset.name}
                    </p>
                    <p className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>
                      {preset.model || '未设置模型'} · {(() => { try { return preset.apiBaseUrl ? new URL(preset.apiBaseUrl).hostname : '未设置 URL' } catch { return preset.apiBaseUrl || '未设置 URL' } })()}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs rounded-md"
                    style={{ color: 'var(--accent)' }}
                    onClick={() => handleLoad(preset.id)}
                    disabled={loadPresetMutation.isPending}
                  >
                    加载
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 rounded-md"
                    style={{ color: 'var(--text-tertiary)' }}
                    onClick={() => deletePresetMutation.mutate({ id: preset.id })}
                    disabled={deletePresetMutation.isPending}
                  >
                    <X size={14} />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}

/* ═══════════════════════════════════════════
   Settings Page
   ═══════════════════════════════════════════ */
export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('account')

  return (
    <div className="min-h-[100dvh]" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* ── Header ── */}
      <header
        className="sticky top-0 z-20"
        style={{
          backgroundColor: 'var(--bg-primary)',
          padding: '20px 16px 16px',
        }}
      >
        <motion.div
          className="flex items-center gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <Settings size={24} style={{ color: 'var(--text-tertiary)' }} />
          <h1
            className="text-[22px] font-normal tracking-wide"
            style={{
              fontFamily: "'ZCOOL XiaoWei', serif",
              color: 'var(--text-primary)',
              lineHeight: 1.3,
            }}
          >
            设置
          </h1>
        </motion.div>
      </header>

      {/* ── Tab Navigation ── */}
      <div
        className="sticky top-[60px] z-10"
        style={{
          backgroundColor: 'var(--bg-primary)',
          borderBottom: '1px solid var(--divider)',
        }}
      >
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabId)}>
          <TabsList
            className="flex w-full justify-start gap-0 rounded-none bg-transparent p-0 h-12"
          >
            {TABS.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="relative flex-1 rounded-none border-0 border-b-2 border-transparent bg-transparent px-1 py-0 text-[12px] font-medium data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                style={{
                  color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  transition: 'color 200ms ease',
                  height: '48px',
                }}
              >
                <tab.Icon size={16} className="mr-1" />
                {tab.label}
                {activeTab === tab.id && (
                  <motion.div
                    layoutId="settings-tab-indicator"
                    className="absolute bottom-0 left-0 right-0 h-0.5"
                    style={{ backgroundColor: 'var(--accent)' }}
                    transition={{ type: 'spring', damping: 25, stiffness: 250 }}
                  />
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* ── Tab Contents ── */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              variants={tabContentVariants}
              initial="hidden"
              animate="visible"
              exit={{ opacity: 0, y: -8, transition: { duration: 0.2 } }}
              transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] }}
            >
              <TabsContent value="account" className="mt-0">
                <AccountTab />
              </TabsContent>
              <TabsContent value="image" className="mt-0">
                <ImageModelTab />
              </TabsContent>
              <TabsContent value="writer" className="mt-0">
                <WriterModelTab />
              </TabsContent>
              <TabsContent value="theme" className="mt-0">
                <ThemeTab />
              </TabsContent>
              <TabsContent value="data" className="mt-0">
                <DataTab />
              </TabsContent>
            </motion.div>
          </AnimatePresence>
        </Tabs>
      </div>

      {/* Bottom clearance */}
      <div className="h-[100px]" />
    </div>
  )
}

/* ═══════════════════════════════════════════
   Account Tab
   ═══════════════════════════════════════════ */
function AccountTab() {
  const { user, isAuthenticated, isLoading, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogin = () => {
    navigate(LOGIN_PATH)
  }

  return (
    <motion.div
      className="flex flex-col gap-4 p-4"
      variants={cardStagger}
      initial="hidden"
      animate="visible"
    >
      {/* Profile Card */}
      <motion.div variants={cardItem}>
        <Card
          className="rounded-2xl border-0 shadow-none"
          style={{ backgroundColor: 'var(--bg-surface)' }}
        >
          <CardContent className="flex flex-col items-center gap-4 p-6">
            {/* Avatar */}
            <div
              className="flex h-16 w-16 items-center justify-center rounded-full text-xl font-medium"
              style={{
                backgroundColor: isAuthenticated ? 'var(--accent-soft)' : 'var(--bg-elevated)',
                color: 'var(--accent)',
              }}
            >
              {isAuthenticated && user?.name
                ? user.name.charAt(0).toUpperCase()
                : isAuthenticated && user?.email
                  ? user.email.charAt(0).toUpperCase()
                  : '?'}
            </div>

            {/* Name */}
            <div className="text-center">
              <p
                className="text-base font-medium"
                style={{ color: 'var(--text-primary)' }}
              >
                {isAuthenticated && user?.name
                  ? user.name
                  : isAuthenticated
                    ? '用户'
                    : '未登录'}
              </p>
              {isAuthenticated && user?.email && (
                <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  已绑定邮箱: {user.email}
                </p>
              )}
            </div>

            {/* Status */}
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{
                  backgroundColor: isAuthenticated ? 'var(--success)' : 'var(--text-tertiary)',
                }}
              />
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {isAuthenticated ? '已登录' : '未登录'}
              </span>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Auth Actions */}
      <motion.div variants={cardItem}>
        <Card
          className="rounded-2xl border-0 shadow-none"
          style={{ backgroundColor: 'var(--bg-surface)' }}
        >
          <CardContent className="p-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--accent)' }} />
              </div>
            ) : isAuthenticated ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    className="w-full gap-2"
                    style={{ color: 'var(--error)' }}
                  >
                    <LogOut size={18} />
                    退出登录
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent
                  className="rounded-xl border-0"
                  style={{ backgroundColor: 'var(--bg-elevated)' }}
                >
                  <AlertDialogHeader>
                    <AlertDialogTitle style={{ color: 'var(--text-primary)' }}>
                      退出登录
                    </AlertDialogTitle>
                    <AlertDialogDescription style={{ color: 'var(--text-secondary)' }}>
                      确定要退出登录吗？
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel
                      className="rounded-lg border-0"
                      style={{ backgroundColor: 'var(--bg-surface)', color: 'var(--text-secondary)' }}
                    >
                      取消
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={logout}
                      className="rounded-lg"
                      style={{ backgroundColor: 'var(--error)', color: '#fff' }}
                    >
                      退出
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              <Button
                className="w-full gap-2 rounded-xl"
                style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
                onClick={handleLogin}
              >
                <Sparkles size={18} />
                使用 Kimi 登录
              </Button>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}

/* ═══════════════════════════════════════════
   Image Model Tab
   ═══════════════════════════════════════════ */
function ImageModelTab() {
  const utils = trpc.useUtils()
  const { data: settings, isLoading } = trpc.aiSettings.get.useQuery()
  const updateVision = trpc.aiSettings.updateVision.useMutation({
    onSuccess: () => utils.aiSettings.get.invalidate(),
  })
  const testVision = trpc.aiSettings.testVision.useMutation()

  const [enabled, setEnabled] = useState(true)
  const [apiBase, setApiBase] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [modelName, setModelName] = useState('')
  const [prompt, setPrompt] = useState(DEFAULT_VISION_PROMPT)
  const [showKey, setShowKey] = useState(false)
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [testMessage, setTestMessage] = useState('')

  // Sync from server
  useEffect(() => {
    if (settings) {
      if (settings.enableImageUnderstanding !== null) {
        setEnabled(settings.enableImageUnderstanding)
      }
      if (settings.visionApiBaseUrl) setApiBase(settings.visionApiBaseUrl)
      if (settings.visionModel) setModelName(settings.visionModel)
      if (settings.visionPromptTemplate) setPrompt(settings.visionPromptTemplate)
    }
  }, [settings])

  const handleSave = useCallback(() => {
    const payload: {
      enableImageUnderstanding: boolean
      visionApiBaseUrl?: string
      visionModel?: string
      visionPromptTemplate?: string
      visionApiKey?: string
    } = {
      enableImageUnderstanding: enabled,
      visionApiBaseUrl: apiBase || undefined,
      visionModel: modelName || undefined,
      visionPromptTemplate: prompt || undefined,
    }
    if (apiKey.trim()) {
      payload.visionApiKey = apiKey.trim()
    }
    updateVision.mutate(payload)
  }, [enabled, apiBase, apiKey, modelName, prompt, updateVision])

  const handleTest = useCallback(async () => {
    const keyToTest = apiKey.trim()
    if (!keyToTest) return
    setTestStatus('testing')
    setTestMessage('')
    try {
      const result = await testVision.mutateAsync({
        apiKey: keyToTest,
        baseUrl: apiBase || undefined,
        model: modelName || undefined,
      })
      setTestMessage(result.message)
      setTestStatus('success')
      setTimeout(() => setTestStatus('idle'), 5000)
    } catch (err) {
      const msg = err instanceof Error ? err.message : '连接失败'
      setTestMessage(msg)
      setTestStatus('error')
      setTimeout(() => setTestStatus('idle'), 8000)
    }
  }, [apiKey, apiBase, modelName, testVision])

  const handleResetPrompt = () => setPrompt(DEFAULT_VISION_PROMPT)

  const isSaving = updateVision.isPending

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--accent)' }} />
      </div>
    )
  }

  return (
    <motion.div
      className="flex flex-col gap-4 p-4"
      variants={cardStagger}
      initial="hidden"
      animate="visible"
    >
      {/* Connection Settings */}
      <motion.div variants={cardItem}>
        <Card
          className="overflow-hidden rounded-2xl border-0 shadow-none"
          style={{ backgroundColor: 'var(--bg-surface)' }}
        >
          <CardHeader className="px-4 pt-4 pb-0">
            <CardTitle
              className="text-base font-medium"
              style={{
                fontFamily: "'DM Sans', sans-serif",
                color: 'var(--text-primary)',
              }}
            >
              连接设置
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-0 p-4">
            {/* Enable toggle */}
            <div
              className="flex items-center justify-between py-3"
              style={{ borderBottom: '1px solid var(--divider)' }}
            >
              <Label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                启用图片理解
              </Label>
              <Switch
                checked={enabled}
                onCheckedChange={setEnabled}
                aria-label="启用图片理解"
              />
            </div>

            {/* API Base URL */}
            <div
              className="flex flex-col gap-1.5 py-3"
              style={{ borderBottom: '1px solid var(--divider)' }}
            >
              <Label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                API Base URL
              </Label>
              <Input
                placeholder="https://api.openai.com/v1"
                value={apiBase}
                onChange={(e) => setApiBase(e.target.value)}
                className="rounded-lg border-0 text-sm"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            {/* API Key */}
            <div
              className="flex flex-col gap-1.5 py-3"
              style={{ borderBottom: '1px solid var(--divider)' }}
            >
              <Label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                API Key
              </Label>
              <div className="relative">
                <Input
                  type={showKey ? 'text' : 'password'}
                  placeholder="sk-..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="rounded-lg border-0 pr-10 text-sm"
                  style={{
                    backgroundColor: 'var(--bg-elevated)',
                    color: 'var(--text-primary)',
                  }}
                  aria-label="API Key"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  aria-label={showKey ? '隐藏密码' : '显示密码'}
                >
                  {showKey ? (
                    <EyeOff size={18} style={{ color: 'var(--text-tertiary)' }} />
                  ) : (
                    <Eye size={18} style={{ color: 'var(--text-tertiary)' }} />
                  )}
                </button>
              </div>
            </div>

            {/* Model Name */}
            <div
              className="flex flex-col gap-1.5 py-3"
              style={{ borderBottom: '1px solid var(--divider)' }}
            >
              <Label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                模型名称
              </Label>
              <Input
                placeholder="gpt-4o"
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                className="rounded-lg border-0 text-sm"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            {/* Test Connection */}
            <div className="pt-3">
              <Button
                variant="outline"
                className="w-full gap-2 rounded-lg border-0"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  color: 'var(--text-primary)',
                }}
                onClick={handleTest}
                disabled={testStatus === 'testing' || !apiKey.trim()}
              >
                {testStatus === 'testing' && (
                  <Loader2 size={16} className="animate-spin" style={{ color: 'var(--accent)' }} />
                )}
                {testStatus === 'success' && (
                  <Check size={16} style={{ color: 'var(--success)' }} />
                )}
                {testStatus === 'error' && (
                  <X size={16} style={{ color: 'var(--error)' }} />
                )}
                {testStatus === 'idle' && <TestTube size={16} />}
                <span>
                  {testStatus === 'testing' && '测试中...'}
                  {testStatus === 'success' && '连接成功'}
                  {testStatus === 'error' && '连接失败'}
                  {testStatus === 'idle' && '测试连接'}
                </span>
              </Button>
              {testMessage && (
                <p
                  className="mt-2 text-xs px-1"
                  style={{ color: testStatus === 'error' ? 'var(--error)' : 'var(--success)' }}
                >
                  {testMessage}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Presets */}
      <PresetManager
        type="vision"
        currentApiBase={apiBase}
        currentApiKey={apiKey}
        currentModel={modelName}
        onLoadPreset={(preset) => {
          if (preset.apiBaseUrl) setApiBase(preset.apiBaseUrl)
          if (preset.model) setModelName(preset.model)
        }}
      />

      {/* Prompt Template */}
      <motion.div variants={cardItem}>
        <Card
          className="overflow-hidden rounded-2xl border-0 shadow-none"
          style={{ backgroundColor: 'var(--bg-surface)' }}
        >
          <CardHeader className="px-4 pt-4 pb-0">
            <CardTitle
              className="text-base font-medium"
              style={{
                fontFamily: "'DM Sans', sans-serif",
                color: 'var(--text-primary)',
              }}
            >
              图片理解 Prompt
            </CardTitle>
            <CardDescription style={{ color: 'var(--text-tertiary)' }} className="text-xs">
              编辑 AI 理解图片时使用的提示词模板
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 p-4">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="min-h-[300px] resize-y rounded-xl border font-mono text-sm leading-relaxed"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderColor: 'var(--divider)',
                color: 'var(--text-primary)',
                fontFamily: "'DM Sans', monospace",
              }}
              aria-label="图片理解 Prompt 模板"
            />
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetPrompt}
                className="gap-1 text-xs"
                style={{ color: 'var(--text-tertiary)' }}
              >
                <RotateCcw size={14} />
                恢复默认
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Save Button */}
      <motion.div variants={cardItem}>
        <Button
          className="w-full gap-2 rounded-xl"
          style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
          {isSaving ? '保存中...' : '保存更改'}
        </Button>
      </motion.div>
    </motion.div>
  )
}

/* ═══════════════════════════════════════════
   Writer Model Tab
   ═══════════════════════════════════════════ */
function WriterModelTab() {
  const utils = trpc.useUtils()
  const { data: settings, isLoading } = trpc.aiSettings.get.useQuery()
  const updateDiary = trpc.aiSettings.updateDiary.useMutation({
    onSuccess: () => utils.aiSettings.get.invalidate(),
  })
  const testDiary = trpc.aiSettings.testDiary.useMutation()

  const [apiBase, setApiBase] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [modelName, setModelName] = useState('')
  const [language, setLanguage] = useState('zh')
  const [style, setStyle] = useState('温柔真实')
  const [length, setLength] = useState('中')
  const [genTime, setGenTime] = useState('02:00')
  const [prompt, setPrompt] = useState(DEFAULT_DIARY_PROMPT)
  const [stylePromptsMap, setStylePromptsMap] = useState<Record<string, string>>(DEFAULT_STYLE_PROMPTS)
  const [showKey, setShowKey] = useState(false)
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [testMessage, setTestMessage] = useState('')

  // Sync from server
  useEffect(() => {
    if (settings) {
      if (settings.diaryApiBaseUrl) setApiBase(settings.diaryApiBaseUrl)
      if (settings.diaryModel) setModelName(settings.diaryModel)
      if (settings.diaryLanguage) setLanguage(settings.diaryLanguage)
      if (settings.diaryStyle) setStyle(settings.diaryStyle)
      if (settings.diaryLength) setLength(settings.diaryLength)
      if (settings.diaryGenerationTime) setGenTime(settings.diaryGenerationTime)
      if (settings.diaryPromptTemplate) setPrompt(settings.diaryPromptTemplate)
      if (settings.stylePrompts) {
        try {
          const parsed = JSON.parse(settings.stylePrompts) as Record<string, string>
          // Merge: server overrides defaults, but any new default styles not in
          // server data still fall back to DEFAULT_STYLE_PROMPTS
          setStylePromptsMap({ ...DEFAULT_STYLE_PROMPTS, ...parsed })
        } catch {
          // Malformed JSON — keep defaults
        }
      }
    }
  }, [settings])

  const handleSave = useCallback(() => {
    const payload: {
      diaryApiBaseUrl?: string
      diaryModel?: string
      diaryLanguage?: string
      diaryStyle?: string
      diaryLength?: string
      diaryGenerationTime?: string
      diaryPromptTemplate?: string
      stylePrompts?: string
      diaryApiKey?: string
    } = {
      diaryApiBaseUrl: apiBase || undefined,
      diaryModel: modelName || undefined,
      diaryLanguage: language,
      diaryStyle: style,
      diaryLength: length,
      diaryGenerationTime: genTime,
      diaryPromptTemplate: prompt || undefined,
      stylePrompts: JSON.stringify(stylePromptsMap),
    }
    if (apiKey.trim()) {
      payload.diaryApiKey = apiKey.trim()
    }
    updateDiary.mutate(payload)
  }, [apiBase, apiKey, modelName, language, style, length, genTime, prompt, stylePromptsMap, updateDiary])

  const handleTest = useCallback(async () => {
    const keyToTest = apiKey.trim()
    if (!keyToTest) return
    setTestStatus('testing')
    setTestMessage('')
    try {
      const result = await testDiary.mutateAsync({
        apiKey: keyToTest,
        baseUrl: apiBase || undefined,
        model: modelName || undefined,
      })
      setTestMessage(result.message)
      setTestStatus('success')
      setTimeout(() => setTestStatus('idle'), 5000)
    } catch (err) {
      const msg = err instanceof Error ? err.message : '连接失败'
      setTestMessage(msg)
      setTestStatus('error')
      setTimeout(() => setTestStatus('idle'), 8000)
    }
  }, [apiKey, apiBase, modelName, testDiary])

  const handleResetPrompt = () => setPrompt(DEFAULT_DIARY_PROMPT)

  const handleStylePromptChange = useCallback((styleKey: string, value: string) => {
    setStylePromptsMap((prev) => ({ ...prev, [styleKey]: value }))
  }, [])

  const handleResetStylePrompt = useCallback((styleKey: string) => {
    setStylePromptsMap((prev) => ({ ...prev, [styleKey]: DEFAULT_STYLE_PROMPTS[styleKey] ?? '' }))
  }, [])

  const isSaving = updateDiary.isPending

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--accent)' }} />
      </div>
    )
  }

  return (
    <motion.div
      className="flex flex-col gap-4 p-4"
      variants={cardStagger}
      initial="hidden"
      animate="visible"
    >
      {/* Connection Settings */}
      <motion.div variants={cardItem}>
        <Card
          className="overflow-hidden rounded-2xl border-0 shadow-none"
          style={{ backgroundColor: 'var(--bg-surface)' }}
        >
          <CardHeader className="px-4 pt-4 pb-0">
            <CardTitle
              className="text-base font-medium"
              style={{
                fontFamily: "'DM Sans', sans-serif",
                color: 'var(--text-primary)',
              }}
            >
              连接设置
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-0 p-4">
            {/* API Base URL */}
            <div
              className="flex flex-col gap-1.5 py-3"
              style={{ borderBottom: '1px solid var(--divider)' }}
            >
              <Label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                API Base URL
              </Label>
              <Input
                placeholder="https://api.openai.com/v1"
                value={apiBase}
                onChange={(e) => setApiBase(e.target.value)}
                className="rounded-lg border-0 text-sm"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            {/* API Key */}
            <div
              className="flex flex-col gap-1.5 py-3"
              style={{ borderBottom: '1px solid var(--divider)' }}
            >
              <Label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                API Key
              </Label>
              <div className="relative">
                <Input
                  type={showKey ? 'text' : 'password'}
                  placeholder="sk-..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="rounded-lg border-0 pr-10 text-sm"
                  style={{
                    backgroundColor: 'var(--bg-elevated)',
                    color: 'var(--text-primary)',
                  }}
                  aria-label="API Key"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  aria-label={showKey ? '隐藏密码' : '显示密码'}
                >
                  {showKey ? (
                    <EyeOff size={18} style={{ color: 'var(--text-tertiary)' }} />
                  ) : (
                    <Eye size={18} style={{ color: 'var(--text-tertiary)' }} />
                  )}
                </button>
              </div>
            </div>

            {/* Model Name */}
            <div
              className="flex flex-col gap-1.5 py-3"
              style={{ borderBottom: '1px solid var(--divider)' }}
            >
              <Label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                模型名称
              </Label>
              <Input
                placeholder="gpt-4"
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                className="rounded-lg border-0 text-sm"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            {/* Test Connection */}
            <div className="pt-3">
              <Button
                variant="outline"
                className="w-full gap-2 rounded-lg border-0"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  color: 'var(--text-primary)',
                }}
                onClick={handleTest}
                disabled={testStatus === 'testing' || !apiKey.trim()}
              >
                {testStatus === 'testing' && (
                  <Loader2 size={16} className="animate-spin" style={{ color: 'var(--accent)' }} />
                )}
                {testStatus === 'success' && (
                  <Check size={16} style={{ color: 'var(--success)' }} />
                )}
                {testStatus === 'error' && (
                  <X size={16} style={{ color: 'var(--error)' }} />
                )}
                {testStatus === 'idle' && <TestTube size={16} />}
                <span>
                  {testStatus === 'testing' && '测试中...'}
                  {testStatus === 'success' && '连接成功'}
                  {testStatus === 'error' && '连接失败'}
                  {testStatus === 'idle' && '测试连接'}
                </span>
              </Button>
              {testMessage && (
                <p
                  className="mt-2 text-xs px-1"
                  style={{ color: testStatus === 'error' ? 'var(--error)' : 'var(--success)' }}
                >
                  {testMessage}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Presets */}
      <PresetManager
        type="diary"
        currentApiBase={apiBase}
        currentApiKey={apiKey}
        currentModel={modelName}
        onLoadPreset={(preset) => {
          if (preset.apiBaseUrl) setApiBase(preset.apiBaseUrl)
          if (preset.model) setModelName(preset.model)
        }}
      />

      {/* Diary Language */}
      <motion.div variants={cardItem}>
        <Card
          className="overflow-hidden rounded-2xl border-0 shadow-none"
          style={{ backgroundColor: 'var(--bg-surface)' }}
        >
          <CardHeader className="px-4 pt-4 pb-0">
            <CardTitle
              className="text-base font-medium"
              style={{
                fontFamily: "'DM Sans', sans-serif",
                color: 'var(--text-primary)',
              }}
            >
              日记语言
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="flex gap-2">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.value}
                  onClick={() => setLanguage(lang.value)}
                  className="flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
                  style={{
                    backgroundColor:
                      language === lang.value ? 'var(--accent)' : 'var(--bg-elevated)',
                    color: language === lang.value ? '#fff' : 'var(--text-secondary)',
                  }}
                >
                  {lang.label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Diary Style */}
      <motion.div variants={cardItem}>
        <Card
          className="overflow-hidden rounded-2xl border-0 shadow-none"
          style={{ backgroundColor: 'var(--bg-surface)' }}
        >
          <CardHeader className="px-4 pt-4 pb-0">
            <CardTitle
              className="text-base font-medium"
              style={{
                fontFamily: "'DM Sans', sans-serif",
                color: 'var(--text-primary)',
              }}
            >
              日记风格
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 p-4">
            {DIARY_STYLES.map((s) => (
              <button
                key={s.value}
                onClick={() => setStyle(s.value)}
                className="flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors"
                style={{
                  backgroundColor:
                    style === s.value ? 'var(--accent-soft)' : 'transparent',
                }}
              >
                <div
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2"
                  style={{
                    borderColor:
                      style === s.value ? 'var(--accent)' : 'var(--divider)',
                  }}
                >
                  {style === s.value && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{
                        type: 'spring',
                        damping: 20,
                        stiffness: 300,
                      }}
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: 'var(--accent)' }}
                    />
                  )}
                </div>
                <div>
                  <div
                    className="text-sm font-medium"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {s.value}
                  </div>
                  <div
                    className="text-xs"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {s.desc}
                  </div>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      </motion.div>

      {/* Style Prompt Editor — edits the prompt snippet for the currently selected style */}
      <motion.div variants={cardItem}>
        <Card
          className="overflow-hidden rounded-2xl border-0 shadow-none"
          style={{ backgroundColor: 'var(--bg-surface)' }}
        >
          <CardHeader className="px-4 pt-4 pb-0">
            <CardTitle
              className="text-base font-medium"
              style={{
                fontFamily: "'DM Sans', sans-serif",
                color: 'var(--text-primary)',
              }}
            >
              风格提示词
            </CardTitle>
            <CardDescription style={{ color: 'var(--text-tertiary)' }} className="text-xs">
              当前风格「{style}」的写作指引，生成日记时会注入到主 Prompt 中
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 p-4">
            <Textarea
              value={stylePromptsMap[style] ?? ''}
              onChange={(e) => handleStylePromptChange(style, e.target.value)}
              className="min-h-[120px] resize-y rounded-xl border text-sm leading-relaxed"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderColor: 'var(--divider)',
                color: 'var(--text-primary)',
              }}
              aria-label={`风格「${style}」的提示词`}
            />
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleResetStylePrompt(style)}
                className="gap-1 text-xs"
                style={{ color: 'var(--text-tertiary)' }}
              >
                <RotateCcw size={14} />
                恢复此风格默认
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Diary Length */}
      <motion.div variants={cardItem}>
        <Card
          className="overflow-hidden rounded-2xl border-0 shadow-none"
          style={{ backgroundColor: 'var(--bg-surface)' }}
        >
          <CardHeader className="px-4 pt-4 pb-0">
            <CardTitle
              className="text-base font-medium"
              style={{
                fontFamily: "'DM Sans', sans-serif",
                color: 'var(--text-primary)',
              }}
            >
              日记长度
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 p-4">
            <div className="flex gap-2">
              {DIARY_LENGTHS.map((l) => (
                <button
                  key={l.value}
                  onClick={() => setLength(l.value)}
                  className="flex-1 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors"
                  style={{
                    backgroundColor:
                      length === l.value ? 'var(--accent)' : 'var(--bg-elevated)',
                    color: length === l.value ? '#fff' : 'var(--text-secondary)',
                  }}
                >
                  {l.value}
                </button>
              ))}
            </div>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              约 {DIARY_LENGTHS.find((l) => l.value === length)?.range} 字
            </p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Generation Time */}
      <motion.div variants={cardItem}>
        <Card
          className="overflow-hidden rounded-2xl border-0 shadow-none"
          style={{ backgroundColor: 'var(--bg-surface)' }}
        >
          <CardHeader className="px-4 pt-4 pb-0">
            <CardTitle
              className="text-base font-medium"
              style={{
                fontFamily: "'DM Sans', sans-serif",
                color: 'var(--text-primary)',
              }}
            >
              每日生成时间
            </CardTitle>
            <CardDescription style={{ color: 'var(--text-tertiary)' }} className="text-xs">
              AI 将在这个时间自动整理当天的碎片
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <Input
              type="time"
              value={genTime}
              onChange={(e) => setGenTime(e.target.value)}
              className="w-full rounded-lg border-0 text-sm"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                color: 'var(--text-primary)',
              }}
            />
          </CardContent>
        </Card>
      </motion.div>

      {/* Prompt Template */}
      <motion.div variants={cardItem}>
        <Card
          className="overflow-hidden rounded-2xl border-0 shadow-none"
          style={{ backgroundColor: 'var(--bg-surface)' }}
        >
          <CardHeader className="px-4 pt-4 pb-0">
            <CardTitle
              className="text-base font-medium"
              style={{
                fontFamily: "'DM Sans', sans-serif",
                color: 'var(--text-primary)',
              }}
            >
              日记写作 Prompt
            </CardTitle>
            <CardDescription style={{ color: 'var(--text-tertiary)' }} className="text-xs">
              编辑 AI 写作日记时使用的提示词模板
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 p-4">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="min-h-[300px] resize-y rounded-xl border font-mono text-sm leading-relaxed"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderColor: 'var(--divider)',
                color: 'var(--text-primary)',
                fontFamily: "'DM Sans', monospace",
              }}
              aria-label="日记写作 Prompt 模板"
            />
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetPrompt}
                className="gap-1 text-xs"
                style={{ color: 'var(--text-tertiary)' }}
              >
                <RotateCcw size={14} />
                恢复默认
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Save Button */}
      <motion.div variants={cardItem}>
        <Button
          className="w-full gap-2 rounded-xl"
          style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
          {isSaving ? '保存中...' : '保存更改'}
        </Button>
      </motion.div>
    </motion.div>
  )
}

/* ═══════════════════════════════════════════
   Theme Tab
   ═══════════════════════════════════════════ */
function ThemeTab() {
  const { theme, setTheme } = useTheme()

  const options = [
    {
      value: 'system',
      label: '跟随系统',
      desc: '自动切换浅色/深色',
      Icon: Monitor,
    },
    {
      value: 'light',
      label: '浅色模式',
      desc: '始终使用浅色主题',
      Icon: Sun,
    },
    {
      value: 'dark',
      label: '深色模式',
      desc: '始终使用深色主题',
      Icon: Moon,
    },
  ] as const

  return (
    <motion.div
      className="p-4"
      variants={cardStagger}
      initial="hidden"
      animate="visible"
    >
      <motion.div variants={cardItem}>
        <Card
          className="overflow-hidden rounded-2xl border-0 shadow-none"
          style={{ backgroundColor: 'var(--bg-surface)' }}
        >
          <CardHeader className="px-4 pt-4 pb-0">
            <CardTitle
              className="text-base font-medium"
              style={{
                fontFamily: "'DM Sans', sans-serif",
                color: 'var(--text-primary)',
              }}
            >
              外观
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 p-4">
            {options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setTheme(opt.value)}
                className="flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors"
                style={{
                  backgroundColor:
                    theme === opt.value ? 'var(--accent-soft)' : 'transparent',
                }}
              >
                <opt.Icon
                  size={20}
                  style={{
                    color:
                      theme === opt.value ? 'var(--accent)' : 'var(--text-tertiary)',
                  }}
                />
                <div className="flex-1">
                  <div
                    className="text-sm font-medium"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {opt.label}
                  </div>
                  <div
                    className="text-xs"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {opt.desc}
                  </div>
                </div>
                <div
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2"
                  style={{
                    borderColor:
                      theme === opt.value ? 'var(--accent)' : 'var(--divider)',
                  }}
                >
                  {theme === opt.value && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{
                        type: 'spring',
                        damping: 20,
                        stiffness: 300,
                      }}
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: 'var(--accent)' }}
                    />
                  )}
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}

/* ═══════════════════════════════════════════
   Data Tab
   ═══════════════════════════════════════════ */
function DataTab() {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmAction, setConfirmAction] = useState<'fragments' | 'diaries' | 'all' | null>(null)
  const [clearCacheOpen, setClearCacheOpen] = useState(false)
  const [exported, setExported] = useState(false)

  const handleExport = () => {
    // Build a JSON blob with a timestamp
    const data = {
      exportTime: new Date().toISOString(),
      app: 'Night Journal',
      version: '1.0',
      note: 'This is a placeholder export. Full data export will be implemented on the backend.',
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `night-journal-export-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    setExported(true)
    setTimeout(() => setExported(false), 3000)
  }

  const handleDeleteConfirm = () => {
    // Placeholder - actual deletion would call tRPC APIs
    setConfirmOpen(false)
    setConfirmAction(null)
  }

  const handleClearCache = () => {
    localStorage.clear()
    setClearCacheOpen(false)
  }

  const confirmLabels: Record<string, { title: string; desc: string }> = {
    fragments: { title: '删除所有碎片', desc: '确定要删除所有碎片吗？此操作不可撤销。' },
    diaries: { title: '删除所有日记', desc: '确定要删除所有日记吗？此操作不可撤销。' },
    all: {
      title: '删除所有数据',
      desc: '确定要删除所有数据吗？此操作将清除所有日记和碎片，不可撤销。',
    },
  }

  return (
    <motion.div
      className="flex flex-col gap-4 p-4"
      variants={cardStagger}
      initial="hidden"
      animate="visible"
    >
      {/* Data Export */}
      <motion.div variants={cardItem}>
        <Card
          className="overflow-hidden rounded-2xl border-0 shadow-none"
          style={{ backgroundColor: 'var(--bg-surface)' }}
        >
          <CardHeader className="px-4 pt-4 pb-0">
            <CardTitle
              className="text-base font-medium"
              style={{
                fontFamily: "'DM Sans', sans-serif",
                color: 'var(--text-primary)',
              }}
            >
              数据导出
            </CardTitle>
            <CardDescription style={{ color: 'var(--text-secondary)' }} className="text-xs">
              将所有日记和碎片导出为 JSON 文件
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <Button
              className="w-full gap-2 rounded-xl"
              style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
              onClick={handleExport}
            >
              {exported ? (
                <>
                  <Check size={16} />
                  下载已开始
                </>
              ) : (
                <>
                  <Download size={16} />
                  导出数据
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </motion.div>

      {/* Danger Zone */}
      <motion.div variants={cardItem}>
        <Card
          className="overflow-hidden rounded-2xl border-0 shadow-none"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderTop: '2px solid var(--error)',
          }}
        >
          <CardHeader className="px-4 pt-4 pb-0">
            <CardTitle
              className="text-base font-medium"
              style={{
                fontFamily: "'DM Sans', sans-serif",
                color: 'var(--error)',
              }}
            >
              数据管理
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-0 p-4">
            {/* Delete fragments */}
            <button
              className="flex items-center justify-between rounded-lg px-3 py-3 text-left transition-colors"
              style={{ color: 'var(--error)' }}
              onClick={() => {
                setConfirmAction('fragments')
                setConfirmOpen(true)
              }}
            >
              <div className="flex items-center gap-2">
                <Trash2 size={18} />
                <span className="text-sm font-medium">删除所有碎片</span>
              </div>
              <ChevronRight size={16} style={{ color: 'var(--text-tertiary)' }} />
            </button>

            {/* Delete diaries */}
            <button
              className="flex items-center justify-between rounded-lg px-3 py-3 text-left transition-colors"
              style={{ color: 'var(--error)' }}
              onClick={() => {
                setConfirmAction('diaries')
                setConfirmOpen(true)
              }}
            >
              <div className="flex items-center gap-2">
                <Trash2 size={18} />
                <span className="text-sm font-medium">删除所有日记</span>
              </div>
              <ChevronRight size={16} style={{ color: 'var(--text-tertiary)' }} />
            </button>

            {/* Delete all data */}
            <button
              className="flex items-center justify-between rounded-lg px-3 py-3 text-left transition-colors"
              style={{ color: 'var(--error)' }}
              onClick={() => {
                setConfirmAction('all')
                setConfirmOpen(true)
              }}
            >
              <div className="flex items-center gap-2">
                <AlertTriangle size={18} />
                <span className="text-sm font-medium">删除所有数据</span>
              </div>
              <ChevronRight size={16} style={{ color: 'var(--text-tertiary)' }} />
            </button>

            {/* Clear cache */}
            <button
              className="flex items-center justify-between rounded-lg px-3 py-3 text-left transition-colors"
              style={{ color: 'var(--error)' }}
              onClick={() => setClearCacheOpen(true)}
            >
              <div className="flex items-center gap-2">
                <Trash2 size={18} />
                <span className="text-sm font-medium">清空本地缓存</span>
              </div>
              <ChevronRight size={16} style={{ color: 'var(--text-tertiary)' }} />
            </button>
          </CardContent>
        </Card>
      </motion.div>

      {/* Privacy Note */}
      <motion.p
        variants={cardItem}
        className="px-2 text-center text-xs"
        style={{ color: 'var(--text-tertiary)', lineHeight: 1.6 }}
      >
        你的数据存储在本地设备中。日记内容不会上传至任何第三方服务器，除非你配置了自定义 AI 模型。
      </motion.p>

      {/* Confirm Dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent
          className="rounded-xl border-0"
          style={{ backgroundColor: 'var(--bg-elevated)' }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle style={{ color: 'var(--text-primary)' }}>
              {confirmAction ? confirmLabels[confirmAction]?.title : '确认删除'}
            </AlertDialogTitle>
            <AlertDialogDescription style={{ color: 'var(--text-secondary)' }}>
              {confirmAction ? confirmLabels[confirmAction]?.desc : '此操作不可撤销。'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="rounded-lg border-0"
              style={{ backgroundColor: 'var(--bg-surface)', color: 'var(--text-secondary)' }}
            >
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="rounded-lg"
              style={{ backgroundColor: 'var(--error)', color: '#fff' }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clear Cache Dialog */}
      <AlertDialog open={clearCacheOpen} onOpenChange={setClearCacheOpen}>
        <AlertDialogContent
          className="rounded-xl border-0"
          style={{ backgroundColor: 'var(--bg-elevated)' }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle style={{ color: 'var(--text-primary)' }}>
              清空本地缓存
            </AlertDialogTitle>
            <AlertDialogDescription style={{ color: 'var(--text-secondary)' }}>
              确定要清空本地缓存吗？这不会影响已同步到服务器的数据。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="rounded-lg border-0"
              style={{ backgroundColor: 'var(--bg-surface)', color: 'var(--text-secondary)' }}
            >
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClearCache}
              className="rounded-lg"
              style={{ backgroundColor: 'var(--error)', color: '#fff' }}
            >
              清空
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  )
}
