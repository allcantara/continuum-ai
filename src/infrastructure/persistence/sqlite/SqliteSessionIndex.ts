import type { SessionIndex, SessionIndexEntry, SessionSearchQuery } from '../../../domain/ports/SessionStore.js';
import type { Session } from '../../../domain/session/Session.js';
import type { SessionContent } from '../../../domain/session/SessionContent.js';
import type { SessionId } from '../../../domain/session/SessionId.js';
import { sessionSummaryFrom } from '../../../domain/session/SessionSummary.js';
import { indexPath, resolveContinuumHome } from '../../config/ContinuumHome.js';

type SqliteDatabase = {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): void;
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
  };
  close(): void;
};

export class SqliteSessionIndex implements SessionIndex {
  private db: SqliteDatabase | null = null;
  private ftsAvailable = false;

  constructor(private readonly home: string = resolveContinuumHome()) {}

  isAvailable(): boolean {
    return this.db !== null;
  }

  async initialize(): Promise<void> {
    try {
      var sqlite = await import('node:sqlite');
      this.db = new sqlite.DatabaseSync(indexPath(this.home)) as unknown as SqliteDatabase;
      // Multiple processes (CLI invocations, MCP server instances) can open this file at
      // the same time. Without a busy timeout, a concurrent writer makes SQLite throw
      // "database is locked" immediately instead of waiting — busy_timeout must be the
      // very first statement, before schema creation, so that race is covered too.
      this.db.exec('PRAGMA busy_timeout = 5000');
      this.db.exec('PRAGMA journal_mode = WAL');
      this.createSchema();
      this.ensureScopeSlugColumn();
      this.ftsAvailable = this.checkFts5();
    } catch {
      this.db = null;
    }
  }

  async upsert(entry: SessionIndexEntry, content: SessionContent): Promise<void> {
    var db = this.requireDb();
    db.prepare(`
      INSERT OR REPLACE INTO sessions (id, scope_hash, scope_slug, scope_type, summary, created_at, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.id,
      entry.scopeHash,
      entry.scopeSlug,
      entry.scopeType,
      entry.summary,
      entry.createdAt.toISOString(),
      entry.status,
    );

    if (this.ftsAvailable) {
      db.prepare(`INSERT OR REPLACE INTO sessions_fts (id, scope_hash, content, summary) VALUES (?, ?, ?, ?)`)
        .run(entry.id, entry.scopeHash, content, entry.summary);
    }
  }

  async search(query: SessionSearchQuery): Promise<readonly SessionIndexEntry[]> {
    var db = this.requireDb();

    if (query.query && this.ftsAvailable) {
      return this.searchFts(db, query);
    }

    return this.searchSimple(db, query);
  }

  async listAllEntries(): Promise<readonly SessionIndexEntry[]> {
    var db = this.requireDb();
    var rows = db
      .prepare('SELECT id, scope_hash, scope_slug, scope_type, summary, created_at, status FROM sessions')
      .all() as Record<string, string>[];
    return rows.map(rowToEntry);
  }

  async updateStatus(id: SessionId, scopeHash: string, status: 'active' | 'trashed'): Promise<void> {
    var db = this.requireDb();
    db.prepare(`UPDATE sessions SET status = ? WHERE id = ? AND scope_hash = ?`).run(status, id, scopeHash);
  }

  async rebuildFromSessions(sessions: readonly Session[]): Promise<void> {
    var db = this.requireDb();
    db.exec('DELETE FROM sessions');
    if (this.ftsAvailable) {
      db.exec('DELETE FROM sessions_fts');
    }

    for (var session of sessions) {
      await this.upsert(
        {
          id: session.id,
          scopeHash: session.scope.hash,
          scopeSlug: session.scope.slug,
          scopeType: session.scope.type,
          summary: session.summary,
          createdAt: session.createdAt,
          status: session.status,
        },
        session.content,
      );
    }
  }

  async count(): Promise<number> {
    var db = this.requireDb();
    var row = db.prepare('SELECT COUNT(*) as count FROM sessions').get() as { count: number };
    return row.count;
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }

  private requireDb(): SqliteDatabase {
    if (!this.db) {
      throw new Error('SQLite index is not available');
    }
    return this.db;
  }

  private createSchema(): void {
    var db = this.requireDb();
    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT NOT NULL,
        scope_hash TEXT NOT NULL,
        scope_slug TEXT NOT NULL DEFAULT '',
        scope_type TEXT NOT NULL,
        summary TEXT NOT NULL,
        created_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        PRIMARY KEY (id, scope_hash)
      )
    `);

    try {
      db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS sessions_fts USING fts5(
          id UNINDEXED,
          scope_hash UNINDEXED,
          content,
          summary
        )
      `);
    } catch {
      this.ftsAvailable = false;
    }
  }

  private ensureScopeSlugColumn(): void {
    var db = this.requireDb();
    var columns = db.prepare(`PRAGMA table_info(sessions)`).all() as Array<{ name: string }>;
    var hasScopeSlug = columns.some((column) => column.name === 'scope_slug');
    if (!hasScopeSlug) {
      db.exec(`ALTER TABLE sessions ADD COLUMN scope_slug TEXT NOT NULL DEFAULT ''`);
    }
  }

  private checkFts5(): boolean {
    try {
      var db = this.requireDb();
      var row = db
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='sessions_fts'`)
        .get() as { name: string } | undefined;
      return row !== undefined;
    } catch {
      return false;
    }
  }

  private searchFts(db: SqliteDatabase, query: SessionSearchQuery): readonly SessionIndexEntry[] {
    var status = query.status ?? 'active';
    var sql = `
      SELECT s.id, s.scope_hash, s.scope_slug, s.scope_type, s.summary, s.created_at, s.status
      FROM sessions s
      JOIN sessions_fts fts ON s.id = fts.id AND s.scope_hash = fts.scope_hash
      WHERE sessions_fts MATCH ? AND s.status = ?
    `;
    var params: unknown[] = [query.query, status];

    if (query.scopeHash) {
      sql += ' AND s.scope_hash = ?';
      params.push(query.scopeHash);
    }

    sql += ' ORDER BY s.created_at DESC';

    var rows = db.prepare(sql).all(...params) as Record<string, string>[];
    return rows.map(rowToEntry);
  }

  private searchSimple(db: SqliteDatabase, query: SessionSearchQuery): readonly SessionIndexEntry[] {
    var status = query.status ?? 'active';
    var sql = 'SELECT id, scope_hash, scope_slug, scope_type, summary, created_at, status FROM sessions WHERE status = ?';
    var params: unknown[] = [status];

    if (query.scopeHash) {
      sql += ' AND scope_hash = ?';
      params.push(query.scopeHash);
    }

    if (query.query) {
      sql += ' AND (summary LIKE ? OR id LIKE ? OR scope_slug LIKE ?)';
      var pattern = `%${query.query}%`;
      params.push(pattern, pattern, pattern);
    }

    sql += ' ORDER BY created_at DESC';

    var rows = db.prepare(sql).all(...params) as Record<string, string>[];
    return rows.map(rowToEntry);
  }
}

function rowToEntry(row: Record<string, string>): SessionIndexEntry {
  return {
    id: row.id as SessionId,
    scopeHash: row.scope_hash,
    scopeSlug: row.scope_slug ?? '',
    scopeType: row.scope_type as 'project' | 'workspace',
    summary: sessionSummaryFrom(row.summary),
    createdAt: new Date(row.created_at),
    status: row.status as 'active' | 'trashed',
  };
}
