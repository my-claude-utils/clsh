import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface PtySessionRow {
  id: string;
  tmux_name: string;
  shell: string;
  name: string;
  cwd: string;
  created_at: string;
}

export interface PasswordRow {
  id: number;
  hash: string;
  created_at: string;
  updated_at: string;
}

export interface BiometricRow {
  id: number;
  credential_id: string;
  user_id: string;
  created_at: string;
}

export interface DbStatements {
  insertBootstrapToken: Database.Statement<[string, string]>;
  getBootstrapToken: Database.Statement<[string], { id: string; hash: string; created_at: string }>;
  deleteBootstrapToken: Database.Statement<[string]>;
  insertSession: Database.Statement<[string, string, string]>;
  updateSessionLastSeen: Database.Statement<[string]>;
  getSession: Database.Statement<[string], { id: string; jwt_id: string; email: string; created_at: string; last_seen: string }>;
  insertPtySession: Database.Statement<[string, string, string, string, string]>;
  getPtySession: Database.Statement<[string], PtySessionRow>;
  listPtySessions: Database.Statement<[], PtySessionRow>;
  updatePtySession: Database.Statement<[string, string, string]>;
  deletePtySession: Database.Statement<[string]>;
  deleteAllPtySessions: Database.Statement<[]>;
  getPassword: Database.Statement<[], PasswordRow>;
  upsertPassword: Database.Statement<[string]>;
  deletePassword: Database.Statement<[]>;
  getBiometric: Database.Statement<[], BiometricRow>;
  upsertBiometric: Database.Statement<[string, string]>;
  deleteBiometric: Database.Statement<[]>;
  getClientHash: Database.Statement<[], { id: number; hash: string }>;
  upsertClientHash: Database.Statement<[string]>;
}

export interface DbContext {
  db: Database.Database;
  statements: DbStatements;
}

/**
 * Initializes the SQLite database at the given path.
 * Creates the directory if needed, enables WAL mode, and creates all tables.
 * Returns the database instance and prepared statements.
 */
export function initDatabase(dbPath: string): DbContext {
  // Ensure the directory exists
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Create schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS bootstrap_tokens (
      id TEXT PRIMARY KEY,
      hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      jwt_id TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS allowed_emails (
      email TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pty_sessions (
      id TEXT PRIMARY KEY,
      tmux_name TEXT NOT NULL UNIQUE,
      shell TEXT NOT NULL DEFAULT 'zsh',
      name TEXT NOT NULL DEFAULT '',
      cwd TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_password (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS lock_biometric (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      credential_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS lock_client_hash (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      hash TEXT NOT NULL
    );
  `);

  // Prepare statements for repeated use
  const statements: DbStatements = {
    insertBootstrapToken: db.prepare(
      'INSERT INTO bootstrap_tokens (id, hash) VALUES (?, ?)',
    ),
    getBootstrapToken: db.prepare(
      'SELECT id, hash, created_at FROM bootstrap_tokens WHERE hash = ?',
    ),
    deleteBootstrapToken: db.prepare(
      'DELETE FROM bootstrap_tokens WHERE hash = ?',
    ),
    insertSession: db.prepare(
      'INSERT INTO sessions (id, jwt_id, email) VALUES (?, ?, ?)',
    ),
    updateSessionLastSeen: db.prepare(
      "UPDATE sessions SET last_seen = datetime('now') WHERE id = ?",
    ),
    getSession: db.prepare(
      'SELECT id, jwt_id, email, created_at, last_seen FROM sessions WHERE id = ?',
    ),
    insertPtySession: db.prepare(
      'INSERT INTO pty_sessions (id, tmux_name, shell, name, cwd) VALUES (?, ?, ?, ?, ?)',
    ),
    getPtySession: db.prepare(
      'SELECT id, tmux_name, shell, name, cwd, created_at FROM pty_sessions WHERE id = ?',
    ),
    listPtySessions: db.prepare(
      'SELECT id, tmux_name, shell, name, cwd, created_at FROM pty_sessions',
    ),
    updatePtySession: db.prepare(
      'UPDATE pty_sessions SET name = ?, cwd = ? WHERE id = ?',
    ),
    deletePtySession: db.prepare(
      'DELETE FROM pty_sessions WHERE id = ?',
    ),
    deleteAllPtySessions: db.prepare(
      'DELETE FROM pty_sessions',
    ),
    getPassword: db.prepare(
      'SELECT id, hash, created_at, updated_at FROM user_password WHERE id = 1',
    ),
    upsertPassword: db.prepare(
      `INSERT INTO user_password (id, hash) VALUES (1, ?)
       ON CONFLICT (id) DO UPDATE SET hash = excluded.hash, updated_at = datetime('now')`,
    ),
    deletePassword: db.prepare(
      'DELETE FROM user_password WHERE id = 1',
    ),
    getBiometric: db.prepare(
      'SELECT id, credential_id, user_id, created_at FROM lock_biometric WHERE id = 1',
    ),
    upsertBiometric: db.prepare(
      `INSERT INTO lock_biometric (id, credential_id, user_id) VALUES (1, ?, ?)
       ON CONFLICT (id) DO UPDATE SET credential_id = excluded.credential_id, user_id = excluded.user_id`,
    ),
    deleteBiometric: db.prepare(
      'DELETE FROM lock_biometric WHERE id = 1',
    ),
    getClientHash: db.prepare(
      'SELECT id, hash FROM lock_client_hash WHERE id = 1',
    ),
    upsertClientHash: db.prepare(
      `INSERT INTO lock_client_hash (id, hash) VALUES (1, ?)
       ON CONFLICT (id) DO UPDATE SET hash = excluded.hash`,
    ),
  };

  return { db, statements };
}
