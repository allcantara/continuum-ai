import { describe, expect, it, vi } from 'vitest';
import { GetSessionUseCase } from '../../src/application/load/GetSessionUseCase.js';
import { ListScopesUseCase } from '../../src/application/list/ListScopesUseCase.js';
import { projectScope } from '../../src/domain/scope/Scope.js';
import { projectHashFromPath } from '../../src/domain/scope/ProjectHash.js';
import { createSession } from '../../src/domain/session/Session.js';
import { sessionContentFrom } from '../../src/domain/session/SessionContent.js';
import { sessionIdFrom } from '../../src/domain/session/SessionId.js';
import { sessionSummaryFrom } from '../../src/domain/session/SessionSummary.js';
import type { SessionIndex, SessionIndexEntry, SessionStore } from '../../src/domain/ports/SessionStore.js';

function createMocks() {
  var sessionStore: SessionStore = {
    save: vi.fn(),
    saveWithUniqueTimestamp: vi.fn(),
    findById: vi.fn().mockResolvedValue(null),
    findLatest: vi.fn(),
    findRecent: vi.fn(),
    moveToTrash: vi.fn(),
    restoreFromTrash: vi.fn(),
    moveScopeToTrash: vi.fn(),
    restoreScopeFromTrash: vi.fn(),
    listAllSessions: vi.fn().mockResolvedValue([]),
    countAllSessions: vi.fn().mockResolvedValue(0),
  };

  var sessionIndex: SessionIndex = {
    upsert: vi.fn(),
    search: vi.fn().mockResolvedValue([]),
    listAllEntries: vi.fn().mockResolvedValue([]),
    updateStatus: vi.fn(),
    rebuildFromSessions: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
    isAvailable: vi.fn().mockReturnValue(true),
  };

  var indexReconciliation = {
    reconcileIfNeeded: vi.fn().mockResolvedValue(undefined),
  };

  return { sessionStore, sessionIndex, indexReconciliation };
}

function indexEntry(overrides: Partial<SessionIndexEntry> & Pick<SessionIndexEntry, 'id' | 'scopeHash'>): SessionIndexEntry {
  return {
    scopeSlug: 'app',
    scopeType: 'project',
    summary: sessionSummaryFrom('Summary'),
    createdAt: new Date('2026-08-10T14:30:00Z'),
    status: 'active',
    ...overrides,
  };
}

describe('ListScopesUseCase', () => {
  it('groups active sessions by project and counts them', async () => {
    var { sessionIndex, indexReconciliation } = createMocks();
    var hashA = projectHashFromPath('/a');
    var hashB = projectHashFromPath('/b');
    vi.mocked(sessionIndex.search).mockResolvedValue([
      indexEntry({ id: sessionIdFrom('2026-08-10-1000'), scopeHash: hashA, scopeSlug: 'alpha' }),
      indexEntry({ id: sessionIdFrom('2026-08-10-1100'), scopeHash: hashA, scopeSlug: 'alpha' }),
      indexEntry({ id: sessionIdFrom('2026-08-10-1200'), scopeHash: hashB, scopeSlug: 'beta' }),
    ]);

    var result = await new ListScopesUseCase(sessionIndex, indexReconciliation).execute();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.projects).toEqual([
        { hash: hashA, slug: 'alpha', type: 'project', sessionCount: 2 },
        { hash: hashB, slug: 'beta', type: 'project', sessionCount: 1 },
      ]);
    }
  });
});

describe('GetSessionUseCase', () => {
  it('returns the full markdown body without truncation', async () => {
    var { sessionStore, sessionIndex, indexReconciliation } = createMocks();
    var scope = projectScope(projectHashFromPath('/test/ui'), 'ui');
    var sessionId = sessionIdFrom('2026-08-10-1430');
    var content = sessionContentFrom('x'.repeat(50_000));
    vi.mocked(sessionIndex.listAllEntries).mockResolvedValue([
      indexEntry({ id: sessionId, scopeHash: scope.hash, scopeSlug: scope.slug }),
    ]);
    vi.mocked(sessionStore.findById).mockResolvedValue(
      createSession({
        id: sessionId,
        scope,
        content,
        summary: sessionSummaryFrom('Summary'),
        createdAt: new Date('2026-08-10T14:30:00Z'),
      }),
    );

    var result = await new GetSessionUseCase(sessionStore, sessionIndex, indexReconciliation).execute({
      scopeHash: scope.hash,
      sessionId,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.content.length).toBe(50_000);
      expect(result.value.sessionId).toBe('2026-08-10-1430');
    }
  });

  it('returns an error when the project hash is unknown', async () => {
    var { sessionStore, sessionIndex, indexReconciliation } = createMocks();
    var result = await new GetSessionUseCase(sessionStore, sessionIndex, indexReconciliation).execute({
      scopeHash: 'missing',
      sessionId: sessionIdFrom('2026-08-10-1430'),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('Project not found');
    }
  });
});
