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
  needsReview?: boolean
  nextAttemptAt?: number
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
    transaction.oncomplete = () => resolve(request.result)
    transaction.onabort = () => reject(transaction.error)
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
    id: payload.clientKey ?? crypto.randomUUID(),
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

async function bumpAttempts(entry: PendingExpense, needsReview: boolean): Promise<void> {
  try {
    await tx('readwrite', store => store.put({ ...entry, attempts: entry.attempts + 1, needsReview,
      nextAttemptAt: Date.now() + Math.min(300000, 1000 * 2 ** Math.min(entry.attempts, 9)),
    }) as IDBRequest<IDBValidKey>)
  } catch { /* ignore */ }
}

export interface FlushResult {
  sent: number
  failed: number
  dropped: number
  needsReview: number
}

/** Only explicitly rejected records may be edited; an uncertain result keeps its payload/key. */
export async function revise(userId: string, id: string, payload: CreateExpensePayload): Promise<void> {
  const entry = (await listPending(userId)).find(e => e.id === id)
  if (!entry?.needsReview) throw new Error('Record is not awaiting correction')
  await tx('readwrite', store => store.put({ ...entry, payload: { ...payload, clientKey: id },
    attempts: 0, needsReview: false, nextAttemptAt: 0,
  }))
}

/**
 * Sends everything queued for this user.
 *
 * A validation rejection (for example, a deleted category) pauses automatic retries
 * so the user can correct it. An HTTP response alone is not a permanent rejection.
 * Network, authentication and server failures retain the entry and retry with backoff.
 */
export async function flush(
  userId: string,
  send: (payload: CreateExpensePayload) => Promise<unknown>,
  force = false,
): Promise<FlushResult> {
  const pending = await listPending(userId)
  const result: FlushResult = { sent: 0, failed: 0, dropped: 0, needsReview: 0 }

  for (const entry of pending) {
    if (entry.needsReview) { result.needsReview++; continue }
    if (!force && (entry.nextAttemptAt ?? 0) > Date.now()) continue
    try {
      // The key travels with every attempt. A create whose response was lost on the way
      // back has already been written, and without this the retry wrote it again — the
      // duplicate-transaction bug this queue was otherwise causing rather than solving.
      await send({ ...entry.payload, clientKey: entry.id })
      await remove(entry.id)
      result.sent++
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status
      const needsReview = !!status && [400, 404, 409, 422].includes(status)
      await bumpAttempts(entry, needsReview)
      result.failed++
      if (needsReview) result.needsReview++
      else break // Network, authentication, throttling and 5xx never delete a record.
    }
  }

  return result
}
