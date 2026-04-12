// eslint-disable-next-line @typescript-eslint/no-require-imports
const Database = require('better-sqlite3') as typeof import('better-sqlite3')
import type BetterSqlite3 from 'better-sqlite3'
import fs from 'fs'
import path from 'path'

export interface UserProfile {
  userId: string
  displayName: string
  memo: string
  updatedAt: string
}

export interface HistoryRow {
  userId: string
  channelId: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

const DB_PATH = process.env.RAILWAY_ENVIRONMENT ? '/data/bot.db' : path.resolve('./bot.db')

let _db: BetterSqlite3.Database | null = null

export function getDb(): BetterSqlite3.Database {
  if (!_db) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })
    _db = new Database(DB_PATH) as BetterSqlite3.Database
    _db.pragma('journal_mode = WAL')
    initTables(_db)
  }
  return _db
}

function initTables(db: BetterSqlite3.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      user_id      TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      memo         TEXT DEFAULT '',
      updated_at   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversation_history (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      role       TEXT NOT NULL,
      content    TEXT NOT NULL,
      timestamp  TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_history_channel ON conversation_history(channel_id, id);
    CREATE INDEX IF NOT EXISTS idx_history_user_channel ON conversation_history(user_id, channel_id);
  `)
}

export function getProfile(userId: string): UserProfile | null {
  const db = getDb()
  const row = db
    .prepare('SELECT user_id, display_name, memo, updated_at FROM user_profiles WHERE user_id = ?')
    .get(userId) as { user_id: string; display_name: string; memo: string; updated_at: string } | undefined
  if (!row) return null
  return { userId: row.user_id, displayName: row.display_name, memo: row.memo, updatedAt: row.updated_at }
}

export function upsertProfile(userId: string, displayName: string, memo: string): void {
  const db = getDb()
  db.prepare(`
    INSERT INTO user_profiles (user_id, display_name, memo, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      display_name = excluded.display_name,
      memo = excluded.memo,
      updated_at = excluded.updated_at
  `).run(userId, displayName, memo, new Date().toISOString())
}

export function appendMemoToProfile(userId: string, displayName: string, newInfo: string): void {
  const profile = getProfile(userId)
  const current = profile?.memo ?? ''
  const updated = current ? `${current}\n${newInfo}` : newInfo
  upsertProfile(userId, displayName, updated)
}

export function getHistory(channelId: string, limit: number): HistoryRow[] {
  const db = getDb()
  const rows = db
    .prepare(`
      SELECT user_id, channel_id, role, content, timestamp
      FROM conversation_history
      WHERE channel_id = ?
      ORDER BY id DESC
      LIMIT ?
    `)
    .all(channelId, limit) as HistoryRow[]
  return rows.reverse()
}

export function addMessage(
  userId: string,
  channelId: string,
  role: 'user' | 'assistant',
  content: string,
): void {
  const db = getDb()
  db.prepare(`
    INSERT INTO conversation_history (user_id, channel_id, role, content, timestamp)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, channelId, role, content, new Date().toISOString())
}

export function clearChannelHistory(channelId: string): void {
  const db = getDb()
  db.prepare('DELETE FROM conversation_history WHERE channel_id = ?').run(channelId)
}

export function deleteUserData(userId: string): void {
  const db = getDb()
  db.prepare('DELETE FROM user_profiles WHERE user_id = ?').run(userId)
  db.prepare('DELETE FROM conversation_history WHERE user_id = ?').run(userId)
}

export function getUserTurnCount(userId: string, channelId: string): number {
  const db = getDb()
  const row = db
    .prepare(`
      SELECT COUNT(*) as cnt
      FROM conversation_history
      WHERE user_id = ? AND channel_id = ? AND role = 'user'
    `)
    .get(userId, channelId) as { cnt: number }
  return row.cnt
}
