# Database

**The schema lives in `backend/src/migrations/`.** There is no SQL bootstrap here any more.

`database/init/*.sql` used to be mounted into the Postgres container and run on first
start. It was replaced because it could only ever bootstrap a *brand-new* container:
every existing database — production included — had to have each new file applied by
hand, and forgetting one produced a backend that booted fine and then failed on the
first query touching a missing column.

## How schema changes reach a database now

```
backend/src/migrations/*.ts  →  npm run migration:run  →  any database, exactly once
```

`migration:run` is part of the start command in both docker-compose and on Render
(`npm run start:prod`), so a deploy applies whatever is pending before the app boots.
TypeORM records applied migrations in the `migrations` table and never repeats one.

## Adding a change

```bash
cd backend
npm run build                                   # the CLI runs against compiled output
npm run migration:generate -- src/migrations/DescribeTheChange
```

Generation diffs the entities against the connected database, so it catches columns,
types and foreign keys. It does **not** catch:

- CHECK constraints
- indexes you want beyond what decorators declare
- data backfills

Those are hand-written — see `1785163169615-SchemaGuarantees.ts` and
`1785163169616-DataBackfills.ts` for the pattern. A migration that adds a column with a
non-obvious default almost always needs a backfill beside it: `advanced_mode` defaulting
to `false` would have hidden wallets, loans, investments and tax from every existing
user until `DataBackfills` set it to `true` for anyone already using them.

## Why `synchronize` is off

It is off in every environment and cannot be enabled by an environment variable. It had
been on outside production, and it drops anything the entities cannot describe. Measured
on the dev database before this changed:

- **0** CHECK constraints left in the entire schema — including `expenses.amount > 0`
- **0** non-primary-key indexes left on `expenses` — including the one the daily-brief
  range scan depends on
- `expenses.type` and `categories.type` silently rewritten from `varchar` to native
  Postgres enums

It also cannot run backfills, so it could not have replaced these migrations even if the
destruction were acceptable.

## Useful commands

```bash
npm run migration:show     # what is applied and what is pending
npm run migration:run      # apply everything pending
npm run migration:revert   # step back one migration
```
