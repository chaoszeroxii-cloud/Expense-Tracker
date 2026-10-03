import { MigrationInterface, QueryRunner } from 'typeorm'

export class HomeCumulativeBalance1785410000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE users ADD COLUMN show_cumulative_balance boolean NOT NULL DEFAULT false')
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE users DROP COLUMN show_cumulative_balance')
  }
}
