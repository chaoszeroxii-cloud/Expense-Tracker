import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from './category.entity';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { normalizeMdiIconId } from '../../common/icon.util';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly repo: Repository<Category>,
  ) {}

  findAll(userId: string): Promise<Category[]> {
    return this.repo.find({
      where: { userId },
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string, userId: string): Promise<Category> {
    const category = await this.repo.findOne({ where: { id, userId } });
    if (!category) throw new NotFoundException(`Category ${id} not found`);
    return category;
  }

  create(dto: CreateCategoryDto, userId: string): Promise<Category> {
    const category = this.repo.create({
      ...dto,
      icon: normalizeMdiIconId(dto.icon, 'other'),
      userId,
    });
    return this.repo.save(category);
  }

  async update(id: string, dto: UpdateCategoryDto, userId: string): Promise<Category> {
    const category = await this.findOne(id, userId);
    Object.assign(category, {
      ...dto,
      ...(dto.icon !== undefined
        ? { icon: normalizeMdiIconId(dto.icon, 'other') }
        : {}),
    });
    return this.repo.save(category);
  }

  /**
   * What deleting this category would destroy, so the confirmation can state it.
   *
   * `expenses.category_id` is ON DELETE SET NULL, so a delete does not merely remove a
   * label from a picker — it strips the classification off every transaction ever filed
   * under it, permanently and with no undo. Years of history became "Uncategorized" from
   * a one-tap delete that said nothing about it.
   */
  async getDeleteImpact(id: string, userId: string) {
    const category = await this.findOne(id, userId);

    const [row] = await this.repo.manager.query(
      `SELECT COUNT(*)::int AS count,
              MIN(TO_CHAR(occurred_at, 'YYYY-MM')) AS first_month,
              MAX(TO_CHAR(occurred_at, 'YYYY-MM')) AS last_month
         FROM expenses WHERE user_id = $1 AND category_id = $2`,
      [userId, id],
    );

    const [link] = await this.repo.manager.query(
      `SELECT a.name AS wallet FROM allocations a
         WHERE a.user_id = $1
           AND (EXISTS (SELECT 1 FROM allocation_categories        l WHERE l.allocation_id = a.id AND l.category_id = $2)
             OR EXISTS (SELECT 1 FROM allocation_income_categories l WHERE l.allocation_id = a.id AND l.category_id = $2))
         LIMIT 1`,
      [userId, id],
    );

    return {
      id: category.id,
      name: category.name,
      isDefault: category.isDefault,
      transactionCount: row?.count ?? 0,
      firstMonth: row?.first_month ?? null,
      lastMonth: row?.last_month ?? null,
      linkedWallet: link?.wallet ?? null,
    };
  }

  /**
   * `reassignTo` moves the transactions instead of orphaning them.
   *
   * Without it the only outcome was silent data loss — see `getDeleteImpact`. The target
   * has to be one of the caller's own categories of the same kind, or the move would
   * produce exactly the type mismatch `ExpensesService` now rejects on write.
   */
  async remove(id: string, userId: string, reassignTo?: string): Promise<void> {
    const category = await this.findOne(id, userId);

    if (reassignTo) {
      if (reassignTo === id) {
        throw new BadRequestException('Cannot reassign a category to itself');
      }
      const target = await this.findOne(reassignTo, userId);
      if (target.type !== category.type) {
        throw new BadRequestException(
          `"${target.name}" is an ${target.type} category — ${category.type} transactions cannot be moved to it`,
        );
      }
    }

    await this.repo.manager.transaction(async (em) => {
      if (reassignTo) {
        await em.query(
          `UPDATE expenses SET category_id = $1, updated_at = NOW()
            WHERE user_id = $2 AND category_id = $3`,
          [reassignTo, userId, id],
        );
      }
      await em.delete(Category, { id, userId });
    });
  }
}
