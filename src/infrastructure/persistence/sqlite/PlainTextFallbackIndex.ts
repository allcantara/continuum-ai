import type { SessionIndex, SessionIndexEntry, SessionSearchQuery } from '../../../domain/ports/SessionStore.js';
import type { Session } from '../../../domain/session/Session.js';
import type { SessionContent } from '../../../domain/session/SessionContent.js';
import type { SessionId } from '../../../domain/session/SessionId.js';

export class PlainTextFallbackIndex implements SessionIndex {
  private entries: SessionIndexEntry[] = [];
  private contentMap = new Map<string, string>();

  isAvailable(): boolean {
    return true;
  }

  async upsert(entry: SessionIndexEntry, content: SessionContent): Promise<void> {
    this.entries = this.entries.filter(
      (e) => !(e.id === entry.id && e.scopeHash === entry.scopeHash),
    );
    this.entries.push(entry);
    this.contentMap.set(`${entry.scopeHash}:${entry.id}`, content);
  }

  async listAllEntries(): Promise<readonly SessionIndexEntry[]> {
    return [...this.entries];
  }

  async search(query: SessionSearchQuery): Promise<readonly SessionIndexEntry[]> {
    var status = query.status ?? 'active';
    var results = this.entries.filter((e) => e.status === status);

    if (query.scopeHash) {
      results = results.filter((e) => e.scopeHash === query.scopeHash);
    }

    if (query.query) {
      var lowerQuery = query.query.toLowerCase();
      results = results.filter((e) => {
        var content = this.contentMap.get(`${e.scopeHash}:${e.id}`) ?? '';
        return (
          e.summary.toLowerCase().includes(lowerQuery) ||
          (e.scopeSlug ?? '').toLowerCase().includes(lowerQuery) ||
          content.toLowerCase().includes(lowerQuery) ||
          e.id.includes(lowerQuery)
        );
      });
    }

    return results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async updateStatus(id: SessionId, scopeHash: string, status: 'active' | 'trashed'): Promise<void> {
    this.entries = this.entries.map((e) =>
      e.id === id && e.scopeHash === scopeHash ? { ...e, status } : e,
    );
  }

  async rebuildFromSessions(sessions: readonly Session[]): Promise<void> {
    this.entries = [];
    this.contentMap.clear();

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
    return this.entries.length;
  }
}
