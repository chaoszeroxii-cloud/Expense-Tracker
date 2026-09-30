import { MigrationInterface, QueryRunner } from 'typeorm'

export class DailyCompanion1785300000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE capture_templates (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      name varchar(100) NOT NULL, amount numeric(12,2) NOT NULL CHECK (amount > 0),
      type varchar(10) NOT NULL CHECK (type IN ('expense','income')),
      note varchar(500) NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
    ); CREATE INDEX idx_capture_templates_user ON capture_templates(user_id, created_at);
    CREATE TABLE day_reviews (
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      local_date date NOT NULL, reviewed_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(user_id, local_date)
    );
    CREATE TABLE pay_cycle_plans (
      user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      enabled boolean NOT NULL DEFAULT false,
      pay_day integer NOT NULL CHECK (pay_day BETWEEN 1 AND 31),
      budget numeric(12,2) NOT NULL CHECK (budget > 0)
    );
    CREATE TABLE bill_reminder_preferences (
      user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      enabled boolean NOT NULL DEFAULT false,
      days_before integer NOT NULL DEFAULT 3 CHECK(days_before BETWEEN 0 AND 14)
    );
    CREATE TABLE bill_reminder_deliveries (
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      bill_id uuid NOT NULL REFERENCES recurring_bills(id) ON DELETE CASCADE,
      month varchar(7) NOT NULL, snoozed_until date, last_sent date,
      PRIMARY KEY(user_id,bill_id,month)
    )`)
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE bill_reminder_deliveries, bill_reminder_preferences,
      pay_cycle_plans, day_reviews, capture_templates`)
  }
}
