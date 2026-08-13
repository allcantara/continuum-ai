import { randomUUID } from 'node:crypto';
import type {
  RegisteredScope,
  ScopeAlias,
  ScopeRegistry,
} from '../../../domain/ports/ScopeRegistry.js';
import type { Scope } from '../../../domain/scope/Scope.js';
import { scopeHash, scopeKind } from '../../../domain/scope/Scope.js';
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

const KIND_PRIORITY: Record<string, number> = {
  remote: 0,
  git_root: 1,
  path: 2,
};

export class SqliteScopeRegistry implements ScopeRegistry {
  private db: SqliteDatabase | null = null;

  constructor(private readonly home: string = resolveContinuumHome()) {}

  isAvailable(): boolean {
    return this.db !== null;
  }

  async initialize(): Promise<void> {
    try {
      var sqlite = await import('node:sqlite');
      this.db = new sqlite.DatabaseSync(indexPath(this.home)) as unknown as SqliteDatabase;
      this.db.exec('PRAGMA busy_timeout = 5000');
      this.db.exec('PRAGMA journal_mode = WAL');
      this.createSchema();
    } catch {
      this.db = null;
    }
  }

  async findByAliases(aliases: readonly ScopeAlias[]): Promise<RegisteredScope | null> {
    if (aliases.length === 0) {
      return null;
    }

    var db = this.requireDb();
    var placeholders = aliases.map(() => '?').join(', ');
    var rows = db
      .prepare(`
        SELECT s.scope_id, s.scope_hash, s.scope_type, s.slug, a.alias, a.alias_kind
        FROM scope_aliases a
        JOIN scopes s ON s.scope_id = a.scope_id
        WHERE a.alias IN (${placeholders})
      `)
      .all(...aliases.map((alias) => alias.alias)) as Record<string, string>[];

    if (rows.length === 0) {
      return null;
    }

    var best = rows.reduce((current, row) => {
      if (!current) {
        return row;
      }
      var currentKind = KIND_PRIORITY[current.alias_kind] ?? 99;
      var rowKind = KIND_PRIORITY[row.alias_kind] ?? 99;
      return rowKind < currentKind ? row : current;
    }, rows[0]!);

    return {
      scopeId: best.scope_id,
      scopeHash: best.scope_hash,
      scopeType: best.scope_type as 'project' | 'workspace',
      slug: best.slug,
    };
  }

  async register(scope: Scope, aliases: readonly ScopeAlias[]): Promise<void> {
    var db = this.requireDb();
    var hash = scopeHash(scope);
    var existing = db
      .prepare('SELECT scope_id FROM scopes WHERE scope_hash = ?')
      .get(hash) as Record<string, string> | undefined;

    var scopeId = existing?.scope_id ?? randomUUID();
    var slug = scope.slug ?? '';

    db.prepare(`
      INSERT OR REPLACE INTO scopes (scope_id, scope_hash, scope_type, slug, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(scopeId, hash, scopeKind(scope), slug, new Date().toISOString());

    for (var alias of aliases) {
      db.prepare(`
        INSERT OR IGNORE INTO scope_aliases (alias, scope_id, alias_kind)
        VALUES (?, ?, ?)
      `).run(alias.alias, scopeId, alias.kind);
    }
  }

  async countScopes(): Promise<number> {
    var db = this.requireDb();
    var row = db.prepare('SELECT COUNT(*) AS count FROM scopes').get() as { count: number };
    return row.count;
  }

  private createSchema(): void {
    var db = this.requireDb();
    db.exec(`
      CREATE TABLE IF NOT EXISTS scopes (
        scope_id TEXT PRIMARY KEY,
        scope_hash TEXT NOT NULL UNIQUE,
        scope_type TEXT NOT NULL CHECK(scope_type IN ('project', 'workspace')),
        slug TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS scope_aliases (
        alias TEXT PRIMARY KEY,
        scope_id TEXT NOT NULL,
        alias_kind TEXT NOT NULL DEFAULT 'path'
      );
      CREATE INDEX IF NOT EXISTS idx_scope_aliases_scope_id ON scope_aliases(scope_id);
    `);
  }

  private requireDb(): SqliteDatabase {
    if (!this.db) {
      throw new Error('SQLite scope registry is not available');
    }
    return this.db;
  }
}
