import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Gives `allocation_movements` the foreign keys it never had.
 *
 * Both `user_id` and `allocation_id` were plain `varchar` with no constraint, so nothing
 * ever cleaned them up: deleting an account left that person's money movements sitting in
 * the table forever, and deleting a wallet orphaned its history. Every other user-owned
 * table cascades correctly — this one was the exception.
 *
 * That matters now because the account can be wiped from inside the app, and "delete my
 * data" has to actually delete it.
 */
export class FixMovementOrphans1785190000000 implements MigrationInterface {
  name = 'FixMovementOrphans1785190000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Rows already orphaned, or holding something that is not a uuid, cannot be pointed
    // at a real parent. They are unreferenced history for records that no longer exist.
    await queryRunner.query(`
      DELETE FROM allocation_movements m
       WHERE m.user_id !~ '^[0-9a-fA-F-]{36}$'
          OR m.allocation_id !~ '^[0-9a-fA-F-]{36}$'
          OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id::text = m.user_id)
          OR NOT EXISTS (SELECT 1 FROM allocations a WHERE a.id::text = m.allocation_id)
    `)

    await queryRunner.query(`
      ALTER TABLE allocation_movements
        ALTER COLUMN user_id TYPE uuid USING user_id::uuid,
        ALTER COLUMN allocation_id TYPE uuid USING allocation_id::uuid
    `)

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'allocation_movements_user_fk') THEN
          ALTER TABLE allocation_movements
            ADD CONSTRAINT allocation_movements_user_fk
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'allocation_movements_allocation_fk') THEN
          ALTER TABLE allocation_movements
            ADD CONSTRAINT allocation_movements_allocation_fk
            FOREIGN KEY (allocation_id) REFERENCES allocations(id) ON DELETE CASCADE;
        END IF;
      END $$;
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_allocation_movements_user
        ON allocation_movements(user_id, created_at DESC)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE allocation_movements DROP CONSTRAINT IF EXISTS allocation_movements_user_fk`)
    await queryRunner.query(`ALTER TABLE allocation_movements DROP CONSTRAINT IF EXISTS allocation_movements_allocation_fk`)
    await queryRunner.query(`
      ALTER TABLE allocation_movements
        ALTER COLUMN user_id TYPE varchar USING user_id::text,
        ALTER COLUMN allocation_id TYPE varchar USING allocation_id::text
    `)
  }
}
