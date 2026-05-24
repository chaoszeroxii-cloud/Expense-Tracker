import { useState, useRef, useEffect, useCallback } from 'react'
import Icon from '@mdi/react'
import {
  mdiClose, mdiSend, mdiImage, mdiTrashCanOutline,
  mdiRobot, mdiAccount, mdiLoading, mdiChevronRight,
} from '@mdi/js'
import { chatApi } from '../../api'
import type { ChatMessage } from '../../types'
import { useAuthStore } from '../../store/auth.store'

interface Props {
  onClose: () => void
}

interface LocalMessage extends ChatMessage {
  localId: string
  loading?: boolean
  imagePreview?: string
  extractedBill?: any
}

export default function ChatPanel({ onClose }: Props) {
  const user = useAuthStore(s => s.user)
  const [messages, setMessages] = useState<LocalMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [pendingBill, setPendingBill] = useState<any>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const scrollBottom = () => bottomRef.current?.scrollIntoView({ behavior: 'smooth' })

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true)
    try {
      const history = await chatApi.getHistory()
      setMessages(history.map((m: ChatMessage) => ({ ...m, localId: m.id ?? crypto.randomUUID() })))
    } finally {
      setLoadingHistory(false)
    }
  }, [])

  useEffect(() => { loadHistory() }, [loadHistory])
  useEffect(() => { scrollBottom() }, [messages])

  const sendMessage = async (text: string) => {
    if (!text.trim() || sending) return
    const localId = crypto.randomUUID()
    const userMsg: LocalMessage = { localId, role: 'user', content: text }
    const loadingMsg: LocalMessage = { localId: crypto.randomUUID(), role: 'assistant', content: '', loading: true }

    setMessages(prev => [...prev, userMsg, loadingMsg])
    setInput('')
    setSending(true)

    try {
      const res = await chatApi.sendMessage(text, { userName: user?.name })
      setMessages(prev =>
        prev.map(m => m.loading ? { ...m, content: res.message, loading: false } : m)
      )
    } catch {
      setMessages(prev =>
        prev.map(m => m.loading ? { ...m, content: '❌ เกิดข้อผิดพลาด ลองใหม่อีกครั้ง', loading: false } : m)
      )
    } finally {
      setSending(false)
    }
  }

  const handleImageUpload = async (file: File) => {
    const previewUrl = URL.createObjectURL(file)
    const localId = crypto.randomUUID()
    const userMsg: LocalMessage = { localId, role: 'user', content: 'อัพโหลดรูปบิล/ใบเสร็จ', imagePreview: previewUrl }
    const loadingMsg: LocalMessage = { localId: crypto.randomUUID(), role: 'assistant', content: '', loading: true }

    setMessages(prev => [...prev, userMsg, loadingMsg])
    setSending(true)

    try {
      const result = await chatApi.analyzeImage(file)
      const billMsg = formatBillResult(result)
      setMessages(prev =>
        prev.map(m => m.loading ? { ...m, content: billMsg, loading: false, extractedBill: result } : m)
      )
      if (result.total && result.total > 0) setPendingBill(result)
    } catch {
      setMessages(prev =>
        prev.map(m => m.loading ? { ...m, content: '❌ อ่านรูปไม่ได้ กรุณาลองใหม่หรือใช้รูปที่ชัดขึ้น', loading: false } : m)
      )
    } finally {
      setSending(false)
    }
  }

  const confirmBill = async (bill: any) => {
    setPendingBill(null)
    await sendMessage(
      `บันทึก${bill.category === 'Food & Drink' ? 'ค่าอาหาร' : 'รายจ่าย'} ฿${bill.total} จาก ${bill.shop ?? 'ไม่ระบุร้าน'}`
    )
  }

  const handleClear = async () => {
    await chatApi.clearHistory()
    setMessages([])
  }

  const formatBillResult = (r: any): string => {
    if (!r || r.error) return `ไม่สามารถอ่านบิลได้: ${r?.error ?? 'unknown'}`
    let msg = `📄 **อ่านบิลได้แล้ว!**\n\n`
    if (r.shop) msg += `🏪 ร้าน: ${r.shop}\n`
    if (r.items?.length > 0) {
      msg += `📋 รายการ:\n`
      r.items.forEach((item: any) => { msg += `  • ${item.name} — ฿${item.price}\n` })
    }
    if (r.total) msg += `\n💰 **รวม ฿${r.total}**`
    if (r.date) msg += `\n📅 วันที่: ${r.date}`
    if (r.category) msg += `\n🏷️ หมวด: ${r.category}`
    msg += `\n\nต้องการบันทึกรายการนี้ไหม?`
    return msg
  }

  return (
    <div className="fixed inset-0 z-50 flex lg:justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 lg:hidden" />
      <div
        className="relative w-full h-full lg:w-[420px] bg-card flex flex-col shadow-2xl animate-slide-in-right"
        onClick={e => e.stopPropagation()}
      >
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

          {/* Pending bill confirmation */}
          {pendingBill && (
            <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl p-3 border border-emerald-200 dark:border-emerald-700">
              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200 mb-2">
                บันทึก ฿{pendingBill.total} จาก {pendingBill.shop} ไหม?
              </p>
              <div className="flex gap-2">
                <button onClick={() => confirmBill(pendingBill)}
                  className="flex-1 py-2 rounded-xl bg-emerald-500 text-white text-xs font-bold">
                  ✓ บันทึก
                </button>
                <button onClick={() => setPendingBill(null)}
                  className="flex-1 py-2 rounded-xl bg-[var(--input)] text-muted-theme text-xs font-semibold">
                  ยกเลิก
                </button>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input area */}
        <div className="px-3 pb-safe pb-3 pt-2 border-t border-[var(--border)] shrink-0">
          <div className="flex items-end gap-2">
            {/* Image upload button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={sending}
              className="p-2.5 rounded-xl bg-[var(--input)] text-muted-theme hover:text-base-theme transition-colors shrink-0 disabled:opacity-40"
              title="อัพโหลดรูปบิล"
            >
              <Icon path={mdiImage} size={0.85} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={e => e.target.files?.[0] && handleImageUpload(e.target.files[0])}
            />

            {/* Text input */}
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendMessage(input)
                }
              }}
              placeholder="พิมพ์ข้อความ หรืออัพโหลดรูปบิล..."
              rows={1}
              className="flex-1 px-3 py-2.5 rounded-xl bg-[var(--input)] text-base-theme text-sm
                         border border-[var(--border)] outline-none resize-none
                         max-h-28 overflow-y-auto placeholder:text-muted-theme"
              style={{ scrollbarWidth: 'none' }}
            />

            {/* Send button */}
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || sending}
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
          <div className="bg-[var(--input)] rounded-2xl rounded-tl-sm px-4 py-2.5">
            <div className="flex gap-1 items-center h-4">
              <span className="w-1.5 h-1.5 bg-muted-theme rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-muted-theme rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-muted-theme rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        ) : (
          <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap
            ${isUser
              ? 'bg-brand-600 text-white rounded-tr-sm'
              : 'bg-[var(--input)] text-base-theme rounded-tl-sm'
            }`}>
            <FormattedMessage content={msg.content} />
          </div>
        )}
      </div>
    </div>
  )
}

function FormattedMessage({ content }: { content: string }) {
  // Simple markdown: **bold**, newlines
  const parts = content.split(/(\*\*[^*]+\*\*)/g)
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**')
          ? <strong key={i}>{part.slice(2, -2)}</strong>
          : <span key={i}>{part}</span>
      )}
    </>
  )
}

function WelcomeMessage({ userName, onSuggest }: { userName?: string | null; onSuggest: (t: string) => void }) {
  const suggestions = [
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
