import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import axios from 'axios'
import { ChatMessage } from './chat-message.entity'
import { TavilyService } from './tavily.service'

// ── Tool definitions for DeepSeek ────────────────────────────
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_financial_summary',
      description: 'ดึงข้อมูลสรุปการเงินของ user เดือนปัจจุบัน รวมถึง income, expense, net balance, emergency fund',
      parameters: {
        type: 'object',
        properties: {
          month: { type: 'string', description: 'รูปแบบ YYYY-MM ถ้าไม่ระบุจะใช้เดือนปัจจุบัน' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_transactions',
      description: 'ดึงรายการธุรกรรม income/expense ของ user',
      parameters: {
        type: 'object',
        properties: {
          month: { type: 'string', description: 'รูปแบบ YYYY-MM' },
          type: { type: 'string', enum: ['expense', 'income', 'all'], description: 'ประเภทธุรกรรม' },
          limit: { type: 'number', description: 'จำนวนสูงสุดที่จะดึง default 20' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_transaction',
      description: 'บันทึกรายรับหรือรายจ่ายใหม่ — ใช้เมื่อ user ขอให้บันทึกรายการ',
      parameters: {
        type: 'object',
        properties: {
          amount: { type: 'number', description: 'จำนวนเงิน (บาท)' },
          type: { type: 'string', enum: ['expense', 'income'] },
          note: { type: 'string', description: 'รายละเอียด' },
          categoryName: { type: 'string', description: 'ชื่อหมวดหมู่ที่ใกล้เคียง เช่น Food & Drink, Transport' },
          occurredAt: { type: 'string', description: 'วันที่ ISO format ถ้าไม่ระบุใช้วันนี้' },
        },
        required: ['amount', 'type', 'note'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'ค้นหาข้อมูลจาก internet เช่น NAV กองทุน ราคาหุ้น อัตราภาษี ข่าวการเงิน',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'คำค้นหา ควรเป็นภาษาที่เหมาะสม (ภาษาไทยหรืออังกฤษ)' },
          max_results: { type: 'number', description: 'จำนวนผลลัพธ์ default 5' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_budget_status',
      description: 'ดูสถานะงบประมาณแต่ละหมวดเดือนนี้ ว่าใช้ไปเท่าไหร่จากที่ตั้งไว้',
      parameters: {
        type: 'object',
        properties: {
          month: { type: 'string', description: 'รูปแบบ YYYY-MM' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_loan_status',
      description: 'ดูรายชื่อคนที่ยังค้างเงิน และยอดรวมที่ยังค้างอยู่',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
]

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name)
  private readonly OPENROUTER_BASE = 'https://openrouter.ai/api/v1'
  private readonly CHAT_MODEL = 'deepseek/deepseek-v3-base:free'
  private readonly VISION_MODEL = 'google/gemini-2.0-flash-001'
  private readonly MAX_HISTORY = 50

  constructor(
    @InjectRepository(ChatMessage)
    private readonly msgRepo: Repository<ChatMessage>,
    private readonly tavily: TavilyService,
  ) {}

  // ── Send chat message ──────────────────────────────────────
  async chat(userId: string, userMessage: string, context: Record<string, any> = {}) {
    // Save user message
    await this.saveMessage(userId, 'user', userMessage)

    // Load last 50 messages for context
    const history = await this.getHistory(userId)

    const systemPrompt = this.buildSystemPrompt(context)
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-this.MAX_HISTORY).map(m => ({ role: m.role, content: m.content })),
    ]

    const reply = await this.callDeepSeek(userId, messages)

    // Save assistant reply
    await this.saveMessage(userId, 'assistant', reply)

    return { message: reply }
  }

  // ── Vision: read bill/receipt image ────────────────────────
  async analyzeImage(userId: string, imageBase64: string, mimeType: string) {
    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) throw new Error('OPENROUTER_API_KEY not configured')

    const prompt = `คุณเป็นผู้ช่วยอ่านบิลและใบเสร็จ กรุณาอ่านรูปนี้และ extract ข้อมูลดังนี้:
1. ชื่อร้าน/สถานที่
2. รายการสินค้า/บริการ (ถ้ามี)
3. ราคารวมทั้งหมด
4. วันที่ (ถ้ามี)
5. หมวดหมู่ที่เหมาะสม (Food & Drink / Transport / Shopping / Health / Entertainment / Utilities / Other)

ตอบเป็น JSON format:
{
  "shop": "ชื่อร้าน",
  "items": [{"name": "รายการ", "price": 0}],
  "total": 0,
  "date": "YYYY-MM-DD หรือ null",
  "category": "หมวดหมู่",
  "confidence": "high/medium/low"
}`

    try {
      const res = await axios.post(
        `${this.OPENROUTER_BASE}/chat/completions`,
        {
          model: this.VISION_MODEL,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
              ],
            },
          ],
          max_tokens: 1000,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://moneyflow.app',
            'X-Title': 'MoneyFlow',
          },
          timeout: 30000,
        },
      )

      const content = res.data.choices[0]?.message?.content ?? ''
      // Extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0])
      }
      return { raw: content, error: 'Could not parse JSON' }
    } catch (err: any) {
      this.logger.error(`Vision error: ${err.message}`)
      throw err
    }
  }

  // ── Get chat history ───────────────────────────────────────
  async getHistory(userId: string, limit = this.MAX_HISTORY): Promise<ChatMessage[]> {
    return this.msgRepo.find({
      where: { userId },
      order: { createdAt: 'ASC' },
      take: limit,
    })
  }

  // ── Clear chat history ─────────────────────────────────────
  async clearHistory(userId: string) {
    await this.msgRepo.delete({ userId })
    return { success: true }
  }

  // ── DeepSeek with tool calling ─────────────────────────────
  private async callDeepSeek(userId: string, messages: any[]): Promise<string> {
    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) return 'ยังไม่ได้ตั้งค่า OPENROUTER_API_KEY กรุณาเพิ่มใน .env'

    try {
      const res = await axios.post(
        `${this.OPENROUTER_BASE}/chat/completions`,
        {
          model: this.CHAT_MODEL,
          messages,
          tools: TOOLS,
          tool_choice: 'auto',
          max_tokens: 2000,
          temperature: 0.7,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://moneyflow.app',
            'X-Title': 'MoneyFlow',
          },
          timeout: 60000,
        },
      )

      const choice = res.data.choices[0]
      const msg = choice.message

      // Handle tool calls
      if (msg.tool_calls?.length > 0) {
        return this.handleToolCalls(userId, messages, msg)
      }

      return msg.content ?? 'ไม่มีการตอบกลับ'
    } catch (err: any) {
      this.logger.error(`DeepSeek error: ${err.response?.data ?? err.message}`)
      return `เกิดข้อผิดพลาด: ${err.message}`
    }
  }

  private async handleToolCalls(userId: string, messages: any[], assistantMsg: any): Promise<string> {
    const toolResults: any[] = []

    for (const call of assistantMsg.tool_calls) {
      const args = JSON.parse(call.function.arguments || '{}')
      let result: any

      try {
        result = await this.executeTool(userId, call.function.name, args)
      } catch (err: any) {
        result = { error: err.message }
      }

      toolResults.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result),
      })
    }

    // Second round with tool results
    const updatedMessages = [
      ...messages,
      { role: 'assistant', content: null, tool_calls: assistantMsg.tool_calls },
      ...toolResults,
    ]

    return this.callDeepSeek(userId, updatedMessages)
  }

  private async executeTool(userId: string, name: string, args: any): Promise<any> {
    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    switch (name) {
      case 'get_financial_summary': {
        const month = args.month ?? currentMonth
        const [expenses, incomes] = await Promise.all([
          this.msgRepo.manager.query(
            `SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE user_id = $1 AND type = 'expense' AND TO_CHAR(occurred_at, 'YYYY-MM') = $2`,
            [userId, month],
          ),
          this.msgRepo.manager.query(
            `SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE user_id = $1 AND type = 'income' AND TO_CHAR(occurred_at, 'YYYY-MM') = $2`,
            [userId, month],
          ),
        ])
        const totalExpense = parseFloat(expenses[0]?.total ?? '0')
        const totalIncome = parseFloat(incomes[0]?.total ?? '0')
        return { month, totalExpense, totalIncome, net: totalIncome - totalExpense }
      }

      case 'get_transactions': {
        const month = args.month ?? currentMonth
        const limit = args.limit ?? 20
        const typeFilter = args.type === 'all' ? '' : `AND e.type = '${args.type ?? 'expense'}'`
        const rows = await this.msgRepo.manager.query(
          `SELECT e.amount, e.type, e.note, e.occurred_at, c.name as category
           FROM expenses e LEFT JOIN categories c ON e.category_id = c.id
           WHERE e.user_id = $1 AND TO_CHAR(e.occurred_at, 'YYYY-MM') = $2 ${typeFilter}
           ORDER BY e.occurred_at DESC LIMIT $3`,
          [userId, month, limit],
        )
        return { transactions: rows, count: rows.length }
      }

      case 'create_transaction': {
        // Find closest matching category
        const cats = await this.msgRepo.manager.query(
          `SELECT id, name FROM categories WHERE user_id = $1 AND type = $2`,
          [userId, args.type],
        )
        const cat = cats.find((c: any) =>
          c.name.toLowerCase().includes((args.categoryName ?? '').toLowerCase()),
        ) ?? cats[0]

        const occurredAt = args.occurredAt ?? now.toISOString()
        await this.msgRepo.manager.query(
          `INSERT INTO expenses (id, user_id, category_id, amount, type, note, occurred_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)`,
          [userId, cat?.id ?? null, args.amount, args.type, args.note, occurredAt],
        )
        // Update user balance
        const delta = args.type === 'income' ? args.amount : -args.amount
        await this.msgRepo.manager.query(
          `UPDATE users SET total_balance = total_balance + $1, updated_at = NOW() WHERE id = $2`,
          [delta, userId],
        )
        return {
          success: true,
          message: `บันทึก${args.type === 'income' ? 'รายรับ' : 'รายจ่าย'} ฿${args.amount} "${args.note}" แล้ว`,
          category: cat?.name ?? 'ไม่ระบุหมวด',
        }
      }

      case 'web_search': {
        const result = await this.tavily.search(args.query, args.max_results ?? 5)
        return {
          answer: result.answer,
          results: result.results.slice(0, 3).map(r => ({
            title: r.title,
            url: r.url,
            snippet: r.content.slice(0, 300),
          })),
        }
      }

      case 'get_budget_status': {
        const month = args.month ?? currentMonth
        const rows = await this.msgRepo.manager.query(
          `SELECT b.amount as budgeted, c.name as category,
                  COALESCE((SELECT SUM(e.amount) FROM expenses e
                    WHERE e.user_id = b.user_id AND e.category_id = b.category_id
                    AND TO_CHAR(e.occurred_at, 'YYYY-MM') = b.month
                    AND e.type = 'expense'), 0) as actual
           FROM budgets b JOIN categories c ON b.category_id = c.id
           WHERE b.user_id = $1 AND b.month = $2`,
          [userId, month],
        )
        return { month, budgets: rows }
      }

      case 'get_loan_status': {
        const rows = await this.msgRepo.manager.query(
          `SELECT l.id, l.borrower, l.amount,
                  COALESCE((SELECT SUM(p.amount) FROM loan_payments p WHERE p.loan_id = l.id), 0) as paid
           FROM loans l WHERE l.user_id = $1 AND l.status = 'active'`,
          [userId],
        )
        const enriched = rows.map((r: any) => ({
          borrower: r.borrower,
          amount: parseFloat(r.amount),
          paid: parseFloat(r.paid),
          outstanding: parseFloat(r.amount) - parseFloat(r.paid),
        }))
        return {
          activeLoans: enriched.length,
          totalOutstanding: enriched.reduce((s: number, r: any) => s + r.outstanding, 0),
          loans: enriched,
        }
      }

      default:
        return { error: `Unknown tool: ${name}` }
    }
  }

  private buildSystemPrompt(context: Record<string, any>): string {
    const now = new Date()
    return `คุณเป็น AI ผู้ช่วยการเงินส่วนตัวของ MoneyFlow
วันที่วันนี้: ${now.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}
เดือนปัจจุบัน: ${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}

ความสามารถของคุณ:
- ดูข้อมูลรายรับรายจ่าย และสรุปการเงิน
- ดูและวิเคราะห์สถานะงบประมาณ
- ดูยอดเงินให้ยืมที่ค้างอยู่
- บันทึกรายการรายรับรายจ่าย (ต้องขอ confirm ก่อนเสมอ)
- ค้นหาข้อมูลจาก internet เช่น NAV กองทุน อัตราภาษี ข่าวการเงิน

กฎสำคัญ:
- ก่อน create_transaction ให้สรุปให้ user confirm ก่อนเสมอ เช่น "จะบันทึกค่าข้าว ฿80 หมวดอาหาร ใช่ไหม?"
- ใช้ภาษาไทยเป็นหลัก เว้นแต่ user พิมพ์ภาษาอังกฤษ
- ตอบกระชับ ตรงประเด็น ใช้ emoji เล็กน้อยให้ดูเป็นมิตร
- เมื่อ search ข้อมูล ให้อ้างอิง source ด้วย
${context.userName ? `ชื่อ user: ${context.userName}` : ''}`
  }

  private async saveMessage(userId: string, role: string, content: string) {
    await this.msgRepo.save(this.msgRepo.create({ userId, role, content }))

    // Keep only last MAX_HISTORY messages per user
    await this.msgRepo.manager.query(
      `DELETE FROM chat_messages WHERE user_id = $1 AND id NOT IN (
        SELECT id FROM chat_messages WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2
      )`,
      [userId, this.MAX_HISTORY],
    )
  }
}
