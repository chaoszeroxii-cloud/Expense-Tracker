import { MigrationInterface, QueryRunner } from 'typeorm'

export class DailyLifePlanning1785240000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE monthly_spending_plans ALTER COLUMN total_amount DROP NOT NULL`)
    await q.query(`CREATE TABLE recurring_bills (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name varchar(100) NOT NULL CHECK (length(trim(name)) > 0),
      amount numeric(12,2) NOT NULL CHECK (amount > 0),
      category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
      due_day int NOT NULL CHECK (due_day BETWEEN 1 AND 31),
      start_month varchar(7) NOT NULL CHECK (start_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
      active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
    )`)
    await q.query(`CREATE INDEX idx_recurring_bills_user ON recurring_bills(user_id)`)
    await q.query(`CREATE TABLE bill_payments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      bill_id uuid NOT NULL REFERENCES recurring_bills(id) ON DELETE CASCADE,
      month varchar(7) NOT NULL CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
      expense_id uuid NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
      CONSTRAINT uq_bill_month UNIQUE(bill_id, month),
      CONSTRAINT uq_bill_expense UNIQUE(expense_id)
    )`)
    await q.query(`CREATE INDEX idx_bill_payments_user_month ON bill_payments(user_id, month)`)
    await q.query(`CREATE TABLE savings_goals (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name varchar(100) NOT NULL CHECK (length(trim(name)) > 0),
      target_amount numeric(12,2) NOT NULL CHECK (target_amount > 0),
      saved_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (saved_amount >= 0),
      target_date date NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
    )`)
    await q.query(`CREATE INDEX idx_savings_goals_user ON savings_goals(user_id)`)
  }

  async down(q: QueryRunner): Promise<void> {
    // Refuse lossy rollback while intentional "no plan" overrides exist.
    await q.query(`ALTER TABLE monthly_spending_plans ALTER COLUMN total_amount SET NOT NULL`)
    await q.query(`DROP TABLE savings_goals, bill_payments, recurring_bills`)
  }
}
