import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { DataSource, EntityManager } from 'typeorm'
import { CaptureTemplate } from './capture.entity'
import { CaptureBatchDto, CaptureRowDto, TemplateDto } from './capture.dto'
import { Category } from '../categories/category.entity'
import { Expense } from '../expenses/expense.entity'
import { User } from '../users/user.entity'
import { ExpensesService } from '../expenses/expenses.service'
import { lockLedger } from '../../common/ledger-lock.util'
import { localToday, safeTimezone } from '../../common/local-date.util'

@Injectable()
export class CaptureService {
  constructor(
    private readonly db: DataSource,
    private readonly expenses: ExpensesService,
  ) {}

  async templates(userId: string) {
    return (
      await this.db
        .getRepository(CaptureTemplate)
        .find({ where: { userId }, order: { createdAt: 'ASC', id: 'ASC' } })
    ).map((row) => ({ ...row, amount: Number(row.amount) }))
  }
  async saveTemplate(userId: string, dto: TemplateDto, id?: string) {
    return this.db.transaction(async (em) => {
      await lockLedger(em, userId)
      if (!dto.name.trim()) throw new BadRequestException('A name is required')
      await this.category(em, userId, dto.categoryId, dto.type)
      if (id && !(await em.exists(CaptureTemplate, { where: { id, userId } })))
        throw new NotFoundException('Template not found')
      if (!id && (await em.count(CaptureTemplate, { where: { userId } })) >= 20)
        throw new BadRequestException('Maximum 20 pinned entries')
      return em.save(CaptureTemplate, {
        ...dto,
        name: dto.name.trim(),
        note: dto.note ?? '',
        id,
        userId,
      })
    })
  }
  async removeTemplate(userId: string, id: string) {
    const result = await this.db.getRepository(CaptureTemplate).delete({ id, userId })
    if (!result.affected) throw new NotFoundException('Template not found')
    return { ok: true }
  }
  private async category(em: EntityManager, userId: string, id: string, type: string) {
    if (
      !(await em.exists(Category, { where: { id, userId, type: type as 'expense' | 'income' } }))
    ) {
      throw new BadRequestException('Choose a category of the correct type from your account')
    }
  }
  private async inspect(em: EntityManager, userId: string, row: CaptureRowDto, timezone: string) {
    const day = new Date(row.date + 'T12:00:00Z')
    if (
      !Number.isFinite(day.getTime()) ||
      day.toISOString().slice(0, 10) !== row.date ||
      row.date < '1900-01-01' ||
      row.date > localToday(timezone)
    ) {
      throw new BadRequestException('Choose a valid date from 1900 through today')
    }
    await this.category(em, userId, row.categoryId, row.type)
    const [dates] = await em.query(`SELECT ($1::date + TIME '12:00') AT TIME ZONE $2 AS at`, [
      row.date,
      timezone,
    ])
    const occurredAt = new Date(dates.at).toISOString()
    const existing = await em.findOne(Expense, {
      where: { userId, clientKey: row.clientKey },
      loadEagerRelations: false,
    })
    if (
      existing &&
      (Number(existing.amount) !== row.amount ||
        existing.type !== row.type ||
        existing.categoryId !== row.categoryId ||
        (existing.note ?? '') !== (row.note ?? '') ||
        new Date(existing.occurredAt).toISOString() !== occurredAt)
    ) {
      throw new ConflictException(
        'This draft was already saved with different contents. Edit the saved entry in History, or remove this draft and add a new entry.',
      )
    }
    const matches = await em.query(
      `SELECT id FROM expenses WHERE user_id=$1 AND type=$2 AND amount=$3
      AND category_id=$4 AND COALESCE(note,'')=$5
      AND occurred_at >= ($6::date::timestamp AT TIME ZONE $7)
      AND occurred_at < (($6::date+1)::timestamp AT TIME ZONE $7) LIMIT 3`,
      [userId, row.type, row.amount, row.categoryId, row.note ?? '', row.date, timezone],
    )
    return {
      occurredAt,
      existing,
      duplicate: matches.length > 0,
      matches: matches.map((r) => r.id),
    }
  }
  async batch(userId: string, dto: CaptureBatchDto, commit = false) {
    return this.db.transaction(async (em) => {
      const user = commit
        ? await lockLedger(em, userId)
        : await em.findOne(User, { where: { id: userId } })
      if (!user) throw new NotFoundException('User not found')
      const timezone = safeTimezone(user.timezone)
      const seen = new Set<string>(),
        keys = new Set<string>(),
        results = []
      for (const row of dto.rows) {
        if (keys.has(row.clientKey))
          throw new BadRequestException('Each draft must have a unique key')
        keys.add(row.clientKey)
        const state = await this.inspect(em, userId, row, timezone)
        const signature = JSON.stringify([
          row.date,
          row.amount,
          row.type,
          row.categoryId,
          row.note ?? '',
        ])
        const duplicate = state.duplicate || seen.has(signature)
        seen.add(signature)
        if (commit && duplicate && !row.allowDuplicate && !state.existing)
          throw new ConflictException(
            'Possible duplicate. Preview and explicitly allow it before saving.',
          )
        let expenseId = state.existing?.id ?? null
        if (commit && !expenseId) {
          const expense = await this.expenses.createInTransaction(
            {
              amount: row.amount,
              type: row.type,
              categoryId: row.categoryId,
              note: row.note ?? '',
              clientKey: row.clientKey,
              occurredAt: state.occurredAt,
            },
            userId,
            em,
          )
          expenseId = expense.id
        }
        results.push({
          clientKey: row.clientKey,
          duplicate: duplicate && !state.existing,
          alreadySaved: !!state.existing,
          expenseId,
        })
      }
      return { rows: results, committed: commit }
    })
  }
}
