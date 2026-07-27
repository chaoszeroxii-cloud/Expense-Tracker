const assert = require('node:assert/strict')
const test = require('node:test')
const { getMetadataArgsStorage } = require('typeorm')

const { databaseConfig } = require('../dist/config/database.config')
const {
  AllocationMovement,
} = require('../dist/modules/allocations/allocation-movement.entity')

test('automatic schema synchronization cannot be enabled by environment variables', () => {
  const previousDbSync = process.env.DB_SYNC

  try {
    process.env.DB_SYNC = 'true'
    assert.equal(databaseConfig().synchronize, false)
  } finally {
    if (previousDbSync === undefined) {
      delete process.env.DB_SYNC
    } else {
      process.env.DB_SYNC = previousDbSync
    }
  }
})

test('allocation movement foreign-key columns use UUID metadata', () => {
  const columns = getMetadataArgsStorage().columns.filter(
    ({ target }) => target === AllocationMovement,
  )
  const columnTypes = Object.fromEntries(
    columns.map(({ propertyName, options }) => [propertyName, options.type]),
  )

  assert.equal(columnTypes.userId, 'uuid')
  assert.equal(columnTypes.allocationId, 'uuid')
})
