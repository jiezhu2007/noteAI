import initSqlJs from 'sql.js'
import type { Database } from 'sql.js'
import path from 'path'
import { app } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import fs from 'fs'

const DB_DIR = path.join(app.getPath('userData'), 'NoteAI')
const DB_PATH = path.join(DB_DIR, 'noteai.db')
const NOTES_DIR = path.join(DB_DIR, 'notes')

let sqlDb: Database

// ─── sql.js compatibility shim ────────────────────────────────────────────────
// Provides the same .prepare().get() / .all() / .run() interface as
// better-sqlite3 so the query code below requires zero changes.

function flatArgs(args: any[]): any[] {
  // Our call sites spread an array: stmt.run(...vals). Unwrap one level.
  if (args.length === 1 && Array.isArray(args[0])) return args[0]
  return args
}

function stmtGet(sql: string, ...args: any[]): any {
  const stmt = sqlDb.prepare(sql)
  const params = flatArgs(args)
  if (params.length) stmt.bind(params)
  const found = stmt.step()
  const row = found ? { ...stmt.getAsObject() } : undefined
  stmt.free()
  return row
}

function stmtAll(sql: string, ...args: any[]): any[] {
  const stmt = sqlDb.prepare(sql)
  const params = flatArgs(args)
  if (params.length) stmt.bind(params)
  const rows: any[] = []
  while (stmt.step()) rows.push({ ...stmt.getAsObject() })
  stmt.free()
  return rows
}

function stmtRun(sql: string, ...args: any[]): void {
  sqlDb.run(sql, flatArgs(args))
  debouncedPersist()
}

// Fluent wrapper: db.prepare(sql).get(...) / .all(...) / .run(...)
function prepare(sql: string) {
  return {
    get:  (...args: any[]) => stmtGet(sql, ...args),
    all:  (...args: any[]) => stmtAll(sql, ...args),
    run:  (...args: any[]) => stmtRun(sql, ...args),
  }
}

function persistDB(): void {
  const data = sqlDb.export()
  fs.writeFileSync(DB_PATH, Buffer.from(data))
}

let persistTimer: NodeJS.Timeout | null = null
function debouncedPersist(): void {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistDB()
    persistTimer = null
  }, 500)
}

// ─── DB access shim (exported for reminder.ts) ────────────────────────────────
// Exposes .prepare() so external consumers that imported `db` directly can
// still use the same interface (reminder.ts uses getReminders which uses the
// module-level helpers above, so no direct db access is needed externally).

// ─── Init ─────────────────────────────────────────────────────────────────────

