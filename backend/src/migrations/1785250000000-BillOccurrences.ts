import { MigrationInterface, QueryRunner } from 'typeorm'

export class BillOccurrences1785250000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE bill_occurrences (
      bill_id uuid NOT NULL REFERENCES recurring_bills(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      month varchar(7) NOT NULL CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
      name varchar(100) NOT NULL CHECK (length(trim(name)) > 0),
      amount numeric(12,2) NOT NULL CHECK (amount > 0),
      category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
      due_day int NOT NULL CHECK (due_day BETWEEN 1 AND 31),
      waived boolean NOT NULL DEFAULT false,
      PRIMARY KEY (bill_id, month)
    )`)
    // Existing active commitments retain every unpaid cycle. Archived templates have
    // no archive date in the old model, so preserve known paid cycles only.
    await q.query(`INSERT INTO bill_occurrences (bill_id,user_id,month,name,amount,category_id,due_day)
      SELECT b.id,b.user_id,to_char(m,'YYYY-MM'),b.name,b.amount,b.category_id,b.due_day
      FROM recurring_bills b JOIN users u ON u.id=b.user_id
      CROSS JOIN LATERAL generate_series((b.start_month||'-01')::date,
        date_trunc('month',now() AT TIME ZONE u.timezone), interval '1 month') m
      WHERE b.active
      UNION
      SELECT b.id,b.user_id,p.month,b.name,b.amount,b.category_id,b.due_day
      FROM bill_payments p JOIN recurring_bills b ON b.id=p.bill_id
      ON CONFLICT DO NOTHING`)
    await q.query(`CREATE INDEX idx_bill_occurrences_user_month ON bill_occurrences(user_id,month)`)
    await q.query(`ALTER TABLE bill_payments ADD CONSTRAINT fk_bill_payment_occurrence
      FOREIGN KEY(bill_id,month) REFERENCES bill_occurrences(bill_id,month) ON DELETE CASCADE`)
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE bill_payments DROP CONSTRAINT fk_bill_payment_occurrence`)
    await q.query(`DROP TABLE bill_occurrences`)
  }
}
