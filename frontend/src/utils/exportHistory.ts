import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import type { Expense } from '../types'

export type ExportFormat = 'csv' | 'txt' | 'pdf'

interface ExportMeta {
  /** Inclusive month range, YYYY-MM */
  from: string
  to: string
  lang: 'th' | 'en'
}

// ── Shared helpers ──────────────────────────────────────────────
const L = {
  th: {
    title: 'ประวัติรายรับ-รายจ่าย',
    range: 'ช่วงเวลา',
    date: 'วันที่', type: 'ประเภท', category: 'หมวดหมู่',
    note: 'รายละเอียด', wallet: 'กระเป๋าเงิน', amount: 'จำนวนเงิน (บาท)',
    income: 'รายรับ', expense: 'รายจ่าย',
    totalIncome: 'รวมรายรับ', totalExpense: 'รวมรายจ่าย', net: 'คงเหลือสุทธิ',
    count: 'จำนวนรายการ', generatedAt: 'สร้างเมื่อ',
    empty: 'ไม่มีรายการในช่วงเวลานี้',
  },
  en: {
    title: 'Income & Expense History',
    range: 'Period',
    date: 'Date', type: 'Type', category: 'Category',
    note: 'Note', wallet: 'Wallet', amount: 'Amount (THB)',
    income: 'Income', expense: 'Expense',
    totalIncome: 'Total Income', totalExpense: 'Total Expense', net: 'Net',
    count: 'Transactions', generatedAt: 'Generated at',
    empty: 'No transactions in this period',
  },
} as const

function fmtAmount(n: number): string {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(iso: string, lang: 'th' | 'en'): string {
  return new Date(iso).toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-US', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

function monthLabel(m: string, lang: 'th' | 'en'): string {
  return new Date(m + '-01T00:00:00').toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-US', {
    month: 'long', year: 'numeric',
  })
}

function totals(rows: Expense[]) {
  const income = rows.filter(r => r.type === 'income').reduce((s, r) => s + Number(r.amount), 0)
  const expense = rows.filter(r => r.type === 'expense').reduce((s, r) => s + Number(r.amount), 0)
  return { income, expense, net: income - expense }
}

/** Newest-first, matching the History list ordering */
function sortRows(rows: Expense[]): Expense[] {
  return [...rows].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
}

