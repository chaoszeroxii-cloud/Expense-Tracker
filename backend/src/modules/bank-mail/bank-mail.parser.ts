import { createHash } from 'crypto'

export interface GmailPart {
  mimeType?: string
  filename?: string
  headers?: { name: string; value: string }[]
  body?: { data?: string; size?: number }
  parts?: GmailPart[]
}
export interface GmailMessage { id: string; internalDate: string; payload: GmailPart }
export interface BankMailTransaction {
  bank: 'ktb' | 'scb'
  // Absent on existing transfer imports. Bill payments identify a biller, not a bank account.
  kind?: 'bill_payment'
  type: 'expense' | 'income'
  amount: number
  fee: number
  occurredAt: string
  receivedAt: string
  accountSuffix: string
  counterpartyBank: string
  counterpartySuffix: string
  possibleOwnTransfer: boolean
  referenceHash: string | null
  fingerprint: string
}
export const BANK_MAIL_QUERY = '{from:noreply@krungthai.com from:scbeasynet@scb.co.th} '
  + '{subject:"แจ้งผลการโอนเงินสำเร็จ" subject:"แจ้งผลการโอนเงินพร้อมเพย์สำเร็จ" '
  + 'subject:"แจ้งผลการจ่ายบิลสำเร็จ" '
  + 'subject:"บริการอัตโนมัติแจ้งเตือนการทำธุรกรรม" subject:"คุณได้รับเงินผ่านรายการพร้อมเพย์"} '
  + '-in:spam -in:trash -in:sent -in:drafts -subject:OTP'

export const digest = (value: string) => createHash('sha256').update(value).digest('hex')
const header = (part: GmailPart, name: string) =>
  part.headers?.find(h => h.name.toLowerCase() === name)?.value?.trim() ?? ''

// Parse bounded text only. Never render mail HTML, fetch URLs, or load attachments.
export function mailText(part: GmailPart): string {
  let bytes = 0, count = 0
  const visit = (p: GmailPart, depth: number): string => {
    if (++count > 100 || depth > 10) throw new Error('mail_too_large')
    if (p.filename) return ''
    if (p.parts?.length) {
      if (p.mimeType === 'multipart/alternative') {
        const preferred = p.parts.find(x => x.mimeType === 'text/plain') ?? p.parts.find(x => x.mimeType === 'text/html')
        if (preferred) return visit(preferred, depth + 1)
      }
      return p.parts.map(child => visit(child, depth + 1)).join('\n')
    }
    if (!['text/plain', 'text/html'].includes(p.mimeType) || !p.body?.data) return ''
    if (p.body.data.length > 350_000) throw new Error('mail_too_large')
    const decoded = Buffer.from(p.body.data, 'base64url').toString('utf8')
    bytes += Buffer.byteLength(decoded)
    if (bytes > 256_000) throw new Error('mail_too_large')
    if (p.mimeType === 'text/plain') return decoded
    return decoded.replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
      .replace(/<(?:br\b[^>]*|\/(?:p|div|tr|dd|li))>/gi, '\n')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&(#x[0-9a-f]+|#\d+|nbsp|amp|lt|gt|quot|apos);/gi, (whole, entity: string) => {
        const named: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
        if (named[entity.toLowerCase()]) return named[entity.toLowerCase()]
        const code = entity[1]?.toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1))
        return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole
      })
  }
  return visit(part, 0).replace(/[\u200b-\u200f\u202a-\u202e\ufeff]/g, '')
    .replace(/[^\S\r\n]+/g, ' ').split(/\r?\n/).map(s => s.trim()).filter(Boolean).join('\n')
}

