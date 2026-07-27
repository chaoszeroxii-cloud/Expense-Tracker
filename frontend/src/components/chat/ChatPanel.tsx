import { useState, useRef, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useNavigate } from 'react-router-dom'
import Icon from '@mdi/react'
import {
  mdiClose, mdiSend, mdiImage, mdiTrashCanOutline,
  mdiRobot, mdiAccount, mdiLoading, mdiChevronRight,
} from '@mdi/js'
import { chatApi } from '../../api'
import type { ChatMessage } from '../../types'
import { useAuthStore } from '../../store/auth.store'
import { useThemeStore } from '../../store/theme.store'
import { usePanels } from '../../store/panels.store'

interface Props {
  onClose: () => void
}

interface LocalMessage extends ChatMessage {
  localId: string
  loading?: boolean
  streaming?: boolean
  imagePreview?: string
  statusText?: string
}

// Parse [THEME:x], [NAVIGATE:/path], and [REFRESH:page,...] markers from AI response
function parseMarkers(text: string): { clean: string; theme?: 'light' | 'dark'; navigate?: string; refresh?: string[] } {
  let clean = text
  let theme: 'light' | 'dark' | undefined
  let navigate: string | undefined
  let refresh: string[] | undefined

  const themeMatch = clean.match(/\[THEME:(light|dark)\]/i)
  if (themeMatch) {
    theme = themeMatch[1] as 'light' | 'dark'
    clean = clean.replace(themeMatch[0], '').trim()
  }

  const navMatch = clean.match(/\[NAVIGATE:([^\]]+)\]/i)
  if (navMatch) {
    navigate = navMatch[1]
    clean = clean.replace(navMatch[0], '').trim()
  }

  const refreshMatch = clean.match(/\[REFRESH:([^\]]+)\]/gi)
  if (refreshMatch) {
    refresh = refreshMatch.flatMap(m => m.replace(/\[REFRESH:/i, '').replace(']', '').split(',').map(s => s.trim()))
    refreshMatch.forEach(m => { clean = clean.replace(m, '').trim() })
  }

  return { clean, theme, navigate, refresh }
}

