import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { DataSource, EntityManager, In, Not } from 'typeorm'
import { randomBytes, randomUUID } from 'crypto'
import { BankMailConnection, BankMailEntry, emptyMailSettings } from './bank-mail.entity'
import { BankMailListDto, BankMailSaveDto, BankMailSettingsDto } from './bank-mail.dto'
import { BankMailTransaction, digest, parseBankMail } from './bank-mail.parser'
import { openMailSecret, sealMailSecret } from './bank-mail.crypto'
import { GmailFailure, GmailProvider } from './gmail.provider'
import { Category } from '../categories/category.entity'
import { ExpensesService } from '../expenses/expenses.service'
import { lockLedger } from '../../common/ledger-lock.util'

@Injectable()
export class BankMailService {
  private readonly logger = new Logger(BankMailService.name)
  constructor(private readonly db: DataSource, private readonly gmail: GmailProvider, private readonly expenses: ExpensesService) {}
  private repo() { return this.db.getRepository(BankMailConnection) }
  private ready() { if (!this.gmail.configured()) throw new ServiceUnavailableException('mail_not_configured') }

  async status(userId: string) {
    const row = await this.repo().findOneBy({ userId })
    const pending = await this.db.getRepository(BankMailEntry).countBy({ userId, status: 'pending' })
    return { configured: this.gmail.configured(), connected: !!row?.refreshCipher,
      gmailAddress: row?.gmailAddress ?? null, settings: row?.settings ?? emptyMailSettings(),
      lastSyncedAt: row?.lastSyncedAt ?? null, lastError: row?.lastError ?? null,
      skipped: row?.lastSkipped ?? 0, pending, syncing: !!row?.leaseUntil && row.leaseUntil.getTime() > Date.now() }
  }
  async connect(userId: string) {
    this.ready()
    const state = randomBytes(32).toString('base64url'), verifier = randomBytes(32).toString('base64url')
    await this.db.transaction(async em => {
      await lockLedger(em, userId)
      let row = await em.findOneBy(BankMailConnection, { userId })
      if (!row) row = em.create(BankMailConnection, { userId, settings: emptyMailSettings() })
      Object.assign(row, { stateHash: digest(state), oauthAttemptId: randomUUID(), verifierCipher: sealMailSecret(verifier, userId + ':pkce'),
        stateExpiresAt: new Date(Date.now() + 10 * 60_000) })
      await em.save(row)
    })
    return { url: this.gmail.authorizationUrl(state, verifier) }
  }
  async callback(userId: string, state: unknown, code: unknown): Promise<boolean> {
    this.ready()
    if (typeof state !== 'string' || !/^[\w-]{43}$/.test(state)) return false
    // Consume before the network exchange. A failure requires a fresh user-initiated flow.
    const connection = await this.db.transaction(async em => {
      const row = await em.findOne(BankMailConnection, { where: { userId, stateHash: digest(state) }, lock: { mode: 'pessimistic_write' } })
      if (!row || !row.stateExpiresAt || row.stateExpiresAt.getTime() < Date.now()) return null
      const verifier = row.verifierCipher
      row.stateHash = null; row.verifierCipher = null; row.stateExpiresAt = null
      await em.save(row)
      return { userId: row.userId, verifier, attemptId: row.oauthAttemptId }
    })
    if (!connection || typeof code !== 'string' || !code.length || code.length > 4096) return false
    try {
      const result = await this.gmail.exchange(code, openMailSecret(connection.verifier, connection.userId + ':pkce'))
      // Serialize against disconnect, reset and other connects. Never recreate a deleted connection.
      const saved = await this.db.transaction(async em => {
        await lockLedger(em, connection.userId)
        const row = await em.findOne(BankMailConnection, { where: { userId: connection.userId }, lock: { mode: 'pessimistic_write' } })
        if (!row || row.oauthAttemptId !== connection.attemptId || row.stateHash) return false
        Object.assign(row, { gmailAddress: result.address, refreshCipher: sealMailSecret(result.refreshToken, row.userId + ':refresh'),
          settings: { ...row.settings, autoImport: false }, autoImportSince: null, lastError: null,
          lastSyncedAt: null, scanAfter: new Date(Date.now() - 7 * 86400_000), scanBefore: null,
          pageToken: null, leaseId: null, leaseUntil: null, lastSkipped: 0, lastAttemptAt: null, oauthAttemptId: null })
        await em.save(row)
        return true
      })
      // Do not revoke a superseded grant: Google may share it with a newer connect.
      this.logger.log(saved ? 'Gmail connection completed' : 'Gmail connection cancelled')
      return saved
    } catch { this.logger.warn('Gmail connection failed'); return false }
  }
  async disconnect(userId: string) {
    const cipher = await this.db.transaction(async em => {
      await lockLedger(em, userId)
      const row = await em.findOneBy(BankMailConnection, { userId })
      await em.delete(BankMailConnection, { userId })
      return row?.refreshCipher
    })
    let revoked = !cipher
    if (cipher) { try { revoked = await this.gmail.revoke(openMailSecret(cipher, userId + ':refresh')) } catch { /* local disconnect still succeeds */ } }
    this.logger.log('Gmail connection removed')
    return { ok: true, revoked }
  }
  async settings(userId: string, dto: BankMailSettingsDto) {
    return this.db.transaction(async em => {
      await lockLedger(em, userId)
      const row = await em.findOne(BankMailConnection, { where: { userId }, lock: { mode: 'pessimistic_write' } })
      if (!row?.refreshCipher) throw new BadRequestException('mail_not_connected')
      for (const type of ['expense', 'income'] as const) {
        const id = dto[type + 'CategoryId']
        if (id && !await em.exists(Category, { where: { id, userId, type } })) throw new BadRequestException('mail_category_invalid')
        if (dto.autoImport && !id) throw new BadRequestException('mail_category_required')
      }
      if (dto.autoImport && !dto.ownAccounts.length) throw new BadRequestException('mail_accounts_required')
      if (dto.autoImport && !row.settings.autoImport) row.autoImportSince = new Date()
      if (!dto.autoImport) row.autoImportSince = null
      row.settings = { autoImport: dto.autoImport, expenseCategoryId: dto.expenseCategoryId ?? null,
        incomeCategoryId: dto.incomeCategoryId ?? null, ownAccounts: dto.ownAccounts }
      await em.save(row)
      return { ok: true }
    })
  }
  async list(userId: string, query: BankMailListDto) {
    const [rows, total] = await this.db.getRepository(BankMailEntry).findAndCount({
      where: { userId, status: query.status ?? 'pending' }, take: 20, skip: query.offset ?? 0,
      order: { createdAt: 'DESC', id: 'DESC' },
    })
    return { rows: rows.map(row => this.entryView(row)), total }
  }
  private entryView(row: BankMailEntry) {
    const { referenceHash: _reference, fingerprint: _fingerprint, ...transaction } = row.transaction
    return { id: row.id, transaction, status: row.status, reason: row.reason, expenseId: row.expenseId }
  }
  private async duplicate(em: EntityManager, userId: string, t: BankMailTransaction, excludeId?: string) {
    const previous = await em.findOne(BankMailEntry, { where: {
      userId, fingerprint: t.fingerprint, status: In(['pending', 'saved']), ...(excludeId ? { id: Not(excludeId) } : {}),
    } })
    if (previous) return true
    // Manual entries on the same local day may already represent this transfer/payment.
    const date = new Date(Date.parse(t.occurredAt) + 7 * 3600_000).toISOString().slice(0, 10)
    const matches = await em.query(`SELECT id FROM expenses WHERE user_id=$1 AND type=$2 AND amount=$3
      AND occurred_at >= ($4::date::timestamp AT TIME ZONE 'Asia/Bangkok')
      AND occurred_at < (($4::date+1)::timestamp AT TIME ZONE 'Asia/Bangkok') LIMIT 1`,
      [userId, t.type, Math.round((t.amount + t.fee) * 100) / 100, date])
    return matches.length > 0
  }
  private async saveEntry(em: EntityManager, row: BankMailEntry, categoryId: string, type: 'expense' | 'income') {
    const t = row.transaction
    const source = `${t.bank.toUpperCase()} • ${t.accountSuffix} • Gmail${t.fee ? ` • fee ${t.fee.toFixed(2)}` : ''}`
    const expense = await this.expenses.createInTransaction({
      amount: Math.round((t.amount + t.fee) * 100) / 100, type, categoryId,
      occurredAt: t.occurredAt, clientKey: row.id,
      note: t.memo ? `${t.memo}\n${source}` : source,
    }, row.userId, em)
    row.expenseId = expense.id; row.status = 'saved'; row.reason = null
    // Keep the source fingerprint stable for deduplication while displaying the
    // direction the user actually chose for the recorded ledger entry.
    row.transaction = { ...t, type }
    await em.save(row)
  }
  async save(userId: string, id: string, dto: BankMailSaveDto) {
    return this.db.transaction(async em => {
      await lockLedger(em, userId)
      const row = await em.findOneBy(BankMailEntry, { id, userId })
      if (!row) throw new NotFoundException('mail_entry_not_found')
      if (row.status === 'saved') return this.entryView(row)
      if (row.status !== 'pending') throw new ConflictException('mail_entry_resolved')
      if (await this.duplicate(em, userId, { ...row.transaction, type: dto.type }, row.id) && !dto.allowDuplicate) throw new ConflictException('mail_duplicate')
      await this.saveEntry(em, row, dto.categoryId, dto.type)
      return this.entryView(row)
    })
  }
  async ignore(userId: string, id: string) {
    return this.db.transaction(async em => {
      await lockLedger(em, userId)
      const row = await em.findOneBy(BankMailEntry, { id, userId })
      if (!row) throw new NotFoundException('mail_entry_not_found')
      if (row.status === 'saved') throw new ConflictException('mail_entry_resolved')
      row.status = 'ignored'; await em.save(row)
      return { ok: true }
    })
  }
  private async ingest(userId: string, leaseId: string, sourceKey: string, t: BankMailTransaction) {
    await this.db.transaction(async em => {
      await lockLedger(em, userId)
      const connection = await em.findOne(BankMailConnection, { where: { userId }, lock: { mode: 'pessimistic_write' } })
      if (!connection?.refreshCipher || connection.leaseId !== leaseId || connection.leaseUntil?.getTime() < Date.now()) throw new GmailFailure('sync_cancelled')
      const exists = await em.findOne(BankMailEntry, { where: [
        { userId, sourceKey }, ...(t.referenceHash ? [{ userId, referenceHash: t.referenceHash }] : []),
      ] })
      if (exists) return
      const own = t.possibleOwnTransfer || connection.settings.ownAccounts.some(value => {
        const [bank, tail] = value.split(':')
        return tail === t.counterpartySuffix && (!t.counterpartyBank || ['promptpay', 'other', t.counterpartyBank].includes(bank))
      })
      const categoryId = connection.settings[t.type + 'CategoryId']
      let reason = own ? 'possible_transfer' : t.fee ? 'fee_review'
        : (!t.counterpartySuffix && t.kind !== 'bill_payment') || !connection.settings.ownAccounts.includes(`${t.bank}:${t.accountSuffix}`) ? 'account_required'
        : await this.duplicate(em, userId, t) ? 'possible_duplicate'
        : !connection.autoImportSince || Date.parse(t.receivedAt) < connection.autoImportSince.getTime() ? 'review_required' : null
      const categoryValid = categoryId && await em.exists(Category, { where: { id: categoryId, userId, type: t.type } })
      if (!categoryValid && !reason) reason = 'category_required'
      const row = await em.save(BankMailEntry, em.create(BankMailEntry, {
        userId, sourceKey, referenceHash: t.referenceHash, fingerprint: t.fingerprint, transaction: t,
        status: 'pending', reason: reason ?? (!connection.settings.autoImport ? 'review_required' : null),
      }))
      if (connection.settings.autoImport && categoryValid && !reason) await this.saveEntry(em, row, categoryId, t.type)
    })
  }
  async sync(userId: string) {
    this.ready()
    const leaseId = randomUUID()
    const claim = await this.repo().createQueryBuilder().update().set({ leaseId, leaseUntil: new Date(Date.now() + 5 * 60_000), lastAttemptAt: new Date() })
      .where('user_id = :userId AND refresh_cipher IS NOT NULL AND (lease_until IS NULL OR lease_until < now())', { userId }).execute()
    if (!claim.affected) return { busy: true }
    const row = await this.repo().findOneBy({ userId, leaseId })
    if (!row) return { busy: false }
    const started = Date.now(), before = row.scanBefore ?? new Date(),
      after = row.scanAfter ?? new Date((row.lastSyncedAt?.getTime() ?? started) - 2 * 86400_000)
    try {
      if (row.lastError === 'reconnect_required') throw new GmailFailure('reconnect_required')
      await this.repo().update({ userId, leaseId }, { scanAfter: after, scanBefore: before })
      const token = await this.gmail.refresh(openMailSecret(row.refreshCipher, userId + ':refresh'))
      const page = await this.gmail.list(token, after, before, row.pageToken)
      const messages = page.messages ?? []
      let handled = 0, skipped = 0, existing = 0, parsedCount = 0
      const skipReasons: Record<string, number> = {}
      const skip = (reason: string) => { skipped++; skipReasons[reason] = (skipReasons[reason] ?? 0) + 1 }
      for (const item of messages) {
        const sourceKey = digest(row.gmailAddress + ':' + item.id)
        if (!await this.db.getRepository(BankMailEntry).existsBy({ userId, sourceKey })) {
          let message
          try { message = await this.gmail.message(token, item.id) }
          catch (error) { if (error instanceof GmailFailure && error.message === 'message_gone') { handled++; skip('message_gone'); continue }; throw error }
          const parsed = parseBankMail(message)
          if (parsed.transaction) { await this.ingest(userId, leaseId, sourceKey, parsed.transaction); parsedCount++ }
          else skip(parsed.reason ?? 'unsupported_template')
        } else existing++
        handled++
      }
      const completedPage = handled === messages.length, complete = completedPage && !page.nextPageToken
      await this.repo().update({ userId, leaseId }, {
        lastError: null, lastSkipped: skipped,
        ...(completedPage ? { pageToken: page.nextPageToken ?? null } : {}),
        ...(complete ? { lastSyncedAt: before, scanAfter: null, scanBefore: null } : {}),
      })
      // Counts and bounded parser codes only; never expose mail bodies, subjects or identities.
      return { busy: false, continued: !complete, processed: handled, skipped,
        summary: { matched: messages.length, existing, parsed: parsedCount, skipped, skipReasons } }
    } catch (error) {
      const code = error instanceof GmailFailure ? error.message : 'sync_failed'
      await this.repo().update({ userId, leaseId }, { lastError: code, ...(code === 'page_expired' ? { pageToken: null } : {}) })
      this.logger.warn(`Gmail sync: ${code}`)
      throw new ServiceUnavailableException(code)
    } finally { await this.repo().update({ userId, leaseId }, { leaseId: null, leaseUntil: null }) }
  }
  async dispatch() {
    if (!this.gmail.configured()) return { processed: 0 }
    const rows = await this.repo().createQueryBuilder('connection').select(['connection.userId'])
      .where('refresh_cipher IS NOT NULL AND last_error IS DISTINCT FROM :error', { error: 'reconnect_required' })
      .andWhere('(lease_until IS NULL OR lease_until < now())')
      .orderBy('last_attempt_at', 'ASC', 'NULLS FIRST').addOrderBy('user_id').take(10).getMany()
    const started = Date.now()
    let processed = 0
    for (const row of rows) {
      if (Date.now() - started > 15_000) break
      try { await this.sync(row.userId); processed++ } catch { /* per-account error already recorded */ }
    }
    return { processed }
  }
}