export async function initDB(): Promise<void> {
  fs.mkdirSync(DB_DIR, { recursive: true })
  fs.mkdirSync(NOTES_DIR, { recursive: true })

  // Resolve the WASM file path. sql.js is externalized by Vite so it is
  // require()'d at runtime; we locate its dist directory via require.resolve.
  let wasmPath: string
  try {
    // require.resolve('sql.js') → .../node_modules/sql.js/dist/sql-wasm.js
    const sqlJsDist = path.dirname(require.resolve('sql.js'))
    wasmPath = path.join(sqlJsDist, 'sql-wasm.wasm')
  } catch {
    // Fallback: try relative to project root
    wasmPath = [
      path.join(app.getAppPath(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
      path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
    ].find(p => fs.existsSync(p)) ?? 'sql-wasm.wasm'
  }

  console.log('[DB] WASM path:', wasmPath, '| exists:', fs.existsSync(wasmPath))

  // locateFile 必须返回本地文件路径（非 URL），否则 sql.js 会尝试网络请求导致卡死
  const SQL = await initSqlJs({ locateFile: (_file: string) => wasmPath })
  console.log('[DB] sql.js loaded')

  if (fs.existsSync(DB_PATH)) {
    sqlDb = new SQL.Database(fs.readFileSync(DB_PATH))
  } else {
    sqlDb = new SQL.Database()
  }

  // Pragmas (sql.js uses db.run for single statements)
  sqlDb.run('PRAGMA journal_mode = WAL')
  sqlDb.run('PRAGMA foreign_keys = ON')

  createSchema()
  seedDefaultData()
  persistDB()
}

function createSchema(): void {
  // sql.js exec() handles multiple semicolon-separated statements
  sqlDb.exec(`
    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '无标题',
      folder_id TEXT,
      file_path TEXT NOT NULL,
      is_pinned INTEGER DEFAULT 0,
      is_archived INTEGER DEFAULT 0,
      is_deleted INTEGER DEFAULT 0,
      deleted_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (folder_id) REFERENCES folders(id)
    );

    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      color TEXT DEFAULT '#6B7280'
    );

    CREATE TABLE IF NOT EXISTS note_tags (
      note_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,
      PRIMARY KEY (note_id, tag_id),
      FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      notes TEXT,
      due_date INTEGER,
      priority INTEGER DEFAULT 0,
      is_completed INTEGER DEFAULT 0,
      completed_at INTEGER,
      repeat_rule TEXT,
      list_id TEXT,
      linked_note_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reminder_lists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#3B82F6',
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS ai_summaries (
      note_id TEXT PRIMARY KEY,
      summary TEXT NOT NULL,
      key_points TEXT,
      model_used TEXT,
      generated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)
}

function seedDefaultData(): void {
  const row = stmtGet('SELECT COUNT(*) as c FROM reminder_lists')
  if ((row?.c ?? 0) === 0) {
    stmtRun(
      `INSERT INTO reminder_lists (id, name, color, sort_order) VALUES (?, ?, ?, ?)`,
      uuidv4(), '提醒事项', '#3B82F6', 0
    )
  }
}

// ─── Folders ──────────────────────────────────────────────────────────────────

export function getFolders() {
  return stmtAll('SELECT * FROM folders ORDER BY sort_order, name')
}

export function createFolder(data: { name: string; parentId?: string }) {
  const now = Date.now()
  const id = uuidv4()
  stmtRun(
    `INSERT INTO folders (id, name, parent_id, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, 0, ?, ?)`,
    id, data.name, data.parentId ?? null, now, now
  )
  return stmtGet('SELECT * FROM folders WHERE id = ?', id)
}

export function updateFolder(
  id: string,
  data: Partial<{ name: string; parentId: string; sortOrder: number }>
) {
  const now = Date.now()
  const sets: string[] = ['updated_at = ?']
  const vals: any[] = [now]
  if (data.name !== undefined) { sets.push('name = ?'); vals.push(data.name) }
  if (data.parentId !== undefined) { sets.push('parent_id = ?'); vals.push(data.parentId) }
  if (data.sortOrder !== undefined) { sets.push('sort_order = ?'); vals.push(data.sortOrder) }
  vals.push(id)
  stmtRun(`UPDATE folders SET ${sets.join(', ')} WHERE id = ?`, ...vals)
  return stmtGet('SELECT * FROM folders WHERE id = ?', id)
}

export function deleteFolder(id: string) {
  stmtRun('DELETE FROM folders WHERE id = ?', id)
}

// ─── Notes ────────────────────────────────────────────────────────────────────

export function getNotes(folderId?: string) {
  if (folderId) {
    return stmtAll(
      `SELECT n.*, GROUP_CONCAT(t.name) as tag_names, GROUP_CONCAT(t.id) as tag_ids
       FROM notes n
       LEFT JOIN note_tags nt ON n.id = nt.note_id
       LEFT JOIN tags t ON nt.tag_id = t.id
       WHERE n.folder_id = ? AND n.is_deleted = 0 AND n.is_archived = 0
       GROUP BY n.id
       ORDER BY n.is_pinned DESC, n.updated_at DESC`,
      folderId
    )
  }
  return stmtAll(
    `SELECT n.*, GROUP_CONCAT(t.name) as tag_names, GROUP_CONCAT(t.id) as tag_ids
     FROM notes n
     LEFT JOIN note_tags nt ON n.id = nt.note_id
     LEFT JOIN tags t ON nt.tag_id = t.id
     WHERE n.is_deleted = 0 AND n.is_archived = 0
     GROUP BY n.id
     ORDER BY n.is_pinned DESC, n.updated_at DESC`
  )
}

export function createNote(data: { title?: string; folderId?: string; content?: string }) {
  const now = Date.now()
  const id = uuidv4()
  const filePath = path.join(NOTES_DIR, `${id}.md`)
  stmtRun(
    `INSERT INTO notes (id, title, folder_id, file_path, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    id, data.title ?? '无标题', data.folderId ?? null, filePath, now, now
  )
  fs.writeFileSync(filePath, data.content ?? '', 'utf-8')
  return stmtGet('SELECT * FROM notes WHERE id = ?', id)
}

export function updateNote(
  id: string,
  data: Partial<{
    title: string
    folderId: string | null
    isPinned: boolean
    isArchived: boolean
    isDeleted: boolean
  }>
) {
  const now = Date.now()
  const sets: string[] = ['updated_at = ?']
  const vals: any[] = [now]
  if (data.title !== undefined) { sets.push('title = ?'); vals.push(data.title) }
  if (data.folderId !== undefined) { sets.push('folder_id = ?'); vals.push(data.folderId) }
  if (data.isPinned !== undefined) { sets.push('is_pinned = ?'); vals.push(data.isPinned ? 1 : 0) }
  if (data.isArchived !== undefined) { sets.push('is_archived = ?'); vals.push(data.isArchived ? 1 : 0) }
  if (data.isDeleted !== undefined) {
    sets.push('is_deleted = ?')
    vals.push(data.isDeleted ? 1 : 0)
    if (data.isDeleted) { sets.push('deleted_at = ?'); vals.push(now) }
  }
  vals.push(id)
  stmtRun(`UPDATE notes SET ${sets.join(', ')} WHERE id = ?`, ...vals)
  return stmtGet('SELECT * FROM notes WHERE id = ?', id)
}

export function deleteNote(id: string) {
  const note = stmtGet('SELECT file_path FROM notes WHERE id = ?', id)
  if (note?.file_path && fs.existsSync(note.file_path)) fs.unlinkSync(note.file_path)
  stmtRun('DELETE FROM notes WHERE id = ?', id)
}

export function searchNotes(query: string) {
  return stmtAll(
    `SELECT * FROM notes
     WHERE is_deleted = 0 AND is_archived = 0 AND title LIKE ?
     ORDER BY updated_at DESC LIMIT 30`,
    `%${query}%`
  )
}

export function getAllNotesForSearch() {
  return stmtAll(
    `SELECT id, title, file_path FROM notes
     WHERE is_deleted = 0 AND is_archived = 0
     ORDER BY updated_at DESC`
  )
}

// ─── Tags ─────────────────────────────────────────────────────────────────────

export function getTags() {
  return stmtAll('SELECT * FROM tags ORDER BY name')
}

export function createTag(name: string, color = '#6B7280') {
  const id = uuidv4()
  stmtRun('INSERT OR IGNORE INTO tags (id, name, color) VALUES (?, ?, ?)', id, name, color)
  return stmtGet('SELECT * FROM tags WHERE name = ?', name)
}

export function setNoteTags(noteId: string, tagIds: string[]) {
  stmtRun('DELETE FROM note_tags WHERE note_id = ?', noteId)
  for (const tagId of tagIds) {
    stmtRun('INSERT INTO note_tags (note_id, tag_id) VALUES (?, ?)', noteId, tagId)
  }
}

// ─── Reminders ────────────────────────────────────────────────────────────────

export function getReminders() {
  return stmtAll(
    'SELECT * FROM reminders ORDER BY is_completed ASC, due_date ASC, created_at DESC'
  )
}

export function createReminder(data: {
  title: string
  notes?: string
  dueDate?: number
  priority?: number
  repeatRule?: string
  listId?: string
  linkedNoteId?: string
}) {
  const now = Date.now()
  const id = uuidv4()
  stmtRun(
    `INSERT INTO reminders
       (id, title, notes, due_date, priority, repeat_rule, list_id, linked_note_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    data.title,
    data.notes ?? null,
    data.dueDate ?? null,
    data.priority ?? 0,
    data.repeatRule ?? null,
    data.listId ?? null,
    data.linkedNoteId ?? null,
    now,
    now
  )
  return stmtGet('SELECT * FROM reminders WHERE id = ?', id)
}

export function updateReminder(id: string, data: any) {
  const now = Date.now()
  const sets: string[] = ['updated_at = ?']
  const vals: any[] = [now]
  const fields: Record<string, string> = {
    title: 'title',
    notes: 'notes',
    dueDate: 'due_date',
    priority: 'priority',
    repeatRule: 'repeat_rule',
    listId: 'list_id',
    linkedNoteId: 'linked_note_id',
    isCompleted: 'is_completed',
    completedAt: 'completed_at',
  }
  for (const [key, col] of Object.entries(fields)) {
    if (data[key] !== undefined) { sets.push(`${col} = ?`); vals.push(data[key]) }
  }
  vals.push(id)
  stmtRun(`UPDATE reminders SET ${sets.join(', ')} WHERE id = ?`, ...vals)
  return stmtGet('SELECT * FROM reminders WHERE id = ?', id)
}

export function updateReminderDueDate(id: string, dueDate: number) {
  const now = Date.now()
  stmtRun(
    `UPDATE reminders SET due_date = ?, updated_at = ? WHERE id = ?`,
    dueDate, now, id
  )
}

export function deleteReminder(id: string) {
  stmtRun('DELETE FROM reminders WHERE id = ?', id)
}

export function completeReminder(id: string) {
  const now = Date.now()
  stmtRun(
    `UPDATE reminders SET is_completed = 1, completed_at = ?, updated_at = ? WHERE id = ?`,
    now, now, id
  )
  return stmtGet('SELECT * FROM reminders WHERE id = ?', id)
}

export function getReminderLists() {
  return stmtAll('SELECT * FROM reminder_lists ORDER BY sort_order, name')
}

export function createReminderList(data: { name: string; color?: string }) {
  const id = uuidv4()
  stmtRun(
    `INSERT INTO reminder_lists (id, name, color, sort_order) VALUES (?, ?, ?, 0)`,
    id, data.name, data.color ?? '#3B82F6'
  )
  return stmtGet('SELECT * FROM reminder_lists WHERE id = ?', id)
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export function getSetting(key: string): string | null {
  return stmtGet('SELECT value FROM settings WHERE key = ?', key)?.value ?? null
}

export function setSetting(key: string, value: string) {
  stmtRun('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', key, value)
}

export function getNotesDir() {
  return NOTES_DIR
}