export default function ChatPanel({ onClose }: Props) {
  const user = useAuthStore(s => s.user)
  const setTheme = useThemeStore(s => s.setTheme)
  const navigate = useNavigate()
  const [messages, setMessages] = useState<LocalMessage[]>([])
  // Seeded by the home quick-capture bar so "coffee 45" arrives already typed.
  const [input, setInput] = useState(() => usePanels.getState().chatDraft)
  const [sending, setSending] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [attachedImage, setAttachedImage] = useState<{ file: File; preview: string; base64: string; mimeType: string } | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const scrollBottom = () => bottomRef.current?.scrollIntoView({ behavior: 'smooth' })

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true)
    try {
      const history = await chatApi.getHistory()
      setMessages(history.map((m: ChatMessage) => ({
        ...m,
        localId: m.id ?? crypto.randomUUID(),
        imagePreview: m.imageAnalysis?.thumbnail ?? undefined,
      })))
    } finally {
      setLoadingHistory(false)
    }
  }, [])

  useEffect(() => { loadHistory() }, [loadHistory])
  useEffect(() => { scrollBottom() }, [messages])
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [input])

  const sendMessage = async (text: string) => {
    if (!text.trim() && !attachedImage) return
    if (sending) return
    const streamId = crypto.randomUUID()
    const userMsg: LocalMessage = {
      localId: crypto.randomUUID(),
      role: 'user',
      content: text || '📎 แนบรูป',
      imagePreview: attachedImage?.preview,
    }
    const placeholder: LocalMessage = { localId: streamId, role: 'assistant', content: '', loading: true }

    setMessages(prev => [...prev, userMsg, placeholder])
    setInput('')
    const imageSnapshot = attachedImage
    setAttachedImage(null)
    setSending(true)

    try {
      const res = await chatApi.sendMessageStream(text, { userName: user?.name }, imageSnapshot?.base64, imageSnapshot?.mimeType, imageSnapshot?.preview)
      if (!res.body) throw new Error('No response body')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let accumulated = ''
      let firstChunk = true
      let currentEvent = 'message'
      let pendingAction: { refresh?: string[]; theme?: string; navigate?: string } = {}

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (line.startsWith('event:')) {
            currentEvent = line.slice(6).trim()
            continue
          }
          if (line === '') { currentEvent = 'message'; continue }
          if (!line.startsWith('data:')) continue
          const data = line.slice(5).trim()
          if (data === '[DONE]') break

          try {
            const parsed = JSON.parse(data)

            if (currentEvent === 'action') {
              if (parsed.refresh) pendingAction.refresh = parsed.refresh
              if (parsed.theme) pendingAction.theme = parsed.theme
              if (parsed.navigate) pendingAction.navigate = parsed.navigate
              currentEvent = 'message'
              continue
            }

            if (currentEvent === 'status') {
              setMessages(prev => prev.map(m =>
                m.localId === streamId ? { ...m, statusText: parsed.text ?? '' } : m
              ))
              currentEvent = 'message'
              continue
            }

            if (parsed.content) {
              accumulated += parsed.content
              if (firstChunk) {
                firstChunk = false
                setMessages(prev => prev.map(m =>
                  m.localId === streamId ? { ...m, loading: false, streaming: true, content: accumulated } : m
                ))
              } else {
                setMessages(prev => prev.map(m =>
                  m.localId === streamId ? { ...m, content: accumulated } : m
                ))
              }
            }
          } catch { /* ignore parse errors */ }
        }
      }

      // Strip any legacy markers that may appear in old DB messages
      const { clean } = parseMarkers(accumulated)
      setMessages(prev => prev.map(m =>
        m.localId === streamId ? { ...m, content: clean, streaming: false } : m
      ))

      if (pendingAction.theme) {
        setTheme(pendingAction.theme as 'light' | 'dark')
        showToast(`เปลี่ยนเป็น ${pendingAction.theme === 'dark' ? 'Dark' : 'Light'} mode แล้ว`)
      }
      if (pendingAction.navigate) {
        showToast(`กำลังพาไปที่ ${pendingAction.navigate}...`)
        setTimeout(() => { navigate(pendingAction.navigate!); onClose() }, 800)
      }
      if (pendingAction.refresh && pendingAction.refresh.length > 0) {
        window.dispatchEvent(new CustomEvent('moneyflow:refresh', { detail: { types: pendingAction.refresh } }))
      }
    } catch {
      setMessages(prev => prev.map(m =>
        m.localId === streamId ? { ...m, content: '❌ เกิดข้อผิดพลาด ลองใหม่อีกครั้ง', loading: false, streaming: false } : m
      ))
    } finally {
      setSending(false)
    }
  }

  const handleImageAttach = async (file: File) => {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
    const base64 = dataUrl.split(',')[1]

    // Create a small thumbnail for persistent preview in history
    const thumbnail = await new Promise<string>((resolve) => {
      const img = new Image()
      img.onload = () => {
        const MAX = 200
        const scale = Math.min(1, MAX / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.75))
      }
      img.src = dataUrl
    })

    setAttachedImage({ file, preview: thumbnail, base64, mimeType: file.type })
  }

  const handleClear = async () => {
    await chatApi.clearHistory()
    setMessages([])
  }

  return (
    <div className="fixed inset-0 z-50 flex lg:justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 lg:hidden" />
      <div
        className="relative w-full h-full lg:w-[420px] bg-card flex flex-col shadow-2xl animate-slide-in-right"
        onClick={e => e.stopPropagation()}
      >
        {/* Toast notification */}
        {toast && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-10 px-4 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-full shadow-lg animate-fade-in whitespace-nowrap">
            {toast}
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
              <Icon path={mdiRobot} size={0.8} color="#10b981" />
            </div>
            <div>
              <p className="font-bold text-base-theme text-sm leading-tight">AI Assistant</p>
              <p className="text-[10px] text-emerald-500 font-semibold">● Online · DeepSeek</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={handleClear} className="p-2 rounded-lg hover:bg-[var(--input)] text-muted-theme" title="ล้างประวัติ">
              <Icon path={mdiTrashCanOutline} size={0.75} />
            </button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-[var(--input)] text-muted-theme">
              <Icon path={mdiChevronRight} size={0.85} />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {loadingHistory ? (
            <div className="flex justify-center pt-8">
              <Icon path={mdiLoading} size={1} className="text-muted-theme animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <WelcomeMessage userName={user?.name} onSuggest={sendMessage} />
          ) : (
            messages.map(msg => (
              <MessageBubble key={msg.localId} msg={msg} />
            ))
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input area */}
        <div className="px-3 pb-safe pb-3 pt-2 border-t border-[var(--border)] shrink-0">
          {/* Attached image preview */}
          {attachedImage && (
            <div className="mb-2 flex items-center gap-2">
              <div className="relative">
                <img src={attachedImage.preview} alt="attached" className="h-14 w-14 rounded-xl object-cover border border-[var(--border)]" />
                <button
                  onClick={() => setAttachedImage(null)}
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center leading-none"
                >✕</button>
              </div>
              <p className="text-[11px] text-muted-theme">รูปจะถูกส่งพร้อมข้อความ</p>
            </div>
          )}

          <div className="flex items-end gap-2">
            {/* Image attach button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={sending}
              className={`p-2.5 rounded-xl transition-colors shrink-0 disabled:opacity-40 ${attachedImage ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600' : 'bg-[var(--input)] text-muted-theme hover:text-base-theme'}`}
              title="แนบรูป"
            >
              <Icon path={mdiImage} size={0.85} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={e => { if (e.target.files?.[0]) { handleImageAttach(e.target.files[0]); e.target.value = '' } }}
            />

            {/* Text input */}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendMessage(input)
                }
              }}
              placeholder={attachedImage ? 'พิมพ์ข้อความประกอบรูป (ไม่บังคับ)...' : 'พิมพ์ข้อความ หรือแนบรูป...'}
              rows={1}
              className="flex-1 px-3 py-2.5 rounded-xl bg-[var(--input)] text-base-theme text-sm
                         border border-[var(--border)] outline-none resize-none
                         max-h-28 overflow-y-auto placeholder:text-muted-theme"
              style={{ scrollbarWidth: 'none', height: 'auto', overflowY: 'auto' }}
            />

            {/* Send button */}
            <button
              onClick={() => sendMessage(input)}
              disabled={(!input.trim() && !attachedImage) || sending}
              className="p-2.5 rounded-xl bg-emerald-500 text-white shrink-0
                         disabled:opacity-40 active:scale-95 transition-transform"
            >
              {sending
                ? <Icon path={mdiLoading} size={0.85} className="animate-spin" />
                : <Icon path={mdiSend} size={0.85} />
              }
            </button>
          </div>
          <p className="text-[10px] text-muted-theme mt-1.5 text-center">
            Enter ส่ง · Shift+Enter ขึ้นบรรทัด · รูปภาพ max 10MB
          </p>
        </div>
      </div>
    </div>
  )
}

