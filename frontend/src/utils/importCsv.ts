/** Small RFC-4180 reader. Data is never evaluated; malformed quotes and oversized input fail closed. */
export function readCsv(text: string): string[][] {
  if (text.length > 1_000_000) throw new Error('CSV is too large')
  text = text.replace(/^\uFEFF/, '')
  const rows: string[][] = []
  let row: string[] = [],
    cell = '',
    quoted = false,
    closed = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          quoted = false
          closed = true
        }
      } else cell += char
    } else if (char === ',' || char === '\n' || char === '\r') {
      row.push(cell)
      cell = ''
      closed = false
      if (char !== ',') {
        if (char === '\r' && text[i + 1] === '\n') i++
        if (row.some((v) => v.trim())) rows.push(row)
        row = []
      }
    } else if (char === '"') {
      if (cell || closed) throw new Error('Invalid CSV quote')
      quoted = true
    } else {
      if (closed && char.trim()) throw new Error('Invalid CSV quote')
      if (!closed) cell += char
    }
    if (rows.length > 101) throw new Error('Maximum 100 entries')
  }
  if (quoted) throw new Error('Unclosed CSV quote')
  row.push(cell)
  if (row.some((v) => v.trim())) rows.push(row)
  if (
    rows.length < 2 ||
    rows.length > 101 ||
    rows[0].length > 30 ||
    rows.some((r) => r.length !== rows[0].length)
  )
    throw new Error('Invalid CSV shape')
  return rows
}
export function importDate(value: string, format: string): string {
  let year: number, month: number, day: number
  const match = value
    .trim()
    .match(format === 'iso' ? /^(\d{4})-(\d{2})-(\d{2})$/ : /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!match) return ''
  if (format === 'iso') {
    year = Number(match[1])
    month = Number(match[2])
    day = Number(match[3])
  } else {
    year = Number(match[3]) - (format === 'thai' ? 543 : 0)
    month = Number(match[2])
    day = Number(match[1])
  }
  const date = new Date(Date.UTC(year, month - 1, day))
  if (year < 1900 || year > 9999 || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day)
    return ''
  return date.toISOString().slice(0, 10)
}
