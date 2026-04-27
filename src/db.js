import { openDB } from 'idb'
import { DB_NAME, DB_VERSION, STORES, SETTINGS_KEY, computeCategoryStages } from './constants.js'

// ─── Database Initialisation ──────────────────────────────────────────────────

let _db = null

async function getDB() {
  if (_db) return _db
  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // customers — keyed by id (free-text, user-supplied)
      if (!db.objectStoreNames.contains(STORES.CUSTOMERS)) {
        db.createObjectStore(STORES.CUSTOMERS, { keyPath: 'id' })
      }

      // analyses — keyed by uuid; indexed by customerId for fast lookup
      if (!db.objectStoreNames.contains(STORES.ANALYSES)) {
        const analysesStore = db.createObjectStore(STORES.ANALYSES, { keyPath: 'id' })
        analysesStore.createIndex('by_customer', 'customerId', { unique: false })
      }

      // settings — keyed by a string key (e.g. "apiKeys")
      if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
        db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' })
      }
    },
  })
  return _db
}

// ─── Customer Operations ──────────────────────────────────────────────────────

/**
 * Returns a single customer record or undefined.
 * @param {string} id
 * @returns {Promise<object|undefined>}
 */
export async function getCustomer(id) {
  const db = await getDB()
  return db.get(STORES.CUSTOMERS, id)
}

/**
 * Returns all customer records, sorted by createdAt descending.
 * @returns {Promise<object[]>}
 */
export async function getAllCustomers() {
  const db = await getDB()
  const all = await db.getAll(STORES.CUSTOMERS)
  return all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

/**
 * Inserts a new customer record.
 * Derives categoryStages from ownedProducts before writing.
 * Throws if a customer with the same id already exists.
 * @param {{ id: string, name: string, ownedProducts: string[] }} params
 * @returns {Promise<object>} the stored record
 */
export async function createCustomer({ id, name, ownedProducts = [] }) {
  const db = await getDB()
  const existing = await db.get(STORES.CUSTOMERS, id)
  if (existing) throw new Error(`Customer with id "${id}" already exists`)

  const now = new Date().toISOString()
  const record = {
    id,
    name,
    ownedProducts,
    categoryStages: computeCategoryStages(ownedProducts),
    analysisComplete: false,
    createdAt: now,
    updatedAt: now,
  }
  await db.add(STORES.CUSTOMERS, record)
  return record
}

/**
 * Writes a full customer record (insert or overwrite).
 * Always recomputes categoryStages and bumps updatedAt.
 * @param {object} customer — must include id
 * @returns {Promise<object>} the stored record
 */
export async function deleteCustomer(id) {
  const db = await getDB()
  await db.delete(STORES.CUSTOMERS, id)
}

export async function putCustomer(customer) {
  const db = await getDB()
  const record = {
    ...customer,
    categoryStages: computeCategoryStages(customer.ownedProducts ?? []),
    updatedAt: new Date().toISOString(),
  }
  await db.put(STORES.CUSTOMERS, record)
  return record
}

// ─── Analysis Operations ──────────────────────────────────────────────────────

/**
 * Returns the most recent analysis for a given customer (by analyzedAt),
 * or undefined if none exists.
 * @param {string} customerId
 * @returns {Promise<object|undefined>}
 */
export async function getLatestAnalysis(customerId) {
  const db = await getDB()
  const all = await db.getAllFromIndex(STORES.ANALYSES, 'by_customer', customerId)
  if (!all.length) return undefined
  return all.sort((a, b) => new Date(b.analyzedAt) - new Date(a.analyzedAt))[0]
}

/**
 * Writes a full analysis record (insert or overwrite).
 * @param {object} analysis — must include id and customerId
 * @returns {Promise<object>} the stored record
 */
export async function putAnalysis(analysis) {
  const db = await getDB()
  await db.put(STORES.ANALYSES, analysis)
  return analysis
}

/**
 * Deletes all analysis records for a customer.
 * Used before storing a fresh analysis to avoid stale accumulation.
 * @param {string} customerId
 */
export async function deleteAnalysesForCustomer(customerId) {
  const db = await getDB()
  const all = await db.getAllFromIndex(STORES.ANALYSES, 'by_customer', customerId)
  const tx = db.transaction(STORES.ANALYSES, 'readwrite')
  await Promise.all([
    ...all.map(a => tx.store.delete(a.id)),
    tx.done,
  ])
}

// ─── Settings Operations ──────────────────────────────────────────────────────

/**
 * Returns the stored API key settings, or sensible defaults if not set.
 * @returns {Promise<{ anthropic: string, tavily: string, model: 'sonnet'|'opus' }>}
 */
export async function getSettings() {
  const db = await getDB()
  const row = await db.get(STORES.SETTINGS, SETTINGS_KEY)
  return row?.value ?? { anthropic: '', tavily: '', model: 'sonnet' }
}

/**
 * Persists API key settings.
 * @param {{ anthropic: string, tavily: string, model: 'sonnet'|'opus' }} value
 * @returns {Promise<void>}
 */
export async function saveSettings(value) {
  const db = await getDB()
  await db.put(STORES.SETTINGS, { key: SETTINGS_KEY, value })
}

// ─── Nuclear Option ───────────────────────────────────────────────────────────

/**
 * Wipes all records from every store. Does not delete the database itself
 * so the schema remains intact after the reload triggered by the caller.
 * @returns {Promise<void>}
 */
export async function clearAllData() {
  const db = await getDB()
  const tx = db.transaction(
    [STORES.CUSTOMERS, STORES.ANALYSES, STORES.SETTINGS],
    'readwrite'
  )
  await Promise.all([
    tx.objectStore(STORES.CUSTOMERS).clear(),
    tx.objectStore(STORES.ANALYSES).clear(),
    tx.objectStore(STORES.SETTINGS).clear(),
    tx.done,
  ])
}
