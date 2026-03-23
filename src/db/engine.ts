import initSqlJs, { type Database, type BindParams, type QueryExecResult } from 'sql.js'
import { schema } from './schema'

const DB_NAME = 'yield-intelligence'
const DB_STORE = 'sqlitedb'
const DB_KEY = 'main'

let db: Database | null = null
let dbInitPromise: Promise<Database> | null = null

async function loadFromIndexedDB(): Promise<Uint8Array | null> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(DB_STORE)
    }
    request.onsuccess = () => {
      const tx = request.result.transaction(DB_STORE, 'readonly')
      const store = tx.objectStore(DB_STORE)
      const get = store.get(DB_KEY)
      get.onsuccess = () => resolve(get.result ?? null)
      get.onerror = () => reject(get.error)
    }
    request.onerror = () => reject(request.error)
  })
}

async function saveToIndexedDB(data: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(DB_STORE)
    }
    request.onsuccess = () => {
      const tx = request.result.transaction(DB_STORE, 'readwrite')
      const store = tx.objectStore(DB_STORE)
      const put = store.put(data, DB_KEY)
      put.onsuccess = () => resolve()
      put.onerror = () => reject(put.error)
    }
    request.onerror = () => reject(request.error)
  })
}

async function initDb(): Promise<Database> {
  const SQL = await initSqlJs({
    locateFile: () => '/sql-wasm.wasm',
  })

  const saved = await loadFromIndexedDB()
  const database = saved ? new SQL.Database(saved) : new SQL.Database()

  database.run(schema)
  return database
}

export async function getDb(): Promise<Database> {
  if (db) return db

  if (!dbInitPromise) {
    dbInitPromise = initDb().then((database) => {
      db = database
      return database
    }).catch((err) => {
      dbInitPromise = null
      throw err
    })
  }

  return dbInitPromise
}

export async function query(sql: string, params?: BindParams): Promise<QueryExecResult[]> {
  const database = await getDb()
  return database.exec(sql, params)
}

export async function run(sql: string, params?: BindParams): Promise<void> {
  const database = await getDb()
  database.run(sql, params)
}

export function queryRows<T>(result: QueryExecResult[], mapper: (obj: Record<string, unknown>) => T): T[] {
  if (!result.length) return []
  const cols = result[0].columns
  return result[0].values.map((row) => {
    const obj = Object.fromEntries(cols.map((c, i) => [c, row[i]])) as Record<string, unknown>
    return mapper(obj)
  })
}

export async function persistDb(): Promise<void> {
  if (!db) return
  const data = db.export()
  await saveToIndexedDB(data)
}

let persistInterval: ReturnType<typeof setInterval> | null = null

export function startAutoPersist(intervalMs = 30_000): void {
  if (persistInterval) return
  persistInterval = setInterval(() => {
    persistDb().catch(console.error)
  }, intervalMs)
}

export function stopAutoPersist(): void {
  if (persistInterval) {
    clearInterval(persistInterval)
    persistInterval = null
  }
}
