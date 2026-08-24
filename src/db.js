import { openDB } from 'idb'
import { DB_NAME, DB_VERSION, STORES, SETTINGS_KEY, computeCategoryStages } from './constants.js'

let _db = null

async function getDB() {
  if (_db) return _db
  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORES.CUSTOMERS)) {
        db.createObjectStore(STORES.CUSTOMERS, { keyPath: 'id' })
      }

      if (!db.objectStoreNames.contains(STORES.ANALYSES)) {
        const analysesStore = db.createObjectStore(STORES.ANALYSES, { keyPath: 'id' })
        analysesStore.createIndex('by_customer', 'customerId', { unique: false })
      }

      if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
        db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' })
      }
    },
  })
  return _db
}

export async function getCustomer(id) {
  const db = await getDB()
  return db.get(STORES.CUSTOMERS, id)
}

export async function getAllCustomers() {
  const db = await getDB()
  const all = await db.getAll(STORES.CUSTOMERS)
  return all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

export async function createCustomer({ id, name, website = '', ownedProducts = [] }) {
  const db = await getDB()
  const existing = await db.get(STORES.CUSTOMERS, id)
  if (existing) throw new Error(`Customer with id "${id}" already exists`)

  const now = new Date().toISOString()
  const record = {
    id,
    name,
    website,
    ownedProducts,
    categoryStages: computeCategoryStages(ownedProducts),
    analysisComplete: false,
    createdAt: now,
    updatedAt: now,
  }
  await db.add(STORES.CUSTOMERS, record)
  return record
}

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

export async function getLatestAnalysisForAll() {
  const db = await getDB()
  const all = await db.getAll(STORES.ANALYSES)
  const map = new Map()
  for (const a of all) {
    const prev = map.get(a.customerId)
    if (!prev || new Date(a.analyzedAt) > new Date(prev.analyzedAt)) {
      map.set(a.customerId, a)
    }
  }
  return map
}

export async function getLatestAnalysis(customerId) {
  const db = await getDB()
  const all = await db.getAllFromIndex(STORES.ANALYSES, 'by_customer', customerId)
  if (!all.length) return undefined
  return all.sort((a, b) => new Date(b.analyzedAt) - new Date(a.analyzedAt))[0]
}

export async function putAnalysis(analysis) {
  const db = await getDB()
  await db.put(STORES.ANALYSES, analysis)
  return analysis
}

export async function deleteAnalysesForCustomer(customerId) {
  const db = await getDB()
  const all = await db.getAllFromIndex(STORES.ANALYSES, 'by_customer', customerId)
  const tx = db.transaction(STORES.ANALYSES, 'readwrite')
  await Promise.all([
    ...all.map(a => tx.store.delete(a.id)),
    tx.done,
  ])
}

export async function getSettings() {
  const db = await getDB()
  const row = await db.get(STORES.SETTINGS, SETTINGS_KEY)
  return row?.value ?? { anthropic: '', tavily: '', netlify: '' }
}

export async function saveSettings(value) {
  const db = await getDB()
  await db.put(STORES.SETTINGS, { key: SETTINGS_KEY, value })
}

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
