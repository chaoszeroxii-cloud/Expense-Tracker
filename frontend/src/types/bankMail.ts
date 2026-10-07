export interface BankMailSettings {
  autoImport: boolean
  expenseCategoryId: string | null
  incomeCategoryId: string | null
  ownAccounts: string[]
}
export interface BankMailStatus {
  configured: boolean
  connected: boolean
  gmailAddress: string | null
  settings: BankMailSettings
  lastSyncedAt: string | null
  lastError: string | null
  skipped: number
  pending: number
  syncing: boolean
}
export interface BankMailSyncSummary {
  matched: number
  existing: number
  parsed: number
  skipped: number
  skipReasons: Record<string, number>
}
export interface BankMailSyncResult {
  busy: boolean
  continued?: boolean
  summary?: BankMailSyncSummary
}
export interface BankMailEntry {
  id: string
  status: 'pending' | 'saved' | 'ignored'
  reason: string | null
  expenseId: string | null
  categoryHint?: {
    categoryId: string | null
    code: string | null
    issue: 'memo_code_unknown' | 'memo_code_multiple' | 'memo_code_type_mismatch' | null
  } | null
  transaction: {
    bank: 'ktb' | 'scb'
    kind?: 'bill_payment'
    memo?: string
    type: 'expense' | 'income'
    amount: number
    fee: number
    occurredAt: string
    receivedAt: string
    accountSuffix: string
    counterpartyBank: string
    counterpartySuffix: string
    possibleOwnTransfer: boolean
  }
}
