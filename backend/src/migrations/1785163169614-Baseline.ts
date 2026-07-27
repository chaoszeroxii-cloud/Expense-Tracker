import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * The whole schema, as the entities define it.
 *
 * Adopts databases created either way:
 *   - Empty database  → everything below is created.
 *   - Existing database (schema built by the old `database/init/*.sql` files, or by
 *     `synchronize`) → creation is skipped and the migration is simply recorded as
 *     applied. The migrations that follow top up anything those databases are missing,
 *     so no one has to hand-insert rows into the `migrations` table to adopt this.
 *
 * The `users` table is the probe: it has existed since the first schema file, so its
 * presence means "this database predates migrations".
 */
export class Baseline1785163169614 implements MigrationInterface {
    name = 'Baseline1785163169614'

    public async up(queryRunner: QueryRunner): Promise<void> {
        if (await queryRunner.hasTable('users')) {
            console.log('[Baseline] existing schema detected — recording as applied without changes')
            return
        }

        // uuid_generate_v4() comes from uuid-ossp; pgcrypto is what the original schema
        // used and other statements may still rely on it.
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

        await queryRunner.query(`CREATE TABLE "allocations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "name" character varying(100) NOT NULL, "icon" character varying(50), "color" character varying(7), "balance" numeric(14,2) NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_ca63099fc248466264af0fa6f1f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "expenses" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "category_id" uuid, "allocation_id" uuid, "amount" numeric(12,2) NOT NULL, "type" character varying(10) NOT NULL, "note" text, "tags" text array NOT NULL DEFAULT '{}', "occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_94c3ceb17e3140abc9282c20610" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "categories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid, "name" character varying(100) NOT NULL, "icon" character varying(50), "color" character varying(7), "type" character varying(10) NOT NULL, "is_default" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_24dbc6126a28ff948da33e97d3b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying NOT NULL, "name" character varying(100) NOT NULL, "password_hash" character varying, "google_id" character varying, "facebook_id" character varying, "auth_provider" character varying(10) NOT NULL DEFAULT 'local', "currency" character varying(3) NOT NULL DEFAULT 'THB', "role" character varying(10) NOT NULL DEFAULT 'user', "onboarding_completed" boolean NOT NULL DEFAULT false, "total_balance" numeric(14,2) NOT NULL DEFAULT '0', "expected_monthly_income" numeric(14,2), "monthly_spending_limit" numeric(14,2), "tracking_mode" character varying(20) NOT NULL DEFAULT 'plan', "timezone" character varying(64) NOT NULL DEFAULT 'Asia/Bangkok', "work_hours_per_day" numeric(4,2) NOT NULL DEFAULT '8', "work_days_per_month" integer NOT NULL DEFAULT '22', "show_work_time" boolean NOT NULL DEFAULT true, "advanced_mode" boolean NOT NULL DEFAULT false, "reset_token" character varying(64), "reset_token_expiry" TIMESTAMP WITH TIME ZONE, "token_version" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "allocation_movements" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" character varying NOT NULL, "allocation_id" character varying NOT NULL, "amount" numeric(14,2) NOT NULL, "type" character varying(20) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_6463859db3bf976aafcc9a4db32" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "allocation_plans" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "allocation_id" uuid NOT NULL, "amount" numeric(14,2) NOT NULL, "month" character varying(7) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_e712a7d18107c933548631ff6e7" UNIQUE ("user_id", "allocation_id", "month"), CONSTRAINT "PK_ceab3e05cff80ab49e90781707a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "budgets" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "category_id" uuid NOT NULL, "amount" numeric(14,2) NOT NULL, "month" character varying(7) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_50014731224db34ebc5474f0cb8" UNIQUE ("user_id", "category_id", "month"), CONSTRAINT "PK_9c8a51748f82387644b773da482" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "loans" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "direction" character varying(10) NOT NULL DEFAULT 'lent', "borrower" character varying(100) NOT NULL, "amount" numeric(14,2) NOT NULL, "note" character varying, "lent_at" TIMESTAMP WITH TIME ZONE NOT NULL, "due_date" TIMESTAMP WITH TIME ZONE, "status" character varying(10) NOT NULL DEFAULT 'active', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_5c6942c1e13e4de135c5203ee61" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "loan_payments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "loan_id" uuid NOT NULL, "amount" numeric(14,2) NOT NULL, "paid_at" TIMESTAMP WITH TIME ZONE NOT NULL, "note" character varying, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_db75e38243b5f2cb9e728da4d0f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "investments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "name" character varying(200) NOT NULL, "symbol" character varying(50), "type" character varying(20) NOT NULL DEFAULT 'mutual_fund', "note" character varying, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_a1263853f1a4fb8b849c1c9aff4" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "investment_transactions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "investment_id" uuid NOT NULL, "user_id" uuid NOT NULL, "type" character varying(10) NOT NULL, "amount" numeric(14,2) NOT NULL, "units" numeric(18,6), "nav_price" numeric(14,4), "occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL, "note" character varying, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_4f1f10cd2594cd595d676d7e136" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "tax_deductions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "tax_year" integer NOT NULL, "type" character varying(50) NOT NULL, "name" character varying(200) NOT NULL, "amount" numeric(14,2) NOT NULL DEFAULT '0', "max_amount" numeric(14,2), "note" character varying, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_833df69e8855c94c7bd0757781a" UNIQUE ("user_id", "tax_year", "type"), CONSTRAINT "PK_5b8001863b033f90443be5bea36" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "chat_messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "role" character varying(20) NOT NULL, "content" text NOT NULL, "metadata" jsonb, "image_analysis" jsonb, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_40c55ee0e571e268b0d3cd37d10" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "ai_usage_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "model" character varying(100) NOT NULL, "prompt_tokens" integer NOT NULL DEFAULT '0', "completion_tokens" integer NOT NULL DEFAULT '0', "total_tokens" integer NOT NULL DEFAULT '0', "cost_usd" numeric(14,8) NOT NULL DEFAULT '0', "cost_thb" numeric(14,4) NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_7f42670987a1de5cb209a77e925" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "product_events" ("id" BIGSERIAL NOT NULL, "user_id" uuid NOT NULL, "name" character varying(40) NOT NULL, "duration_ms" integer, "platform" character varying(20), "app_version" character varying(20), "local_date" date NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_9e89757662ab24d7fb05021713a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_7b12ba75f063ced199edc978d8" ON "product_events" ("user_id", "local_date") `);
        await queryRunner.query(`CREATE TABLE "allocation_categories" ("allocation_id" uuid NOT NULL, "category_id" uuid NOT NULL, CONSTRAINT "PK_27763dba38bad4827ef6fe78c36" PRIMARY KEY ("allocation_id", "category_id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_eea3285e919939dc5f2f54a0dd" ON "allocation_categories" ("allocation_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_9aa4e8d74a147508e8bc1909a6" ON "allocation_categories" ("category_id") `);
        await queryRunner.query(`CREATE TABLE "allocation_income_categories" ("allocation_id" uuid NOT NULL, "category_id" uuid NOT NULL, CONSTRAINT "PK_9b84cb3373bcfb4cb9d9729505a" PRIMARY KEY ("allocation_id", "category_id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_c09b8b63ea36015343ba6801b2" ON "allocation_income_categories" ("allocation_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_ca43b1ec630638048826813695" ON "allocation_income_categories" ("category_id") `);
        await queryRunner.query(`ALTER TABLE "allocations" ADD CONSTRAINT "FK_28409a4ad876dc3ae8ce0a665bd" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "expenses" ADD CONSTRAINT "FK_49a0ca239d34e74fdc4e0625a78" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "expenses" ADD CONSTRAINT "FK_5d1f4be708e0dfe2afa1a3c376c" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "expenses" ADD CONSTRAINT "FK_aa44c508c336802a6ae62f2f4cc" FOREIGN KEY ("allocation_id") REFERENCES "allocations"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "categories" ADD CONSTRAINT "FK_2296b7fe012d95646fa41921c8b" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "allocation_plans" ADD CONSTRAINT "FK_1d1034db70f21732f2567735484" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "allocation_plans" ADD CONSTRAINT "FK_6bcc5a34d2fcca39157d331e703" FOREIGN KEY ("allocation_id") REFERENCES "allocations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "budgets" ADD CONSTRAINT "FK_5d25d8bbd6c209261dfe04558f1" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "budgets" ADD CONSTRAINT "FK_4bb589bf6db49e8c1fd6af05f49" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "loans" ADD CONSTRAINT "FK_d135791c39e46e13ca4c2725fbb" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "loan_payments" ADD CONSTRAINT "FK_6584bab09ac53bd8d00d74a58cd" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "investments" ADD CONSTRAINT "FK_fe9d6987f15c1cce3ff55dd25e2" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "investment_transactions" ADD CONSTRAINT "FK_cd0f9b7c4f2f7bf061132a1a0b5" FOREIGN KEY ("investment_id") REFERENCES "investments"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "investment_transactions" ADD CONSTRAINT "FK_647c3d67b6e10b5ed3efe13a889" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "tax_deductions" ADD CONSTRAINT "FK_f8f6c3534db34b8117d3fbe2b67" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "chat_messages" ADD CONSTRAINT "FK_5588b6cea298cedec7063c0d33e" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "FK_b81535100ed8a29f2184b4e862c" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "allocation_categories" ADD CONSTRAINT "FK_eea3285e919939dc5f2f54a0dde" FOREIGN KEY ("allocation_id") REFERENCES "allocations"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "allocation_categories" ADD CONSTRAINT "FK_9aa4e8d74a147508e8bc1909a6f" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "allocation_income_categories" ADD CONSTRAINT "FK_c09b8b63ea36015343ba6801b2c" FOREIGN KEY ("allocation_id") REFERENCES "allocations"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "allocation_income_categories" ADD CONSTRAINT "FK_ca43b1ec630638048826813695b" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Reverting the baseline drops every table and all data in them. That is never
        // the intent behind a stray `migration:revert`, so it has to be asked for
        // explicitly. Set ALLOW_BASELINE_REVERT=true if you really mean it.
        if (process.env.ALLOW_BASELINE_REVERT !== 'true') {
            throw new Error(
                'Refusing to revert the baseline: this drops every table. ' +
                'Re-run with ALLOW_BASELINE_REVERT=true if that is genuinely what you want.',
            )
        }
        await queryRunner.query(`ALTER TABLE "allocation_income_categories" DROP CONSTRAINT "FK_ca43b1ec630638048826813695b"`);
        await queryRunner.query(`ALTER TABLE "allocation_income_categories" DROP CONSTRAINT "FK_c09b8b63ea36015343ba6801b2c"`);
        await queryRunner.query(`ALTER TABLE "allocation_categories" DROP CONSTRAINT "FK_9aa4e8d74a147508e8bc1909a6f"`);
        await queryRunner.query(`ALTER TABLE "allocation_categories" DROP CONSTRAINT "FK_eea3285e919939dc5f2f54a0dde"`);
        await queryRunner.query(`ALTER TABLE "ai_usage_logs" DROP CONSTRAINT "FK_b81535100ed8a29f2184b4e862c"`);
        await queryRunner.query(`ALTER TABLE "chat_messages" DROP CONSTRAINT "FK_5588b6cea298cedec7063c0d33e"`);
        await queryRunner.query(`ALTER TABLE "tax_deductions" DROP CONSTRAINT "FK_f8f6c3534db34b8117d3fbe2b67"`);
        await queryRunner.query(`ALTER TABLE "investment_transactions" DROP CONSTRAINT "FK_647c3d67b6e10b5ed3efe13a889"`);
        await queryRunner.query(`ALTER TABLE "investment_transactions" DROP CONSTRAINT "FK_cd0f9b7c4f2f7bf061132a1a0b5"`);
        await queryRunner.query(`ALTER TABLE "investments" DROP CONSTRAINT "FK_fe9d6987f15c1cce3ff55dd25e2"`);
        await queryRunner.query(`ALTER TABLE "loan_payments" DROP CONSTRAINT "FK_6584bab09ac53bd8d00d74a58cd"`);
        await queryRunner.query(`ALTER TABLE "loans" DROP CONSTRAINT "FK_d135791c39e46e13ca4c2725fbb"`);
        await queryRunner.query(`ALTER TABLE "budgets" DROP CONSTRAINT "FK_4bb589bf6db49e8c1fd6af05f49"`);
        await queryRunner.query(`ALTER TABLE "budgets" DROP CONSTRAINT "FK_5d25d8bbd6c209261dfe04558f1"`);
        await queryRunner.query(`ALTER TABLE "allocation_plans" DROP CONSTRAINT "FK_6bcc5a34d2fcca39157d331e703"`);
        await queryRunner.query(`ALTER TABLE "allocation_plans" DROP CONSTRAINT "FK_1d1034db70f21732f2567735484"`);
        await queryRunner.query(`ALTER TABLE "categories" DROP CONSTRAINT "FK_2296b7fe012d95646fa41921c8b"`);
        await queryRunner.query(`ALTER TABLE "expenses" DROP CONSTRAINT "FK_aa44c508c336802a6ae62f2f4cc"`);
        await queryRunner.query(`ALTER TABLE "expenses" DROP CONSTRAINT "FK_5d1f4be708e0dfe2afa1a3c376c"`);
        await queryRunner.query(`ALTER TABLE "expenses" DROP CONSTRAINT "FK_49a0ca239d34e74fdc4e0625a78"`);
        await queryRunner.query(`ALTER TABLE "allocations" DROP CONSTRAINT "FK_28409a4ad876dc3ae8ce0a665bd"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ca43b1ec630638048826813695"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c09b8b63ea36015343ba6801b2"`);
        await queryRunner.query(`DROP TABLE "allocation_income_categories"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_9aa4e8d74a147508e8bc1909a6"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_eea3285e919939dc5f2f54a0dd"`);
        await queryRunner.query(`DROP TABLE "allocation_categories"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_7b12ba75f063ced199edc978d8"`);
        await queryRunner.query(`DROP TABLE "product_events"`);
        await queryRunner.query(`DROP TABLE "ai_usage_logs"`);
        await queryRunner.query(`DROP TABLE "chat_messages"`);
        await queryRunner.query(`DROP TABLE "tax_deductions"`);
        await queryRunner.query(`DROP TABLE "investment_transactions"`);
        await queryRunner.query(`DROP TABLE "investments"`);
        await queryRunner.query(`DROP TABLE "loan_payments"`);
        await queryRunner.query(`DROP TABLE "loans"`);
        await queryRunner.query(`DROP TABLE "budgets"`);
        await queryRunner.query(`DROP TABLE "allocation_plans"`);
        await queryRunner.query(`DROP TABLE "allocation_movements"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TABLE "categories"`);
        await queryRunner.query(`DROP TABLE "expenses"`);
        await queryRunner.query(`DROP TABLE "allocations"`);
    }

}