function MessageBubble({ msg }: { msg: LocalMessage }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center
        ${isUser ? 'bg-brand-100 dark:bg-brand-900/40' : 'bg-emerald-100 dark:bg-emerald-900/40'}`}>
        <Icon path={isUser ? mdiAccount : mdiRobot} size={0.7}
          color={isUser ? '#4f46e5' : '#10b981'} />
      </div>

      <div className={`max-w-[80%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
        {/* Image preview */}
        {msg.imagePreview && (
          <img src={msg.imagePreview} alt="bill" className="rounded-xl max-h-40 object-cover" />
        )}

        {/* Message bubble */}
        {msg.loading ? (
          <div className="bg-[var(--input)] rounded-2xl rounded-tl-sm px-4 py-2.5 min-w-[100px]">
            {msg.statusText ? (
              <p className="text-xs text-muted-theme animate-pulse">{msg.statusText}</p>
            ) : (
              <div className="flex gap-1 items-center h-4">
                <span className="w-1.5 h-1.5 bg-muted-theme rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-muted-theme rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-muted-theme rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            )}
          </div>
        ) : (
          <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed
            ${isUser
              ? 'bg-brand-600 text-white rounded-tr-sm whitespace-pre-wrap'
              : 'bg-[var(--input)] text-base-theme rounded-tl-sm'
            }`}>
            {isUser ? msg.content : <AiMessage content={msg.content} />}
            {msg.streaming && (
              <span className="inline-block w-0.5 h-3.5 bg-emerald-400 align-middle ml-0.5 animate-pulse" />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function AiMessage({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li>{children}</li>,
        h1: ({ children }) => <h1 className="font-semibold text-base mb-1 mt-2">{children}</h1>,
        h2: ({ children }) => <h2 className="font-semibold mb-1 mt-2">{children}</h2>,
        h3: ({ children }) => <h3 className="font-semibold mb-1 mt-1">{children}</h3>,
        table: ({ children }) => (
          <div className="overflow-x-auto my-2">
            <table className="min-w-full text-xs border-collapse">{children}</table>
          </div>
        ),
        tr: ({ children }) => (
          <tr className="even:bg-black/5 dark:even:bg-white/5">{children}</tr>
        ),
        th: ({ children }) => (
          <th className="text-left font-semibold py-1.5 px-2 border-b border-current/20 whitespace-nowrap">{children}</th>
        ),
        td: ({ children }) => (
          <td className="py-1.5 px-2 border-b border-current/10 whitespace-nowrap">{children}</td>
        ),
        pre: ({ children }) => (
          <pre className="bg-black/10 dark:bg-white/10 p-2 rounded mb-2 overflow-x-auto">{children}</pre>
        ),
        code: ({ children, className, ...props }) => (
          className
            ? <code className={`font-mono text-xs ${className}`} {...props}>{children}</code>
            : <code className="font-mono bg-black/10 dark:bg-white/10 px-1 py-0.5 rounded text-xs" {...props}>{children}</code>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

function WelcomeMessage({ userName, onSuggest }: { userName?: string | null; onSuggest: (t: string) => void }) {
  const suggestions = [
    'ทำอะไรได้บ้าง?',
    'สรุปการเงินเดือนนี้ให้หน่อย',
    'ใช้เงินเกินงบหมวดไหนบ้าง?',
    'ใครยังค้างเงินอยู่บ้าง?',
    'ควรซื้อ SSF/RMF เพิ่มอีกเท่าไหร่?',
  ]
  return (
    <div className="text-center pt-6 pb-2">
      <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center mx-auto mb-3">
        <Icon path={mdiRobot} size={1.4} color="#10b981" />
      </div>
      <p className="font-bold text-base-theme">สวัสดี{userName ? ` ${userName}` : ''}! 👋</p>
      <p className="text-xs text-muted-theme mt-1 mb-4">ฉันคือ AI ผู้ช่วยการเงินของคุณ<br />ถามได้เลยหรือแชร์รูปบิล</p>
      <div className="space-y-2">
        {suggestions.map(s => (
          <button key={s} onClick={() => onSuggest(s)}
            className="w-full text-left px-3 py-2.5 rounded-xl bg-[var(--input)] text-sm text-muted-theme
                       hover:text-base-theme hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors">
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}
