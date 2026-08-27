import { Injectable, Logger, BadRequestException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import axios from 'axios'
import { ChatMessage } from './chat-message.entity'
import { AiUsageLog } from './ai-usage-log.entity'
import { TavilyService } from './tavily.service'
import { CategoriesService } from '../categories/categories.service'
import { LoansService } from '../loans/loans.service'
import { BudgetsService } from '../budgets/budgets.service'
import { AllocationsService } from '../allocations/allocations.service'
import { InvestmentsService } from '../investments/investments.service'
import { TaxService } from '../tax/tax.service'
import { ExpensesService } from '../expenses/expenses.service'
import { User } from '../users/user.entity'
import { MDI_ICON_IDS } from '../../common/icon.util'
import {
  MONTH_PATTERN, monthRangePredicate, yearRangePredicate,
  localMonth, localToday, safeTimezone, shiftMonth,
} from '../../common/local-date.util'

/** Guards a model-supplied id before it reaches a uuid column. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ─────────────────────────────────────────────────────────────
// Tool definitions for DeepSeek
// ─────────────────────────────────────────────────────────────
const TOOLS = [
  // ── READ ──────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'get_financial_summary',
      description: 'ดึงสรุปการเงิน: รายรับ รายจ่าย ยอดสุทธิ เดือนที่ระบุ',
      parameters: {
        type: 'object',
        properties: {
          month: { type: 'string', description: 'YYYY-MM ถ้าไม่ระบุใช้เดือนปัจจุบัน' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_transactions',
      description: 'ดึงรายการธุรกรรม พร้อม note/หมายเหตุ ใช้สำหรับดูประวัติและวิเคราะห์',
      parameters: {
        type: 'object',
        properties: {
          month: { type: 'string', description: 'YYYY-MM' },
          type: { type: 'string', enum: ['expense', 'income', 'all'] },
          limit: { type: 'number', description: 'จำนวนสูงสุด default 30' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyze_finances',
      description: 'วิเคราะห์การเงินเชิงลึก: trend 3 เดือน, breakdown รายหมวด, budget vs actual, allocation balance, loans, top expenses พร้อม note เพื่อหาพฤติกรรมการใช้เงิน จุดอ่อน และให้คำแนะนำ',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_loan_status',
      description: 'ดูสถานะหนี้สิน: เงินให้ยืม (lent) และเงินยืมมา (borrowed) พร้อม note',
      parameters: {
        type: 'object',
        properties: {
          direction: { type: 'string', enum: ['lent', 'borrowed', 'all'], description: 'ประเภทหนี้' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_budget_status',
      description: 'ดูงบประมาณ vs รายจ่ายจริงต่อหมวดหมู่',
      parameters: {
        type: 'object',
        properties: {
          month: { type: 'string', description: 'YYYY-MM' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_portfolio',
      description: 'ดูภาพรวมการลงทุน: ต้นทุน มูลค่าปัจจุบัน กำไร/ขาดทุน แต่ละกองทุน/หุ้น',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_tax_summary',
      description: 'ดูค่าลดหย่อนภาษีที่บันทึกไว้ และผลคำนวณภาษีเบื้องต้น',
      parameters: {
        type: 'object',
        properties: {
          taxYear: { type: 'number', description: 'ปีภาษี ค.ศ. เช่น 2025 (ห้ามใช้ พ.ศ.)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calculate_comprehensive_tax',
      description: 'คำนวณภาษีครอบคลุม: อิงจากรายได้จริงปีนี้ เงินปันผล กำไรลงทุน ค่าลดหย่อนทั้งหมด แนะนำการปรับให้ประหยัดภาษีสูงสุด',
      parameters: {
        type: 'object',
        properties: {
          taxYear: { type: 'number', description: 'ปีภาษี ค.ศ. default ปีปัจจุบัน (ห้ามใช้ พ.ศ.)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'ค้นหาข้อมูลจาก internet เช่น NAV กองทุน อัตราภาษี ข่าวการเงิน',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'คำค้นหา' },
          max_results: { type: 'number', description: 'จำนวนผลลัพธ์ default 5' },
        },
        required: ['query'],
      },
    },
  },
  // ── WRITE: Transactions ───────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'create_transaction',
      description: 'บันทึกรายรับหรือรายจ่าย ต้องขอ confirm จาก user ก่อนเสมอ',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['expense', 'income'] },
          amount: { type: 'number' },
          categoryName: { type: 'string', description: 'ชื่อหมวดหมู่ (ใกล้เคียง)' },
          note: { type: 'string' },
          occurredAt: { type: 'string', description: 'ISO datetime ค.ศ. เช่น 2026-05-24T10:00:00Z ถ้าไม่ระบุใช้ตอนนี้' },
        },
        required: ['type', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_transaction',
      description: 'ลบรายการธุรกรรม ต้องผ่าน double confirmation เท่านั้น',
      parameters: {
        type: 'object',
        properties: {
          transactionId: { type: 'string', description: 'id ของรายการ (ได้จาก get_transactions)' },
        },
        required: ['transactionId'],
      },
    },
  },
  // ── WRITE: Loans ──────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'create_loan',
      description: 'บันทึกการให้ยืม (lent) หรือการยืมมา (borrowed) ต้อง confirm ก่อน',
      parameters: {
        type: 'object',
        properties: {
          direction: { type: 'string', enum: ['lent', 'borrowed'] },
          borrower: { type: 'string', description: 'ชื่อคู่สัญญา (ผู้ยืม หรือ เจ้าหนี้)' },
          amount: { type: 'number' },
          note: { type: 'string' },
          lentAt: { type: 'string', description: 'YYYY-MM-DD' },
        },
        required: ['direction', 'borrower', 'amount', 'lentAt'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'record_loan_payment',
      description: 'บันทึกการชำระหนี้ (คืนเงิน/จ่ายคืน) ต้อง confirm ก่อน',
      parameters: {
        type: 'object',
        properties: {
          loanId: { type: 'string', description: 'id ของหนี้ (ได้จาก get_loan_status)' },
          amount: { type: 'number' },
          paidAt: { type: 'string', description: 'YYYY-MM-DD' },
          note: { type: 'string' },
        },
        required: ['loanId', 'amount', 'paidAt'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_loan',
      description: 'ลบรายการหนี้ ต้องผ่าน double confirmation เท่านั้น',
      parameters: {
        type: 'object',
        properties: {
          loanId: { type: 'string' },
        },
        required: ['loanId'],
      },
    },
  },
  // ── WRITE: Categories ────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'create_category',
      description: 'สร้างหมวดหมู่รายรับหรือรายจ่ายใหม่ ต้อง confirm ก่อน',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          type: { type: 'string', enum: ['expense', 'income'] },
          icon: {
            type: 'string',
            enum: [...MDI_ICON_IDS],
            description: 'MDI icon ID จากรายการที่กำหนด',
          },
          color: { type: 'string', description: 'hex color เช่น #f97316' },
        },
        required: ['name', 'type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_category',
      description: 'ลบหมวดหมู่ที่ user สร้างเอง (ห้ามลบ default) ต้อง double confirmation',
      parameters: {
        type: 'object',
        properties: {
          categoryName: { type: 'string', description: 'ชื่อหมวดหมู่ที่จะลบ' },
        },
        required: ['categoryName'],
      },
    },
  },
  // ── WRITE: Allocations ───────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'create_allocation',
      description: 'สร้างซองเงิน/wallet ใหม่ พร้อมผูกหมวดหมู่ ต้อง confirm ก่อน',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          icon: {
            type: 'string',
            enum: [...MDI_ICON_IDS],
            description: 'MDI icon ID จากรายการที่กำหนด',
          },
          color: { type: 'string', description: 'hex color' },
          categoryNames: { type: 'array', items: { type: 'string' }, description: 'ชื่อหมวดรายจ่ายที่ผูก' },
          incomeCategoryNames: { type: 'array', items: { type: 'string' }, description: 'ชื่อหมวดรายรับที่ผูก' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_allocation',
      description: 'แก้ไข wallet: ชื่อ ไอคอน สี หรือผูก/ยกเลิกหมวดหมู่ ต้อง confirm ก่อน',
      parameters: {
        type: 'object',
        properties: {
          allocationName: { type: 'string', description: 'ชื่อ wallet ที่จะแก้' },
          newName: { type: 'string' },
          icon: { type: 'string', enum: [...MDI_ICON_IDS] },
          color: { type: 'string' },
          categoryNames: { type: 'array', items: { type: 'string' }, description: 'หมวดรายจ่ายใหม่ (แทนที่ของเดิมทั้งหมด)' },
          incomeCategoryNames: { type: 'array', items: { type: 'string' } },
        },
        required: ['allocationName'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'move_allocation_funds',
      description: 'โอนเงินระหว่าง wallet หรือย้ายจาก unallocated pool ต้อง confirm พร้อมบอกยอดก่อน-หลัง',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['move_in', 'transfer', 'unallocate'], description: 'move_in=จาก unallocated, transfer=ระหว่าง wallet, unallocate=คืนไป pool' },
          fromAllocationName: { type: 'string', description: 'สำหรับ transfer/unallocate' },
          toAllocationName: { type: 'string', description: 'สำหรับ move_in/transfer' },
          amount: { type: 'number' },
        },
        required: ['action', 'amount'],
      },
    },
  },
  // ── WRITE: Budgets ───────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'delete_budget',
      description: 'ลบงบประมาณของหมวดหมู่ที่ระบุออกจากเดือนนั้น',
      parameters: {
        type: 'object',
        properties: {
          categoryName: { type: 'string', description: 'ชื่อหมวดหมู่ (ใกล้เคียง)' },
          month: { type: 'string', description: 'YYYY-MM' },
        },
        required: ['categoryName', 'month'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_budget_plan',
      description: 'ตั้งงบประมาณหลายหมวดพร้อมกัน อิงจาก spending pattern ต้อง confirm ก่อน',
      parameters: {
        type: 'object',
        properties: {
          month: { type: 'string', description: 'YYYY-MM' },
          budgets: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                categoryName: { type: 'string' },
                amount: { type: 'number' },
              },
              required: ['categoryName', 'amount'],
            },
          },
        },
        required: ['month', 'budgets'],
      },
    },
  },
  // ── WRITE: Investments ───────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'add_investment',
      description: 'เพิ่มกองทุน/หุ้นใหม่ในพอร์ต ถ้าจะซื้อด้วยให้ call add_investment_transaction ต่อเนื่องในรอบเดียวกัน',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'ชื่อกองทุน เช่น SCBS&P500' },
          symbol: { type: 'string', description: 'ชื่อย่อ' },
          type: { type: 'string', enum: ['mutual_fund', 'stock', 'etf', 'bond', 'crypto', 'other'] },
          note: { type: 'string' },
        },
        required: ['name', 'type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_investment_transaction',
      description: 'บันทึก ซื้อ/ขาย/ปันผล ของกองทุน ถ้ากองทุนยังไม่มีให้ call add_investment ก่อนแล้ว call tool นี้ในรอบเดียวกัน',
      parameters: {
        type: 'object',
        properties: {
          investmentName: { type: 'string', description: 'ชื่อกองทุน (ใกล้เคียง)' },
          type: { type: 'string', enum: ['buy', 'sell', 'dividend'] },
          amount: { type: 'number', description: 'มูลค่าเงิน (บาท)' },
          units: { type: 'number', description: 'จำนวนหน่วย (ถ้ามี)' },
          navPrice: { type: 'number', description: 'NAV ต่อหน่วย (ถ้ามี)' },
          occurredAt: { type: 'string', description: 'YYYY-MM-DD ค.ศ. เช่น 2026-05-24 (ห้ามใช้ พ.ศ.)' },
          note: { type: 'string' },
        },
        required: ['investmentName', 'type', 'amount', 'occurredAt'],
      },
    },
  },
  // ── WRITE: Tax ───────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'add_tax_deduction',
      description: 'บันทึกค่าลดหย่อนภาษี เช่น SSF RMF ประกันชีวิต ต้อง confirm ก่อน',
      parameters: {
        type: 'object',
        properties: {
          taxYear: { type: 'number', description: 'ปีภาษี ค.ศ. เช่น 2025 (ห้ามใช้ พ.ศ. เช่น ห้ามใส่ 2568)' },
          type: { type: 'string', description: 'ประเภท เช่น ssf, rmf, life_insurance, health_insurance, personal_allowance' },
          name: { type: 'string', description: 'ชื่อ เช่น SSF กรุงไทย' },
          amount: { type: 'number' },
          note: { type: 'string' },
        },
        required: ['taxYear', 'type', 'name', 'amount'],
      },
    },
  },
  // ── UI Actions ────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'change_theme',
      description: 'เปลี่ยน theme ของแอปเป็น light หรือ dark',
      parameters: {
        type: 'object',
        properties: {
          theme: { type: 'string', enum: ['light', 'dark'] },
        },
        required: ['theme'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'navigate_to',
      description: 'พา user ไปยังหน้าที่เกี่ยวข้อง เช่น /investments /tax /loans /budget',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'path เช่น /investments, /tax, /loans, /budget, /wallets, /finance' },
          reason: { type: 'string', description: 'เหตุผลที่ navigate ไป' },
        },
        required: ['path'],
      },
    },
  },
]

// ─────────────────────────────────────────────────────────────

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name)
  private readonly OPENROUTER_BASE = 'https://openrouter.ai/api/v1'
  private readonly CHAT_MODEL = 'deepseek/deepseek-v4-flash'
  private readonly VISION_MODEL = 'google/gemini-2.5-flash-lite'
  private readonly MAX_HISTORY = 50
  // Approximate model pricing per 1M tokens (USD) — used as fallback when OpenRouter doesn't return cost
  private readonly MODEL_PRICING: Record<string, { input: number; output: number }> = {
    'deepseek/deepseek-v4-flash': { input: 0.10, output: 0.30 },
    'google/gemini-2.5-flash-lite': { input: 0.075, output: 0.30 },
  }
  private readonly THB_PER_USD = 36

  constructor(
    @InjectRepository(ChatMessage)
    private readonly msgRepo: Repository<ChatMessage>,
    @InjectRepository(AiUsageLog)
    private readonly usageRepo: Repository<AiUsageLog>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly tavily: TavilyService,
    private readonly categoriesSvc: CategoriesService,
    private readonly loansSvc: LoansService,
    private readonly budgetsSvc: BudgetsService,
    private readonly allocationsSvc: AllocationsService,
    private readonly investmentsSvc: InvestmentsService,
    private readonly taxSvc: TaxService,
    // Transactions written by a tool go through the same service the REST API uses.
    // Hand-rolled SQL here had already drifted: it never set `expenses.allocation_id`,
    // and `delete_transaction` reversed `total_balance` while leaving the envelope
    // untouched, so asking the assistant to undo its own entry corrupted the wallet.
    private readonly expensesSvc: ExpensesService,
  ) {}

  /** The zone that decides what "this month" means for this user. */
  private async tzFor(userId: string): Promise<string> {
    const user = await this.userRepo.findOne({ where: { id: userId }, select: ['id', 'timezone'] })
    return safeTimezone(user?.timezone)
  }

  /** A model-supplied month is untrusted input; fall back rather than query on it. */
  private validMonth(value: unknown, fallback: string): string {
    return typeof value === 'string' && MONTH_PATTERN.test(value) ? value : fallback
  }

  /**
   * A date the model supplied, normalised to an ISO instant.
   *
   * Two corrections. Thai users say years in the Buddhist era, and the model echoes them
   * back ("2569-05-24"); anything past 2500 is BE and gets 543 subtracted. And a bare
   * `YYYY-MM-DD` has no zone, so parsing it as ISO gives midnight *UTC* — 07:00 the same
   * morning in Bangkok, which is fine, but midnight local is what the user means, and on
   * the 1st of a month the difference decides which month the entry lands in.
   */
  private normalizeOccurredAt(raw: unknown, tz: string): string {
    const fallback = localToday(tz)
    let value = typeof raw === 'string' && raw.trim() ? raw.trim() : fallback
    value = value.replace(/^(\d{4})/, (y) => (parseInt(y, 10) > 2500 ? String(parseInt(y, 10) - 543) : y))

    // Already a full timestamp — trust it.
    if (/\d{2}:\d{2}/.test(value)) {
      const parsed = new Date(value)
      return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString()
    }

    const day = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback
    // Noon local keeps the calendar day stable under any zone offset, including the
    // half-hour ones, without needing a tz-aware date library on the server.
    const noonLocal = new Date(`${day}T12:00:00Z`)
    const offsetMin = this.zoneOffsetMinutes(tz, noonLocal)
    return new Date(noonLocal.getTime() - offsetMin * 60_000).toISOString()
  }

  /** Minutes `tz` is ahead of UTC at `at`. */
  private zoneOffsetMinutes(tz: string, at: Date): number {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(at)
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'))
    return Math.round((asUtc - at.getTime()) / 60_000)
  }

  // ── Send chat message ──────────────────────────────────────
  async chat(userId: string, userMessage: string, context: Record<string, any> = {}) {
    await this.saveMessage(userId, 'user', userMessage)
    const history = await this.getHistory(userId)
    const systemPrompt = this.buildSystemPrompt(context)
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-this.MAX_HISTORY).map(m => ({ role: m.role, content: m.content })),
    ]
    const reply = await this.callDeepSeek(userId, messages)
    await this.saveMessage(userId, 'assistant', reply)
    return { message: reply }
  }

  // ── Vision: analyze any image via Gemini ───────────────────
  async analyzeImage(imageBase64: string, mimeType: string, userId?: string): Promise<Record<string, any>> {
    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) throw new Error('OPENROUTER_API_KEY not configured')

    const prompt = `วิเคราะห์รูปนี้และตอบเป็น JSON เท่านั้น ห้ามมีข้อความอื่น:

{
  "description": "อธิบายรูปโดยละเอียดเป็นภาษาไทย",
  "isFinancialDoc": true หรือ false (true ถ้าเป็น บิล/ใบเสร็จ/สลิปโอน/invoice/ใบแจ้งหนี้),
  "extractedData": {
    "shop": "ชื่อร้านหรือแหล่งที่มา หรือ null",
    "items": [{"name": "รายการ", "price": 0}],
    "total": 0,
    "date": "YYYY-MM-DD หรือ null",
    "category": "Food & Drink / Transport / Shopping / Health / Entertainment / Utilities / Other"
  }
}

ถ้า isFinancialDoc เป็น false ให้ extractedData เป็น null`

    try {
      const res = await axios.post(
        `${this.OPENROUTER_BASE}/chat/completions`,
        {
          model: this.VISION_MODEL,
          messages: [{ role: 'user', content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
          ]}],
          max_tokens: 1000,
        },
        { headers: this.openRouterHeaders(), timeout: 30000 },
      )
      const genId = res.data.id
      if (genId && userId) this.fetchAndLogUsage(userId, this.VISION_MODEL, [genId]).catch(() => {})
      const content = res.data.choices[0]?.message?.content ?? ''
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) return JSON.parse(jsonMatch[0])
      return { description: content, isFinancialDoc: false, extractedData: null }
    } catch (err: any) {
      this.logger.error(`Vision error: ${err.message}`)
      throw err
    }
  }

  // ── Chat history ───────────────────────────────────────────
  async getHistory(userId: string, limit = this.MAX_HISTORY): Promise<ChatMessage[]> {
    return this.msgRepo.find({ where: { userId }, order: { createdAt: 'ASC' }, take: limit })
  }

  async clearHistory(userId: string) {
    await this.msgRepo.delete({ userId })
    return { success: true }
  }

  // ── SSE helpers ───────────────────────────────────────────
  private sendSSEChunk(res: any, content: string) {
    res.write(`data: ${JSON.stringify({ content })}\n\n`)
  }

  private sendSSEAction(res: any, action: Record<string, any>) {
    res.write(`event: action\ndata: ${JSON.stringify(action)}\n\n`)
  }

  // ── Stream from OpenRouter, forwarding content chunks ─────
  private async streamFromOpenRouter(
    messages: any[],
    onChunk: (text: string) => void,
    toolChoice: 'auto' | 'none' | 'required' = 'auto',
  ): Promise<{ content: string; toolCalls: any[] | null; generationId: string | null }> {
    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) throw new Error('OPENROUTER_API_KEY not configured')

    const body: any = {
      model: this.CHAT_MODEL,
      messages,
      tools: TOOLS,
      tool_choice: toolChoice,
      max_tokens: 3000,
      temperature: 0.7,
      stream: true,
    }

    const response = await axios.post(
      `${this.OPENROUTER_BASE}/chat/completions`,
      body,
      { headers: this.openRouterHeaders(), responseType: 'stream', timeout: 60000 },
    )

    let fullContent = ''
    const toolCallsMap: Record<number, any> = {}
    let isToolCallResponse = false
    let generationId: string | null = null

    await new Promise<void>((resolve, reject) => {
      let buffer = ''

      response.data.on('data', (raw: Buffer) => {
        buffer += raw.toString('utf8')
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const data = trimmed.slice(5).trim()
          if (data === '[DONE]') { resolve(); return }

          try {
            const parsed = JSON.parse(data)
            // Capture OpenRouter generation ID (appears in every chunk as `id`)
            if (parsed.id && !generationId) generationId = parsed.id
            const choice = parsed.choices?.[0]
            if (!choice) continue
            const delta = choice.delta

            // Accumulate tool call deltas
            if (delta?.tool_calls?.length > 0) {
              isToolCallResponse = true
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0
                if (!toolCallsMap[idx]) {
                  toolCallsMap[idx] = { id: '', type: 'function', function: { name: '', arguments: '' } }
                }
                if (tc.id) toolCallsMap[idx].id = tc.id
                if (tc.function?.name) toolCallsMap[idx].function.name += tc.function.name
                if (tc.function?.arguments) toolCallsMap[idx].function.arguments += tc.function.arguments
              }
            }

            // Stream content only if this is not a tool-call response
            if (delta?.content && !isToolCallResponse) {
              fullContent += delta.content
              onChunk(delta.content)
            }

            if (choice.finish_reason === 'stop' || choice.finish_reason === 'tool_calls') {
              resolve(); return
            }
          } catch { /* ignore malformed SSE lines */ }
        }
      })

      response.data.on('end', resolve)
      response.data.on('error', reject)
    })

    const toolCalls = Object.keys(toolCallsMap).length > 0 ? Object.values(toolCallsMap) : null
    return { content: fullContent, toolCalls, generationId }
  }

  // ── Fetch accurate cost from OpenRouter generation endpoint ─
  private async fetchAndLogUsage(userId: string, model: string, generationIds: string[]) {
    if (generationIds.length === 0) return
    // OpenRouter needs time to finalize generation cost data
    await new Promise(r => setTimeout(r, 8000))
    let totalPrompt = 0, totalCompletion = 0, totalCostUsd = 0
    for (const id of generationIds) {
      try {
        const res = await axios.get(`${this.OPENROUTER_BASE}/generation?id=${id}`, {
          headers: this.openRouterHeaders(), timeout: 10000,
        })
        const d = res.data?.data
        if (d) {
          totalPrompt += d.tokens_prompt ?? d.native_tokens_prompt ?? 0
          totalCompletion += d.tokens_completion ?? d.native_tokens_completion ?? 0
          totalCostUsd += d.total_cost ?? 0
        }
      } catch (err: any) {
        this.logger.warn(`[usage] generation ${id} fetch failed: ${err.message}`)
      }
    }
    await this.saveUsageLog(userId, model, totalPrompt, totalCompletion, totalCostUsd)
  }

  // ── Streaming chat (SSE endpoint) ─────────────────────────
  async chatStream(
    userId: string,
    userMessage: string,
    context: Record<string, any>,
    res: any,
    imageBase64?: string,
    mimeType?: string,
    imageThumbnail?: string,
  ) {
    const MAX_TOOL_ROUNDS = 5

    let imageAnalysis: Record<string, any> | undefined
    let messageForAI = userMessage || 'ผู้ใช้แนบรูปมาโดยไม่มีข้อความเพิ่มเติม'

    if (imageBase64 && mimeType) {
      res.write(`event: status\ndata: ${JSON.stringify({ text: 'กำลังอ่านรูป...' })}\n\n`)
      res.flush?.()
      try {
        imageAnalysis = await this.analyzeImage(imageBase64, mimeType, userId)
        if (imageThumbnail) imageAnalysis.thumbnail = imageThumbnail
        messageForAI = `[ข้อมูลจากรูปที่แนบมา (วิเคราะห์โดย Gemini)]\n${JSON.stringify(imageAnalysis, null, 2)}\n\n${userMessage || 'ผู้ใช้แนบรูปมาโดยไม่มีข้อความเพิ่มเติม'}`
      } catch {
        imageAnalysis = imageThumbnail ? { thumbnail: imageThumbnail } : undefined
        messageForAI = `[ไม่สามารถอ่านรูปได้]\n\n${userMessage || 'ผู้ใช้แนบรูปมาแต่อ่านไม่ได้'}`
      }
    }

    await this.saveMessage(userId, 'user', userMessage || 'แนบรูป', imageAnalysis)
    const history = await this.getHistory(userId)
    const systemPrompt = this.buildSystemPrompt(context)

    let currentMessages: any[] = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-this.MAX_HISTORY).map((m: any) => ({
        role: m.role,
        content: m.imageAnalysis
          ? `[ข้อมูลจากรูปที่แนบมา (วิเคราะห์โดย Gemini)]\n${JSON.stringify(m.imageAnalysis, null, 2)}\n\n${m.content}`
          : m.content,
      })),
    ]

    // Replace the last user message with the AI-enriched version (has image context)
    if (imageBase64) {
      const lastUserIdx = [...currentMessages].map(m => m.role).lastIndexOf('user')
      if (lastUserIdx !== -1) currentMessages[lastUserIdx] = { role: 'user', content: messageForAI }
    }

    const CONFIRM_PATTERN = /^(ใช่|ยืนยัน|ok|okay|ตกลง|โอเค|yes|confirm|บันทึกเลย|ทำเลย|ได้เลย|ใช่เลย|เค|ได้|อืม|เออ|อา)$/i
    const isConfirmation = CONFIRM_PATTERN.test(userMessage.trim())

    let fullResponse = ''
    const uiMarkers: string[] = []
    const generationIds: string[] = []

    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        // Force tool call on confirmation messages so model cannot hallucinate "done" without calling a tool
        const firstRoundChoice = round === 0 && isConfirmation ? 'required' : 'auto'
        const { content, toolCalls, generationId } = await this.streamFromOpenRouter(
          currentMessages,
          chunk => this.sendSSEChunk(res, chunk),
          firstRoundChoice,
        )
        if (generationId) generationIds.push(generationId)

        if (!toolCalls || toolCalls.length === 0) {
          // No tool calls — this is the final text response
          fullResponse = content
          break
        }

        // Execute all tools for this round
        const toolResults: any[] = []
        for (const call of toolCalls) {
          let args: any
          try { args = JSON.parse(call.function.arguments || '{}') } catch { args = {} }
          let result: any
          try { result = await this.executeTool(userId, call.function.name, args) }
          catch (err: any) {
            this.logger.error(`[tool:${call.function.name}] error: ${err.message}`)
            result = { error: err.message }
          }
          if (result?.error) this.logger.warn(`[tool:${call.function.name}] returned error: ${result.error}`)
          if (result?.marker) uiMarkers.push(result.marker)
          toolResults.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) })
        }

        // Append assistant tool-call message + results to message chain
        currentMessages = [
          ...currentMessages,
          { role: 'assistant', content: content || null, tool_calls: toolCalls },
          ...toolResults,
        ]

        // If this was the last allowed round, force a final text response
        if (round === MAX_TOOL_ROUNDS - 1) {
          const { content: finalContent, generationId: finalGenId } = await this.streamFromOpenRouter(
            currentMessages,
            chunk => this.sendSSEChunk(res, chunk),
            'none',
          )
          if (finalGenId) generationIds.push(finalGenId)
          fullResponse = finalContent
        }
      }

      // Send UI actions as a separate SSE event (never mixed into text content)
      if (uiMarkers.length > 0) {
        const action: Record<string, any> = {}
        const refreshPages = new Set<string>()
        for (const marker of uiMarkers) {
          const rm = marker.match(/\[REFRESH:([^\]]+)\]/i)
          if (rm) rm[1].split(',').forEach(p => refreshPages.add(p.trim()))
          const tm = marker.match(/\[THEME:([^\]]+)\]/i)
          if (tm) action.theme = tm[1]
          const nm = marker.match(/\[NAVIGATE:([^\]]+)\]/i)
          if (nm) action.navigate = nm[1]
        }
        if (refreshPages.size > 0) action.refresh = [...refreshPages]
        this.sendSSEAction(res, action)
      }

      await this.saveMessage(userId, 'assistant', fullResponse)
      this.fetchAndLogUsage(userId, this.CHAT_MODEL, generationIds).catch(() => {})
      res.write('data: [DONE]\n\n')
    } catch (err: any) {
      this.logger.error(`chatStream error: ${err.message}`)
      this.sendSSEChunk(res, `\n\nเกิดข้อผิดพลาด: ${err.message}`)
      res.write('data: [DONE]\n\n')
    }
  }

  // ── DeepSeek with tool calling ─────────────────────────────
  private async callDeepSeek(userId: string, messages: any[], toolChoice: 'auto' | 'none' = 'auto'): Promise<string> {
    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) return 'ยังไม่ได้ตั้งค่า OPENROUTER_API_KEY กรุณาเพิ่มใน .env'

    try {
      const res = await axios.post(
        `${this.OPENROUTER_BASE}/chat/completions`,
        { model: this.CHAT_MODEL, messages, tools: TOOLS, tool_choice: toolChoice, max_tokens: 3000, temperature: 0.7 },
        { headers: this.openRouterHeaders(), timeout: 60000 },
      )

      const genId = res.data.id
      if (genId) this.fetchAndLogUsage(userId, this.CHAT_MODEL, [genId]).catch(() => {})

      const choice = res.data.choices[0]
      const msg = choice.message

      if (toolChoice === 'auto' && msg.tool_calls?.length > 0) {
        return this.handleToolCalls(userId, messages, msg)
      }
      return msg.content ?? 'ไม่มีการตอบกลับ'
    } catch (err: any) {
      this.logger.error(`DeepSeek error: ${JSON.stringify(err.response?.data ?? err.message)}`)
      return `เกิดข้อผิดพลาด: ${err.message}`
    }
  }

  private async handleToolCalls(userId: string, messages: any[], assistantMsg: any): Promise<string> {
    const toolResults: any[] = []
    const uiMarkers: string[] = []

    for (const call of assistantMsg.tool_calls) {
      const args = JSON.parse(call.function.arguments || '{}')
      let result: any
      try {
        result = await this.executeTool(userId, call.function.name, args)
      } catch (err: any) {
        result = { error: err.message }
      }
      if (result?.marker) uiMarkers.push(result.marker)
      toolResults.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) })
    }

    const updatedMessages = [
      ...messages,
      { role: 'assistant', content: null, tool_calls: assistantMsg.tool_calls },
      ...toolResults,
    ]
    // Use tool_choice:'none' so the model reads tool results but won't call tools again
    const response = await this.callDeepSeek(userId, updatedMessages, 'none')
    return uiMarkers.length > 0 ? `${response} ${uiMarkers.join(' ')}` : response
  }

  // ─────────────────────────────────────────────────────────────
  // Tool executor
  // ─────────────────────────────────────────────────────────────
  private async executeTool(userId: string, name: string, args: any): Promise<any> {
    // Every date boundary below follows the user's own calendar. Deriving "this month"
    // from the server clock reported the previous month for the first seven hours of
    // every 1st in Asia/Bangkok, so the assistant answered about the wrong month.
    const tz = await this.tzFor(userId)
    const today = localToday(tz)
    const currentMonth = localMonth(tz)
    const currentYear = parseInt(today.slice(0, 4), 10)
    const db = this.msgRepo.manager

    switch (name) {

      // ── get_financial_summary ──────────────────────────────
      case 'get_financial_summary': {
        const month = this.validMonth(args.month, currentMonth)
        const [row] = await db.query(
          `SELECT COALESCE(SUM(amount) FILTER (WHERE type='expense'),0) AS expense,
                  COALESCE(SUM(amount) FILTER (WHERE type='income'),0)  AS income
             FROM expenses
            WHERE user_id=$1 AND ${monthRangePredicate('occurred_at', '$2', '$3')}`,
          [userId, month, tz],
        )
        const totalExpense = parseFloat(row?.expense ?? '0')
        const totalIncome = parseFloat(row?.income ?? '0')
        return { month, totalExpense, totalIncome, net: totalIncome - totalExpense }
      }

      // ── get_transactions ───────────────────────────────────
      case 'get_transactions': {
        const month = this.validMonth(args.month, currentMonth)
        const limit = Math.min(Math.max(parseInt(args.limit, 10) || 30, 1), 200)

        // `args` is JSON the *model* produced, and the model is steered by whatever the
        // user typed. Interpolating it into SQL turned a prompt injection into a SQL
        // injection: `type: "x' OR '1'='1"` closed the quote and, because AND binds
        // tighter than OR, collapsed the whole WHERE clause to TRUE — returning every
        // row in `expenses`, for every account. Bound parameter, plus a whitelist so an
        // unknown value degrades to "no filter" rather than reaching the driver.
        const type = args.type === 'expense' || args.type === 'income' ? args.type : null

        const rows = await db.query(
          `SELECT e.id, e.amount, e.type, e.note, e.occurred_at, c.name as category
           FROM expenses e LEFT JOIN categories c ON e.category_id=c.id
           WHERE e.user_id=$1
             AND ${monthRangePredicate('e.occurred_at', '$2', '$3')}
             AND ($4::text IS NULL OR e.type = $4)
           ORDER BY e.occurred_at DESC LIMIT $5`,
          [userId, month, tz, type, limit],
        )
        return { transactions: rows, count: rows.length, month }
      }

      // ── analyze_finances ───────────────────────────────────
      case 'analyze_finances': {
        // Three whole calendar months ending with the current one, in the user's zone.
        // `occurred_at >= NOW() - INTERVAL '3 months'` returned four partial buckets and
        // cut the oldest one mid-month, so the "3-month trend" compared unequal periods.
        const firstMonth = shiftMonth(currentMonth, -2)

        const [trend, catBreakdown, topExpenses, budgets, allocations, loans, portfolio] = await Promise.all([
          // 3-month trend
          db.query(
            `SELECT TO_CHAR(occurred_at AT TIME ZONE $2, 'YYYY-MM') as month,
                    SUM(CASE WHEN type='income' THEN amount ELSE 0 END) as income,
                    SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) as expense
             FROM expenses
             WHERE user_id=$1
               AND occurred_at >= ((($3 || '-01')::date)::timestamp AT TIME ZONE $2)
               AND occurred_at < (((($4 || '-01')::date) + INTERVAL '1 month')::timestamp AT TIME ZONE $2)
             GROUP BY 1 ORDER BY 1`,
            [userId, tz, firstMonth, currentMonth],
          ),
          // Category breakdown current month with notes sample
          db.query(
            `SELECT c.name as category, SUM(e.amount) as total, COUNT(*) as count,
                    STRING_AGG(DISTINCT e.note, ' | ') as sample_notes
             FROM expenses e LEFT JOIN categories c ON e.category_id=c.id
             WHERE e.user_id=$1 AND ${monthRangePredicate('e.occurred_at', '$2', '$3')}
               AND e.type='expense'
             GROUP BY c.name ORDER BY total DESC LIMIT 10`,
            [userId, currentMonth, tz],
          ),
          // Top 5 biggest expenses this month with note
          db.query(
            `SELECT e.amount, e.note, e.occurred_at, c.name as category
             FROM expenses e LEFT JOIN categories c ON e.category_id=c.id
             WHERE e.user_id=$1 AND ${monthRangePredicate('e.occurred_at', '$2', '$3')}
               AND e.type='expense'
             ORDER BY e.amount DESC LIMIT 5`,
            [userId, currentMonth, tz],
          ),
          // Budget vs actual
          this.budgetsSvc.getBudgetWithActual(userId, currentMonth),
          // Allocation balances
          this.allocationsSvc.findAll(userId),
          // Active loans both directions
          this.loansSvc.getDashboardSummary(userId),
          // Portfolio
          this.investmentsSvc.findAll(userId),
        ])

        return {
          trend,
          categoryBreakdown: catBreakdown,
          topExpenses,
          budgets,
          allocations: allocations.map((a: any) => ({ name: a.name, balance: a.balance })),
          loans: {
            totalOutstanding: loans.totalOutstanding,
            totalOwed: loans.totalOwed,
            active: loans.loans?.slice(0, 5),
          },
          // `currentValue` and `gain` are not produced anywhere — InvestmentsService
          // returns cost/sold/netCost/units and no market price is ever fetched. Reading
          // them yielded `undefined`, which fell back to cost and told the model the
          // portfolio's gain was exactly zero, every time. Report what is actually known
          // and say plainly that market value is not tracked, so it stops inventing one.
          portfolio: {
            totalCost: portfolio.reduce((s: number, inv: any) => s + (inv.totalCost ?? 0), 0),
            totalSold: portfolio.reduce((s: number, inv: any) => s + (inv.totalSold ?? 0), 0),
            netCost: portfolio.reduce((s: number, inv: any) => s + (inv.netCost ?? 0), 0),
            marketValueTracked: false,
            investments: portfolio.map((inv: any) => ({
              name: inv.name, type: inv.type, netCost: inv.netCost, units: inv.totalUnits,
            })),
          },
        }
      }

      // ── get_loan_status ────────────────────────────────────
      case 'get_loan_status': {
        const rows = await db.query(
          `SELECT l.id, l.direction, l.borrower, l.amount, l.note, l.lent_at, l.status,
                  COALESCE((SELECT SUM(p.amount) FROM loan_payments p WHERE p.loan_id=l.id),0) as paid
           FROM loans l WHERE l.user_id=$1 AND ($2::text='all' OR l.direction=$2) AND l.status='active'
           ORDER BY l.lent_at DESC`,
          [userId, args.direction ?? 'all'],
        )
        const enriched = rows.map((r: any) => ({
          id: r.id,
          direction: r.direction,
          borrower: r.borrower,
          amount: parseFloat(r.amount),
          paid: parseFloat(r.paid),
          outstanding: parseFloat(r.amount) - parseFloat(r.paid),
          note: r.note,
          lentAt: r.lent_at,
          status: r.status,
        }))
        const lent = enriched.filter((r: any) => r.direction === 'lent')
        const borrowed = enriched.filter((r: any) => r.direction === 'borrowed')
        return {
          totalOutstanding: lent.reduce((s: number, r: any) => s + r.outstanding, 0),
          totalOwed: borrowed.reduce((s: number, r: any) => s + r.outstanding, 0),
          lent,
          borrowed,
        }
      }

      // ── get_budget_status ──────────────────────────────────
      case 'get_budget_status': {
        const month = this.validMonth(args.month, currentMonth)
        return { month, budgets: await this.budgetsSvc.getBudgetWithActual(userId, month) }
      }

      // ── get_portfolio ──────────────────────────────────────
      case 'get_portfolio': {
        const investments = await this.investmentsSvc.findAll(userId)
        // No market price is stored, so there is no gain to report — see analyze_finances.
        return {
          investments,
          totalCost: investments.reduce((s: number, inv: any) => s + (inv.totalCost ?? 0), 0),
          totalSold: investments.reduce((s: number, inv: any) => s + (inv.totalSold ?? 0), 0),
          netCost: investments.reduce((s: number, inv: any) => s + (inv.netCost ?? 0), 0),
          marketValueTracked: false,
        }
      }

      // ── get_tax_summary ────────────────────────────────────
      case 'get_tax_summary': {
        const taxYear = args.taxYear ?? currentYear
        const deductions = await this.taxSvc.findByYear(userId, taxYear)
        const types = this.taxSvc.getDeductionTypes()
        return { taxYear, deductions, availableTypes: types }
      }

      // ── calculate_comprehensive_tax ────────────────────────
      case 'calculate_comprehensive_tax': {
        const taxYear = args.taxYear ?? currentYear
        const yearStr = String(taxYear)

        const [incomeRows, dividendRows, deductions] = await Promise.all([
          // Annual income from transactions. `EXTRACT(YEAR FROM occurred_at)` reads the
          // server's zone, which for a UTC container puts income earned on 1 Jan before
          // 07:00 Bangkok time into the *previous* tax year — the one thing a tax
          // calculation must not get wrong.
          db.query(
            `SELECT COALESCE(SUM(amount),0) as total FROM expenses
             WHERE user_id=$1 AND type='income'
               AND ${yearRangePredicate('occurred_at', '$2', '$3')}`,
            [userId, yearStr, tz],
          ),
          // Dividends from investments
          db.query(
            `SELECT COALESCE(SUM(it.amount),0) as total
             FROM investment_transactions it
             JOIN investments i ON it.investment_id=i.id
             WHERE i.user_id=$1 AND it.type='dividend'
               AND ${yearRangePredicate('it.occurred_at', '$2', '$3')}`,
            [userId, yearStr, tz],
          ),
          this.taxSvc.findByYear(userId, taxYear),
        ])

        const annualIncome = parseFloat(incomeRows[0]?.total ?? '0')
        const dividendIncome = parseFloat(dividendRows[0]?.total ?? '0')
        const totalIncome = annualIncome + dividendIncome

        // Use TaxService to calculate with existing deductions
        const calculation = await this.taxSvc.calculate(userId, totalIncome, taxYear)

        // Suggest optimization: how much more SSF/RMF to maximize deductions
        const ssfDeducted = deductions.filter((d: any) => d.type === 'ssf').reduce((s: any, d: any) => s + parseFloat(d.amount), 0)
        const rmfDeducted = deductions.filter((d: any) => d.type === 'rmf').reduce((s: any, d: any) => s + parseFloat(d.amount), 0)
        const ssfMax = Math.min(totalIncome * 0.3, 200000)
        const rmfMax = Math.min(totalIncome * 0.3, 500000)
        const ssfRemaining = Math.max(0, ssfMax - ssfDeducted)
        const rmfRemaining = Math.max(0, rmfMax - rmfDeducted)

        return {
          taxYear,
          incomeBreakdown: { salary: annualIncome, dividends: dividendIncome, total: totalIncome },
          calculation,
          optimization: {
            ssfDeducted, ssfMax: ssfMax.toFixed(0), ssfRemaining: ssfRemaining.toFixed(0),
            rmfDeducted, rmfMax: rmfMax.toFixed(0), rmfRemaining: rmfRemaining.toFixed(0),
            note: ssfRemaining > 0 || rmfRemaining > 0
              ? `ซื้อ SSF เพิ่มได้อีก ฿${ssfRemaining.toFixed(0)} หรือ RMF ฿${rmfRemaining.toFixed(0)} เพื่อลดหย่อนสูงสุด`
              : 'ใช้สิทธิ์ลดหย่อน SSF/RMF เต็มแล้ว',
          },
        }
      }

      // ── web_search ─────────────────────────────────────────
      case 'web_search': {
        const result = await this.tavily.search(args.query, args.max_results ?? 5)
        return {
          answer: result.answer,
          results: result.results.slice(0, 3).map((r: any) => ({
            title: r.title, url: r.url, snippet: r.content.slice(0, 300),
          })),
        }
      }

      // ── create_transaction ─────────────────────────────────
      case 'create_transaction': {
        const type = args.type === 'income' ? 'income' : 'expense'
        const amount = Number(args.amount)
        if (!Number.isFinite(amount) || amount <= 0) {
          return { error: 'จำนวนเงินต้องมากกว่า 0' }
        }

        const cats = await db.query(
          `SELECT id, name FROM categories WHERE user_id=$1 AND type=$2 ORDER BY name`,
          [userId, type],
        )
        // Falling back to `cats[0]` filed the entry under an arbitrary category when the
        // name did not match — a silent misclassification the user has no way to notice.
        // Better to hand the model the list and let it ask.
        const wanted = String(args.categoryName ?? '').trim().toLowerCase()
        const cat = wanted
          ? cats.find((c: any) => c.name.toLowerCase() === wanted)
            ?? cats.find((c: any) => c.name.toLowerCase().includes(wanted))
          : undefined
        if (!cat) {
          return {
            error: `ไม่พบหมวด "${args.categoryName ?? ''}"`,
            availableCategories: cats.map((c: any) => c.name),
          }
        }

        const occurredAt = this.normalizeOccurredAt(args.occurredAt, tz)

        // Through the service, not raw SQL: it runs in one transaction, resolves and
        // stores `allocation_id`, and moves the envelope balance the same way the REST
        // API does. The old hand-written INSERT did none of that.
        const created = await this.expensesSvc.create(
          { categoryId: cat.id, amount, type, note: args.note ?? undefined, occurredAt },
          userId,
        )

        return {
          success: true,
          transactionId: created.id,
          message: `บันทึก${type === 'income' ? 'รายรับ' : 'รายจ่าย'} ฿${amount} หมวด "${cat.name}" แล้ว`,
          marker: '[REFRESH:transactions,dashboard,wallets]',
        }
      }

      // ── delete_transaction ─────────────────────────────────
      case 'delete_transaction': {
        // A model-supplied id that is not a UUID reached Postgres and came back as
        // `invalid input syntax for type uuid` — a 500 in the middle of an open stream.
        if (!UUID_PATTERN.test(String(args.transactionId ?? ''))) {
          return { error: 'ไม่พบรายการนี้' }
        }

        let tx: any
        try {
          tx = await this.expensesSvc.findOne(args.transactionId, userId)
        } catch {
          return { error: 'ไม่พบรายการนี้' }
        }

        // The previous version deleted the row and reversed `total_balance` but never
        // touched the envelope, so "จดค่ากาแฟ 100" then "ลบรายการนั้น" left the wallet
        // permanently 100 short. `remove()` reverses both, in one transaction.
        await this.expensesSvc.remove(args.transactionId, userId)

        return {
          success: true,
          message: `ลบรายการ "${tx.note ?? tx.category?.name ?? ''}" ฿${tx.amount} แล้ว`,
          marker: '[REFRESH:transactions,dashboard,wallets]',
        }
      }

      // ── create_loan ────────────────────────────────────────
      case 'create_loan': {
        const loan = await this.loansSvc.create(userId, {
          direction: args.direction,
          borrower: args.borrower,
          amount: args.amount,
          note: args.note,
          lentAt: args.lentAt,
        })
        return { success: true, loanId: loan.id, message: `บันทึก${args.direction === 'lent' ? 'การให้ยืม' : 'การยืมเงิน'} ฿${args.amount} กับ ${args.borrower} แล้ว`, marker: '[REFRESH:loans,dashboard]' }
      }

      // ── record_loan_payment ────────────────────────────────
      case 'record_loan_payment': {
        await this.loansSvc.addPayment(userId, args.loanId, {
          amount: args.amount,
          paidAt: args.paidAt,
          note: args.note,
        })
        return { success: true, message: `บันทึกการชำระ ฿${args.amount} แล้ว`, marker: '[REFRESH:loans,dashboard]' }
      }

      // ── delete_loan ────────────────────────────────────────
      case 'delete_loan': {
        await this.loansSvc.remove(userId, args.loanId)
        return { success: true, message: 'ลบรายการหนี้แล้ว', marker: '[REFRESH:loans,dashboard]' }
      }

      // ── create_category ────────────────────────────────────
      case 'create_category': {
        const cat = await this.categoriesSvc.create(
          { name: args.name, type: args.type, icon: args.icon ?? 'other', color: args.color ?? '#94a3b8' },
          userId,
        )
        return { success: true, categoryId: cat.id, message: `สร้างหมวดหมู่ "${args.name}" แล้ว`, marker: '[REFRESH:categories]' }
      }

      // ── delete_category ────────────────────────────────────
      case 'delete_category': {
        const cats = await this.categoriesSvc.findAll(userId)
        const cat = cats.find((c: any) =>
          c.name.toLowerCase().includes(args.categoryName.toLowerCase()),
        )
        if (!cat) return { error: `ไม่พบหมวดหมู่ "${args.categoryName}"` }
        if (cat.isDefault) return { error: `"${cat.name}" เป็นหมวด default ลบไม่ได้ แต่สามารถเปลี่ยนชื่อหรือไอคอนได้` }
        await this.categoriesSvc.remove(cat.id, userId)
        return { success: true, message: `ลบหมวดหมู่ "${cat.name}" แล้ว`, marker: '[REFRESH:categories]' }
      }

      // ── create_allocation ──────────────────────────────────
      case 'create_allocation': {
        const allCats = await this.categoriesSvc.findAll(userId)
        const resolveCatIds = (names: string[] = [], type: 'expense' | 'income') =>
          names.map(n => allCats.find((c: any) =>
            c.type === type && c.name.toLowerCase().includes(n.toLowerCase()),
          )?.id).filter(Boolean)

        const alloc = await this.allocationsSvc.create(
          {
            name: args.name,
            icon: args.icon,
            color: args.color,
            categoryIds: resolveCatIds(args.categoryNames, 'expense'),
            incomeCategoryIds: resolveCatIds(args.incomeCategoryNames, 'income'),
          },
          userId,
        )
        return { success: true, allocationId: alloc.id, message: `สร้าง wallet "${args.name}" แล้ว`, marker: '[REFRESH:wallets,dashboard]' }
      }

      // ── update_allocation ──────────────────────────────────
      case 'update_allocation': {
        const allocs = await this.allocationsSvc.findAll(userId)
        const alloc = (allocs as any[]).find((a: any) =>
          a.name.toLowerCase().includes(args.allocationName.toLowerCase()),
        )
        if (!alloc) return { error: `ไม่พบ wallet "${args.allocationName}"` }

        const allCats = await this.categoriesSvc.findAll(userId)
        const resolveCatIds = (names: string[] = [], type: 'expense' | 'income') =>
          names.map(n => allCats.find((c: any) =>
            c.type === type && c.name.toLowerCase().includes(n.toLowerCase()),
          )?.id).filter(Boolean)

        await this.allocationsSvc.update(alloc.id, {
          name: args.newName,
          icon: args.icon,
          color: args.color,
          categoryIds: args.categoryNames ? resolveCatIds(args.categoryNames, 'expense') : undefined,
          incomeCategoryIds: args.incomeCategoryNames ? resolveCatIds(args.incomeCategoryNames, 'income') : undefined,
        }, userId)
        return { success: true, message: `อัปเดต wallet "${args.allocationName}" แล้ว`, marker: '[REFRESH:wallets,dashboard]' }
      }

      // ── move_allocation_funds ──────────────────────────────
      case 'move_allocation_funds': {
        const allocs = await this.allocationsSvc.findAll(userId)
        const findAlloc = (name: string) =>
          (allocs as any[]).find((a: any) => a.name.toLowerCase().includes(name?.toLowerCase() ?? ''))

        if (args.action === 'move_in') {
          const to = findAlloc(args.toAllocationName)
          if (!to) return { error: `ไม่พบ wallet "${args.toAllocationName}"` }
          const result = await this.allocationsSvc.moveToAllocation(to.id, userId, args.amount)
          return { success: true, message: `ย้าย ฿${args.amount} จาก unallocated ไป "${to.name}" แล้ว`, ...result, marker: '[REFRESH:wallets,dashboard]' }
        }

        if (args.action === 'transfer') {
          const from = findAlloc(args.fromAllocationName)
          const to = findAlloc(args.toAllocationName)
          if (!from || !to) return { error: 'ไม่พบ wallet ที่ระบุ' }
          await this.allocationsSvc.transferBetweenAllocations(from.id, to.id, userId, args.amount)
          return { success: true, message: `โอน ฿${args.amount} จาก "${from.name}" ไป "${to.name}" แล้ว`, marker: '[REFRESH:wallets,dashboard]' }
        }

        if (args.action === 'unallocate') {
          const from = findAlloc(args.fromAllocationName)
          if (!from) return { error: `ไม่พบ wallet "${args.fromAllocationName}"` }
          await this.allocationsSvc.unallocateFromAllocation(from.id, userId, args.amount)
          return { success: true, message: `คืน ฿${args.amount} จาก "${from.name}" ไป unallocated แล้ว`, marker: '[REFRESH:wallets,dashboard]' }
        }

        return { error: 'action ไม่ถูกต้อง' }
      }

      // ── delete_budget ──────────────────────────────────────
      case 'delete_budget': {
        const month = args.month ?? currentMonth
        const allCats = await this.categoriesSvc.findAll(userId)
        const cat = allCats.find((c: any) =>
          c.name.toLowerCase().includes((args.categoryName ?? '').toLowerCase()),
        )
        if (!cat) return { error: `ไม่พบหมวด "${args.categoryName}"` }
        const budgets = await this.budgetsSvc.findByMonth(userId, month)
        const budget = budgets.find((b: any) => b.categoryId === cat.id)
        if (!budget) return { error: `ไม่พบงบประมาณของ "${cat.name}" เดือน ${month}` }
        await this.budgetsSvc.remove(userId, budget.id)
        return { success: true, message: `ลบงบประมาณ "${cat.name}" เดือน ${month} แล้ว`, marker: '[REFRESH:budget,dashboard]' }
      }

      // ── set_budget_plan ────────────────────────────────────
      case 'set_budget_plan': {
        const month = args.month ?? currentMonth
        const allCats = await this.categoriesSvc.findAll(userId)
        const results: string[] = []

        for (const b of args.budgets ?? []) {
          const cat = allCats.find((c: any) =>
            c.name.toLowerCase().includes(b.categoryName.toLowerCase()),
          )
          if (!cat) { results.push(`ไม่พบหมวด "${b.categoryName}"`); continue }
          await this.budgetsSvc.upsert(userId, { categoryId: cat.id, amount: b.amount, month })
          results.push(`${cat.name}: ฿${b.amount}`)
        }

        return { success: true, month, set: results, marker: '[REFRESH:budget,dashboard]' }
      }

      // ── add_investment ─────────────────────────────────────
      case 'add_investment': {
        const inv = await this.investmentsSvc.create(userId, {
          name: args.name, symbol: args.symbol, type: args.type, note: args.note,
        })
        return { success: true, investmentId: inv.id, message: `เพิ่มกองทุน "${args.name}" แล้ว`, marker: '[REFRESH:investments]' }
      }

      // ── add_investment_transaction ─────────────────────────
      case 'add_investment_transaction': {
        const investments = await this.investmentsSvc.findAll(userId)
        const query = (args.investmentName ?? '').toLowerCase()
        this.logger.log(`[inv_tx] search="${query}" available=${JSON.stringify(investments.map((i: any) => ({ name: i.name, symbol: i.symbol })))}`)
        const inv = investments.find((i: any) =>
          i.name.toLowerCase().includes(query) ||
          (i.symbol && i.symbol.toLowerCase().includes(query))
        )
        if (!inv) return { error: `ไม่พบกองทุน "${args.investmentName}" — available: ${investments.map((i: any) => i.symbol || i.name).join(', ')}` }

        // BE→CE and zone handling both live in one place now — see normalizeOccurredAt.
        const occurredAt = this.normalizeOccurredAt(args.occurredAt, tz)
        this.logger.log(`[inv_tx] found="${inv.name}" id=${inv.id} occurredAt=${occurredAt} args=${JSON.stringify(args)}`)

        await this.investmentsSvc.addTransaction(userId, inv.id, {
          type: args.type,
          amount: args.amount,
          units: args.units,
          navPrice: args.navPrice,
          occurredAt,
          note: args.note,
        })
        return { success: true, message: `บันทึก${args.type === 'buy' ? 'การซื้อ' : args.type === 'sell' ? 'การขาย' : 'เงินปันผล'} ฿${args.amount} ให้ "${inv.name}" แล้ว`, marker: '[REFRESH:investments]' }
      }

      // ── add_tax_deduction ──────────────────────────────────
      case 'add_tax_deduction': {
        const taxYear = args.taxYear > 2500 ? args.taxYear - 543 : args.taxYear
        await this.taxSvc.upsert(userId, {
          taxYear,
          type: args.type,
          name: args.name,
          amount: args.amount,
          note: args.note,
        })
        return { success: true, message: `บันทึกค่าลดหย่อน "${args.name}" ฿${args.amount} ปี ${taxYear} แล้ว`, marker: '[REFRESH:tax]' }
      }

      // ── change_theme ───────────────────────────────────────
      case 'change_theme':
        return { action: 'theme', value: args.theme, marker: `[THEME:${args.theme}]` }

      // ── navigate_to ────────────────────────────────────────
      case 'navigate_to':
        return { action: 'navigate', path: args.path, reason: args.reason, marker: `[NAVIGATE:${args.path}]` }

      default:
        return { error: `Unknown tool: ${name}` }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // System prompt
  // ─────────────────────────────────────────────────────────────
  private buildSystemPrompt(context: Record<string, any>): string {
    const now = new Date()
    const dateStr = now.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const currentYear = now.getFullYear()

    return `คุณเป็น AI ผู้ช่วยการเงินส่วนตัวของ MoneyFlow — ฉลาด เป็นมิตร และทำงานได้อิสระ
วันที่วันนี้: ${dateStr} | เดือนปัจจุบัน: ${currentMonth} | ปีภาษีปัจจุบัน: ${currentYear} (ค.ศ.)
IMPORTANT: ปี ค.ศ. เท่านั้น — taxYear ใช้ ${currentYear} (ไม่ใช่ ${currentYear + 543}), occurredAt ใช้ ${new Date().toISOString().slice(0, 10)} (ไม่ใช่ ${new Date().getFullYear() + 543}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}) ห้ามใช้ พ.ศ. ในทุก field
${context.userName ? `ชื่อ user: ${context.userName}` : ''}

## ความสามารถของคุณ (25 tools)
READ: get_financial_summary, get_transactions, analyze_finances, get_loan_status, get_budget_status, get_portfolio, get_tax_summary, calculate_comprehensive_tax, web_search
WRITE: create/delete_transaction, create/record_payment/delete_loan, create/delete_category, create/update_allocation, move_allocation_funds, set_budget_plan, delete_budget, add_investment, add_investment_transaction, add_tax_deduction
UI: change_theme, navigate_to

## กฎการทำงาน — สำคัญมาก

### WRITE operations (ยกเว้น delete)
1. เรียก tool อ่านข้อมูลที่จำเป็นก่อน (ถ้ายังไม่รู้)
2. อธิบายสิ่งที่จะทำ + รายละเอียดครบ — แล้วรอ user ยืนยัน
3. เมื่อ user ยืนยัน ("ยืนยัน" / "ใช่" / "ok" / "ตกลง") → **ต้อง call tool ทันทีในรอบนั้น** ห้ามตอบว่าทำแล้วโดยไม่ได้ call tool จริง **เด็ดขาด**
4. ถ้าต้องทำหลาย tool ต่อเนื่อง (เช่น add_investment แล้ว add_investment_transaction) → call ทั้งหมดพร้อมกันใน round เดียวเมื่อ user ยืนยัน อย่าแยกเป็นหลาย round
5. **ห้ามใช้คำว่า "บันทึกเรียบร้อย" "สำเร็จ" หรือ claim success ใดๆ โดยไม่มี tool result ยืนยัน** — ถ้า tool return error ต้องบอก user ตรงๆ ห้าม fabricate ผลลัพธ์

### DELETE operations (double confirmation)
1. บอกว่าจะลบอะไร รายละเอียดครบ
2. รอ user พิมพ์ยืนยันรอบแรก
3. เตือนซ้ำ: "การลบถาวร undo ไม่ได้ พิมพ์ 'ลบเลย' เพื่อยืนยัน"
4. รอ user พิมพ์ "ลบเลย" จึง execute

### UI actions (theme/navigate)
- change_theme และ navigate_to ทำได้ทันทีไม่ต้อง confirm
- หลัง navigate_to ให้อธิบายว่าพาไปทำอะไร

### การวิเคราะห์
- ใช้ note/หมายเหตุจากธุรกรรมมาร่วมวิเคราะห์พฤติกรรม
- หาจุดอ่อน เช่น หมวดที่เกินงบบ่อย หนี้นานเกินไป portfolio ไม่ balanced
- แนะนำเป็น actionable steps เสมอ

## สไตล์การตอบ
- ภาษาไทยเป็นหลัก ใช้ภาษาอังกฤษตาม user
- กระชับ ตรงประเด็น emoji เล็กน้อย
- เมื่อ web_search ให้อ้างอิง source
- ถ้า category/wallet ไม่พบ ให้ถาม user แทนการ error`
  }

  private openRouterHeaders() {
    return {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://moneyflow.app',
      'X-Title': 'MoneyFlow',
    }
  }

  private async saveMessage(userId: string, role: string, content: string, imageAnalysis?: Record<string, any>) {
    await this.msgRepo.save(this.msgRepo.create({ userId, role, content, imageAnalysis: imageAnalysis ?? null }))
    await this.msgRepo.manager.query(
      `DELETE FROM chat_messages WHERE user_id=$1 AND id NOT IN (
        SELECT id FROM chat_messages WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2
      )`,
      [userId, this.MAX_HISTORY],
    )
  }

  /**
   * Guard against runaway AI spend: reject a request once the user has burned
   * through their daily budget (THB). Configurable via AI_DAILY_LIMIT_THB;
   * set to 0 to disable. Call this BEFORE any paid model request.
   */
  async assertWithinDailyBudget(userId: string) {
    const capThb = Number(process.env.AI_DAILY_LIMIT_THB ?? 50)
    if (!Number.isFinite(capThb) || capThb <= 0) return
    const row = await this.usageRepo
      .createQueryBuilder('u')
      .select('COALESCE(SUM(u.cost_thb), 0)', 'total')
      .where('u.user_id = :userId', { userId })
      .andWhere("u.created_at >= date_trunc('day', now())")
      .getRawOne<{ total: string }>()
    const spent = Number(row?.total ?? 0)
    if (spent >= capThb) {
      throw new BadRequestException(
        `เกินโควตาการใช้ AI รายวัน (฿${capThb.toFixed(0)}) แล้ว กรุณาลองใหม่ในวันถัดไป`,
      )
    }
  }

  private async saveUsageLog(
    userId: string,
    model: string,
    promptTokens: number,
    completionTokens: number,
    costUsdFromApi: number,
  ) {
    if (promptTokens === 0 && completionTokens === 0) return
    const pricing = this.MODEL_PRICING[model] ?? { input: 0.20, output: 0.60 }
    const costUsd = costUsdFromApi > 0
      ? costUsdFromApi
      : (promptTokens * pricing.input + completionTokens * pricing.output) / 1_000_000
    const costThb = costUsd * this.THB_PER_USD
    await this.usageRepo.save(this.usageRepo.create({
      userId,
      model,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      costUsd,
      costThb,
    }))
  }
}