function fileBase(meta: ExportMeta): string {
  return meta.from === meta.to ? `history_${meta.from}` : `history_${meta.from}_to_${meta.to}`
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// ── CSV ─────────────────────────────────────────────────────────
function csvCell(v: string | number): string {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function exportCsv(rows: Expense[], meta: ExportMeta) {
  const t = L[meta.lang]
  const sorted = sortRows(rows)
  const head = [t.date, t.type, t.category, t.note, t.wallet, t.amount]
  const lines = sorted.map(r => [
    fmtDate(r.occurredAt, meta.lang),
    r.type === 'income' ? t.income : t.expense,
    r.category?.name ?? '',
    r.note ?? '',
    r.allocation?.name ?? '',
    `${r.type === 'expense' ? '-' : ''}${fmtAmount(Number(r.amount))}`,
  ].map(csvCell).join(','))

  const sum = totals(rows)
  const summaryRow = (label: string, amount: number) =>
    [label, '', '', '', '', fmtAmount(amount)].map(csvCell).join(',')
  const summary = [
    '',
    summaryRow(t.totalIncome, sum.income),
    summaryRow(t.totalExpense, sum.expense),
    summaryRow(t.net, sum.net),
  ]

  // UTF-8 BOM so Excel reads Thai correctly
  const content = '﻿' + [head.map(csvCell).join(','), ...lines, ...summary].join('\r\n')
  download(new Blob([content], { type: 'text/csv;charset=utf-8' }), `${fileBase(meta)}.csv`)
}

// ── TXT (human-readable) ────────────────────────────────────────
function exportTxt(rows: Expense[], meta: ExportMeta) {
  const t = L[meta.lang]
  const sorted = sortRows(rows)
  const rangeText = meta.from === meta.to
    ? monthLabel(meta.from, meta.lang)
    : `${monthLabel(meta.from, meta.lang)} — ${monthLabel(meta.to, meta.lang)}`

  const out: string[] = []
  out.push('═'.repeat(52))
  out.push(`  ${t.title}`)
  out.push(`  ${t.range}: ${rangeText}`)
  out.push('═'.repeat(52))
  out.push('')

  if (sorted.length === 0) {
    out.push(`  ${t.empty}`)
  } else {
    // Group by day
    const byDay = sorted.reduce<Record<string, Expense[]>>((acc, r) => {
      const day = r.occurredAt.slice(0, 10)
      ;(acc[day] ??= []).push(r)
      return acc
    }, {})

    for (const day of Object.keys(byDay).sort((a, b) => b.localeCompare(a))) {
      out.push(`▸ ${fmtDate(day + 'T00:00:00', meta.lang)}`)
      for (const r of byDay[day]) {
        const sign = r.type === 'expense' ? '-' : '+'
        const amount = `${sign}${fmtAmount(Number(r.amount))} ฿`.padStart(16)
        const cat = r.category?.name ?? '—'
        const extras = [r.allocation?.name, r.note].filter(Boolean).join(' · ')
        out.push(`    ${amount}  ${cat}${extras ? `  (${extras})` : ''}`)
      }
      out.push('')
    }
  }

  const sum = totals(rows)
  out.push('─'.repeat(52))
  out.push(`  ${t.count.padEnd(16)}: ${rows.length}`)
  out.push(`  ${t.totalIncome.padEnd(16)}: +${fmtAmount(sum.income)} ฿`)
  out.push(`  ${t.totalExpense.padEnd(16)}: -${fmtAmount(sum.expense)} ฿`)
  out.push(`  ${t.net.padEnd(16)}: ${sum.net >= 0 ? '+' : '-'}${fmtAmount(Math.abs(sum.net))} ฿`)
  out.push('─'.repeat(52))
  out.push('')
  out.push(`${t.generatedAt}: ${new Date().toLocaleString(meta.lang === 'th' ? 'th-TH' : 'en-US')}`)

  download(new Blob(['﻿' + out.join('\n')], { type: 'text/plain;charset=utf-8' }), `${fileBase(meta)}.txt`)
}

// ── PDF (render styled HTML → canvas → PDF, so Thai renders) ─────
async function exportPdf(rows: Expense[], meta: ExportMeta) {
  const t = L[meta.lang]
  const sorted = sortRows(rows)
  const sum = totals(rows)
  const rangeText = meta.from === meta.to
    ? monthLabel(meta.from, meta.lang)
    : `${monthLabel(meta.from, meta.lang)} — ${monthLabel(meta.to, meta.lang)}`

  const esc = (s: string) =>
    String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const bodyRows = sorted.length === 0
    ? `<tr><td colspan="6" style="text-align:center;padding:24px;color:#94a3b8">${t.empty}</td></tr>`
    : sorted.map(r => {
        const isExp = r.type === 'expense'
        return `<tr>
          <td>${fmtDate(r.occurredAt, meta.lang)}</td>
          <td><span style="color:${isExp ? '#e11d48' : '#059669'};font-weight:600">${isExp ? t.expense : t.income}</span></td>
          <td>${esc(r.category?.name ?? '')}</td>
          <td style="color:#64748b">${esc(r.note ?? '')}</td>
          <td style="color:#64748b">${esc(r.allocation?.name ?? '')}</td>
          <td style="text-align:right;color:${isExp ? '#e11d48' : '#059669'};font-weight:600;white-space:nowrap">${isExp ? '-' : '+'}${fmtAmount(Number(r.amount))}</td>
        </tr>`
      }).join('')

  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-9999px;top:0;width:760px;background:#fff;'
  host.innerHTML = `
    <div style="font-family:'Sarabun','Segoe UI',system-ui,sans-serif;color:#0f172a;padding:32px;width:760px;box-sizing:border-box">
      <div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #6366f1;padding-bottom:12px;margin-bottom:16px">
        <div>
          <div style="font-size:22px;font-weight:800">${t.title}</div>
          <div style="font-size:13px;color:#64748b;margin-top:4px">${t.range}: ${rangeText}</div>
        </div>
        <div style="font-size:11px;color:#94a3b8;text-align:right">${t.generatedAt}<br>${new Date().toLocaleString(meta.lang === 'th' ? 'th-TH' : 'en-US')}</div>
      </div>

      <div style="display:flex;gap:12px;margin-bottom:18px">
        <div style="flex:1;background:#ecfdf5;border-radius:10px;padding:10px 14px">
          <div style="font-size:11px;color:#059669">${t.totalIncome}</div>
          <div style="font-size:17px;font-weight:700;color:#059669">+${fmtAmount(sum.income)} ฿</div>
        </div>
        <div style="flex:1;background:#fef2f2;border-radius:10px;padding:10px 14px">
          <div style="font-size:11px;color:#e11d48">${t.totalExpense}</div>
          <div style="font-size:17px;font-weight:700;color:#e11d48">-${fmtAmount(sum.expense)} ฿</div>
        </div>
        <div style="flex:1;background:#eef2ff;border-radius:10px;padding:10px 14px">
          <div style="font-size:11px;color:#4f46e5">${t.net}</div>
          <div style="font-size:17px;font-weight:700;color:#4f46e5">${sum.net >= 0 ? '+' : '-'}${fmtAmount(Math.abs(sum.net))} ฿</div>
        </div>
      </div>

      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead>
          <tr style="background:#f1f5f9;text-align:left">
            <th style="padding:8px 10px">${t.date}</th>
            <th style="padding:8px 10px">${t.type}</th>
            <th style="padding:8px 10px">${t.category}</th>
            <th style="padding:8px 10px">${t.note}</th>
            <th style="padding:8px 10px">${t.wallet}</th>
            <th style="padding:8px 10px;text-align:right">${t.amount}</th>
          </tr>
        </thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>`

  // border styling for tbody cells
  const style = document.createElement('style')
  style.textContent = '#__pdf_export td{padding:7px 10px;border-bottom:1px solid #e2e8f0}'
  host.id = '__pdf_export'
  document.body.appendChild(host)
  document.head.appendChild(style)

  try {
    const canvas = await html2canvas(host.firstElementChild as HTMLElement, {
      scale: 2, backgroundColor: '#ffffff',
    })
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
    const pageW = pdf.internal.pageSize.getWidth()
    const pageH = pdf.internal.pageSize.getHeight()
    const margin = 24
    const imgW = pageW - margin * 2
    const imgH = (canvas.height * imgW) / canvas.width

    // Slice tall canvas across pages
    if (imgH <= pageH - margin * 2) {
      pdf.addImage(canvas, 'PNG', margin, margin, imgW, imgH)
    } else {
      const pageContentH = pageH - margin * 2
      const sliceH = (pageContentH * canvas.width) / imgW
      let y = 0
      let first = true
      while (y < canvas.height) {
        const h = Math.min(sliceH, canvas.height - y)
        const slice = document.createElement('canvas')
        slice.width = canvas.width
        slice.height = h
        slice.getContext('2d')!.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h)
        if (!first) pdf.addPage()
        pdf.addImage(slice, 'PNG', margin, margin, imgW, (h * imgW) / canvas.width)
        first = false
        y += h
      }
    }
    pdf.save(`${fileBase(meta)}.pdf`)
  } finally {
    host.remove()
    style.remove()
  }
}

// ── Public entry ────────────────────────────────────────────────
export async function exportHistory(format: ExportFormat, rows: Expense[], meta: ExportMeta) {
  if (format === 'csv') return exportCsv(rows, meta)
  if (format === 'txt') return exportTxt(rows, meta)
  return exportPdf(rows, meta)
}
