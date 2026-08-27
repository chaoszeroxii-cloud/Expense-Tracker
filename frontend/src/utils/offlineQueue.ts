import type { CreateExpensePayload } from '../types'

/**
 * Transactions captured while offline, held until the network returns.
 *
 * The moment a purchase happens is often the moment with the worst signal — a basement
 * food court, the underground, a rural bus. Losing the entry there is exactly the
 * failure that teaches people the app cannot be relied on, so a save that cannot reach
 * the server is kept rather than dropped.
 *
 * Stored in IndexedDB, keyed by user: a shared device must never flush one person's
 * pending transactions into another person's account. This is also why the HTTP cache
 * in the service worker was removed — Cache Storage keys on URL alone and cannot make
 * that distinction.
 */

const DB_NAME = 'moneyflow-offline'
const DB_VERSION = 1
const STORE = 'pending-expenses'

export interface PendingExpense {
  /** Local id, sent as `clientKey` so a replayed create collapses onto the same row. */
  id: string
  userId: string
  payload: CreateExpensePayload
  queuedAt: number
  attempts: number
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('userId', 'userId', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return dbPromise
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(db => new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE, mode)
    const request = run(transaction.objectStore(STORE))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  }))
}

/** Browsers in private mode can refuse IndexedDB entirely; degrade rather than throw. */
export function isSupported(): boolean {
  return typeof indexedDB !== 'undefined'
}

export async function enqueue(userId: string, payload: CreateExpensePayload): Promise<PendingExpense | null> {
  if (!isSupported()) return null
  const entry: PendingExpense = {
    id: crypto.randomUUID(),
    userId,
    payload,
    queuedAt: Date.now(),
    attempts: 0,
  }
  try {
    await tx('readwrite', store => store.add(entry))
    return entry
  } catch {
    return null
  }
}

export async function listPending(userId: string): Promise<PendingExpense[]> {
  if (!isSupported()) return []
  try {
    const all = await tx<PendingExpense[]>('readonly', store => store.getAll() as IDBRequest<PendingExpense[]>)
    return all.filter(e => e.userId === userId).sort((a, b) => a.queuedAt - b.queuedAt)
  } catch {
    return []
  }
}

export async function remove(id: string): Promise<void> {
  if (!isSupported()) return
  try { await tx('readwrite', store => store.delete(id) as unknown as IDBRequest<undefined>) } catch { /* ignore */ }
}

async function bumpAttempts(entry: PendingExpense): Promise<void> {
  try {
    await tx('readwrite', store => store.put({ ...entry, attempts: entry.attempts + 1 }) as IDBRequest<IDBValidKey>)
  } catch { /* ignore */ }
}

export interface FlushResult {
  sent: number
  failed: number
  dropped: number
}

/** Entries that keep failing are abandoned rather than retried forever. */
const MAX_ATTEMPTS = 5

/**
 * Sends everything queued for this user.
 *
 * A rejection with a *response* means the server refused the transaction (a deleted
 * category, a validation error). Retrying that forever would never succeed, so it
 * counts as an attempt and is dropped once it has clearly failed. A rejection with no
 * response is a network problem and is left alone for the next attempt.
 */
export async function flush(
  userId: string,
  send: (payload: CreateExpensePayload) => Promise<unknown>,
): Promise<FlushResult> {
  const pending = await listPending(userId)
  const result: FlushResult = { sent: 0, failed: 0, dropped: 0 }

  for (const entry of pending) {
    try {
      // The key travels with every attempt. A create whose response was lost on the way
      // back has already been written, and without this the retry wrote it again — the
      // duplicate-transaction bug this queue was otherwise causing rather than solving.
      await send({ ...entry.payload, clientKey: entry.id })
      await remove(entry.id)
      result.sent++
    } catch (err) {
      const rejectedByServer = !!(err as { response?: unknown })?.response
      if (rejectedByServer && entry.attempts + 1 >= MAX_ATTEMPTS) {
        await remove(entry.id)
        result.dropped++
      } else {
        await bumpAttempts(entry)
        result.failed++
        // Stop on the first network failure: the rest will fail the same way and
        // hammering a dead connection wastes battery.
        if (!rejectedByServer) break
      }
    }
  }

  return result
}