function authenticated(part: GmailPart, domain: string): boolean {
  const auth = header(part, 'authentication-results')
  if (!/^mx\.google\.com\s*;/i.test(auth)) return false
  const escaped = domain.replace(/\./g, '\\.')
  return new RegExp(`(?:^|;)\\s*dkim=pass\\b[^;]*\\bheader\\.(?:i=@|d=)${escaped}(?:\\s|;|$)`, 'i').test(auth)
    && new RegExp(`(?:^|;)\\s*dmarc=pass\\b[^;]*\\bheader\\.from=${escaped}(?:\\s|;|$)`, 'i').test(auth)
}
function single(text: string, regex: RegExp): RegExpMatchArray {
  const matches = [...text.matchAll(new RegExp(regex.source, 'g' + (regex.ignoreCase ? 'i' : '')))]
  if (matches.length !== 1) throw new Error('ambiguous_template')
  return matches[0]
}
function amount(value: string): number {
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{2})?$/.test(value)) throw new Error('invalid_amount')
  const n = Number(value.replace(/,/g, ''))
  if (!Number.isFinite(n) || n < 0 || n > 999_999_999.99) throw new Error('invalid_amount')
  return n
}
function suffix(value: string): string {
  const digits = value.replace(/\D/g, '')
  return digits.length >= 4 ? digits.slice(-4) : ''
}
function thaiDate(day: string, month: string, year: string, h: string, m: string, s = '0'): string {
  const y = Number(year) > 2400 ? Number(year) - 543 : Number(year)
  const date = `${y}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${h.padStart(2, '0')}:${m.padStart(2, '0')}:${s.padStart(2, '0')}`
  const check = new Date(date + 'Z')
  if (y < 2000 || y > 2100 || !Number.isFinite(check.getTime()) || check.toISOString().slice(0, 19) !== date)
    throw new Error('invalid_date')
  return new Date(date + '+07:00').toISOString()
}
function namedDate(value: string): string {
  const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
  const m = value.match(/^(\d{1,2}) (\S+) (\d{4}) (?:ณ|-) (\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (!m || !months.includes(m[2])) throw new Error('invalid_date')
  return thaiDate(m[1], String(months.indexOf(m[2]) + 1), m[3], m[4], m[5], m[6])
}
const person = (name: string) => name.replace(/^(?:นาย|นางสาว|นาง|น\.ส\.|คุณ)\s*/, '').replace(/\s+/g, '')

export function parseBankMail(message: GmailMessage): { transaction?: BankMailTransaction; reason?: string } {
  const part = message.payload, from = header(part, 'from'), subject = header(part, 'subject').replace(/\s+/g, ' ')
  const address = (from.match(/<([^<>]+)>$/)?.[1] ?? from).toLowerCase()
  const bank = address === 'noreply@krungthai.com' ? 'ktb' : address === 'scbeasynet@scb.co.th' ? 'scb' : null
  if (!bank) return { reason: 'unsupported_sender' }
  if (!authenticated(part, bank === 'ktb' ? 'krungthai.com' : 'scb.co.th')) return { reason: 'unverified_sender' }
  try {
    const text = mailText(part)
    const receivedAt = new Date(Number(message.internalDate)).toISOString()
    let type: 'income' | 'expense' = 'expense', sum: number, fee = 0, occurredAt: string
    let kind: BankMailTransaction['kind']
    let accountSuffix = '', counterpartyBank = '', counterpartySuffix = '', possibleOwnTransfer = false, referenceHash: string = null
    if (bank === 'ktb') {
      const isBill = subject === 'แจ้งผลการจ่ายบิลสำเร็จ'
      if (isBill) {
        single(text, /คุณได้จ่ายบิลผ่าน Krungthai NEXT สำเร็จ/)
        single(text, /ไปยังผู้ให้บริการ[^\S\r\n]*:[^\S\r\n]*([^\s][^\n]*)/)
        kind = 'bill_payment'
      } else {
        if (!/^แจ้งผลการโอนเงิน(?:พร้อมเพย์)?สำเร็จ$/.test(subject)) return { reason: 'unsupported_template' }
        if (!/คุณได้ทำรายการโอนเงิน(?:พร้อมเพย์)?ผ่าน Krungthai NEXT สำเร็จ/.test(text)) throw new Error('unsupported_template')
      }
      const d = single(text, /วันที่ทำรายการ\s*:\s*(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})/)
      occurredAt = thaiDate(d[1], d[2], d[3], d[4], d[5], d[6])
      sum = amount(single(text, isBill ? /จำนวนเงินที่ชำระ\s*:\s*([\d,.]+) บาท/ : /จำนวนเงิน\s*:\s*([\d,.]+) บาท/)[1])
      fee = amount(single(text, /ค่าธรรมเนียม\s*:\s*([\d,.]+) บาท/)[1])
      referenceHash = digest('ktb:' + single(text, /หมายเลขอ้างอิง\s*:\s*([A-Za-z0-9]{8,80})(?:\n|$)/)[1])
      const origin = single(text, /จากบัญชี\s*:\s*([^\n]+)\nเลขบัญชี\s*:\s*กรุงไทย ([Xx\d -]+)/)
      accountSuffix = suffix(origin[2])
      if (!isBill) {
        const destination = single(text, /ไปยังบัญชี(?:พร้อมเพย์)?\s*:\s*([^\n]+)\n(?:เลขบัญชี|หมายเลขพร้อมเพย์)\s*:\s*([^\n]+)/)
        const bankNames: [RegExp, string][] = [[/กรุงไทย/, 'ktb'], [/ไทยพาณิชย์/, 'scb']]
        counterpartyBank = bankNames.find(([pattern]) => pattern.test(destination[2]))?.[1] ?? ''
        counterpartySuffix = suffix(destination[2])
        possibleOwnTransfer = person(origin[1]).length >= 4 && person(origin[1]) === person(destination[1])
      }
    } else if (/^SCB Easy App: คุณได้รับเงินผ่านรายการพร้อมเพย์$/.test(subject)) {
      type = 'income'
      sum = amount(single(text, /จำนวน \(บาท\)\s*:\s*([\d,.]+)(?:\n|$)/)[1])
      occurredAt = namedDate(single(text, /วัน\/เวลา\s*:\s*([^\n]+)/)[1])
      accountSuffix = suffix(single(text, /เข้าบัญชี\s*:\s*([Xx\d -]+)/)[1])
      const source = single(text, /จาก\s*:\s*([A-Za-z]+)\s*\/\s*([Xx\d -]+)/)
      counterpartyBank = ({ KTB: 'ktb', SCB: 'scb' })[source[1].toUpperCase()] ?? ''
      counterpartySuffix = suffix(source[2])
    } else if (subject === 'แจ้งเตือนจากแอป SCB Easy: บริการอัตโนมัติแจ้งเตือนการทำธุรกรรม') {
      single(text, /ประเภทของรายการ:\s*โอนเงินพร้อมเพย์\s*(?:\n|$)/)
      sum = amount(single(text, /จำนวนเงิน\s+([\d,.]+) บาท/)[1])
      occurredAt = namedDate(single(text, /วันและเวลาการทำรายการ:\s*([^\n]+)/)[1])
      accountSuffix = suffix(single(text, /จาก ธนาคารไทยพาณิชย์ เบอร์บัญชี\s+([Xx\d -]+)/)[1])
      const target = text.match(/ไปยัง\s+([^\n]+)/)?.[1] ?? ''
      counterpartyBank = /กรุงไทย/.test(target) ? 'ktb' : /ไทยพาณิชย์/.test(target) ? 'scb' : ''
      counterpartySuffix = suffix(target)
    } else return { reason: 'unsupported_template' }
    if (bank === 'scb' && /ค่าธรรมเนียม/.test(text)) {
      fee = amount(single(text, /ค่าธรรมเนียม\s*:?\s*([\d,.]+) บาท/)[1])
    }
    if (!sum || !accountSuffix || Date.parse(occurredAt) > Date.parse(receivedAt) + 600_000) throw new Error('invalid_transaction')
    // Preserve the fingerprints of previously imported transfer templates.
    const fingerprint = digest(JSON.stringify([bank, type, sum, occurredAt, accountSuffix, counterpartyBank, counterpartySuffix, ...(kind ? [kind] : [])]))
    return { transaction: { bank, ...(kind ? { kind } : {}), type, amount: sum, fee, occurredAt, receivedAt, accountSuffix,
      counterpartyBank, counterpartySuffix, possibleOwnTransfer, referenceHash, fingerprint } }
  } catch (error) {
    const allowed = ['mail_too_large', 'ambiguous_template', 'invalid_amount', 'invalid_date', 'unsupported_template', 'invalid_transaction']
    return { reason: allowed.includes(error.message) ? error.message : 'unsupported_template' }
  }
}
