import { DataSource, DataSourceOptions } from 'typeorm'
import { databaseConfig } from './database.config'

/**
 * DataSource for the TypeORM CLI (`migration:generate`, `migration:run`, `migration:revert`).
 *
 * The CLI cannot read Nest's module config, so it needs a default-exported DataSource.
 * Connection settings are shared with `databaseConfig()` so the two can never drift.
 *
 * `synchronize` is forced off here: the CLI must never alter the schema as a side effect
 * of running a migration.
 */
const options = databaseConfig() as DataSourceOptions

export default new DataSource({
  ...options,
  synchronize: false,
  logging: ['error', 'schema'],
  migrations: [__dirname + '/../migrations/*.{ts,js}'],
  migrationsTableName: 'migrations',
})
