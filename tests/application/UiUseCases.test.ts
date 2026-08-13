import { describe, expect, it, vi } from 'vitest';
import { GetSessionUseCase } from '../../src/application/load/GetSessionUseCase.js';
import { ListIndexUseCase } from '../../src/application/list/ListIndexUseCase.js';
import { ListScopesUseCase } from '../../src/application/list/ListScopesUseCase.js';
import { ResolveScopeFromHashUseCase } from '../../src/application/scope/ResolveScopeFromHashUseCase.js';
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

function getSessionUseCase(
  sessionStore: SessionStore,
  sessionIndex: SessionIndex,
  indexReconciliation: { reconcileIfNeeded: () => Promise<void> },
) {
  return new GetSessionUseCase(
    sessionStore,
    new ResolveScopeFromHashUseCase(sessionIndex, indexReconciliation),
  );
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

describe('ListIndexUseCase', () => {
  it('reconciles then returns every index row', async () => {
    var { sessionIndex, indexReconciliation } = createMocks();
    var sessionId = sessionIdFrom('2026-08-10-1430');
    var scopeHash = projectHashFromPath('/test/ui');
    vi.mocked(sessionIndex.listAllEntries).mockResolvedValue([
      indexEntry({ id: sessionId, scopeHash, scopeSlug: 'ui', status: 'trashed' }),
    ]);

    var result = await new ListIndexUseCase(sessionIndex, indexReconciliation).execute();

    expect(indexReconciliation.reconcileIfNeeded).toHaveBeenCalledOnce();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.entries).toEqual([
        {
          id: '2026-08-10-1430',
          scopeHash,
          scopeSlug: 'ui',
          scopeType: 'project',
          summary: 'Summary',
          createdAt: '2026-08-10T14:30:00.000Z',
          status: 'trashed',
        },
      ]);
    }
  });
});

describe('ResolveScopeFromHashUseCase', () => {
  it('reconciles then resolves an active scope by hash', async () => {
    var { sessionIndex, indexReconciliation } = createMocks();
    var scope = projectScope(projectHashFromPath('/test/ui'), 'ui');
    vi.mocked(sessionIndex.search).mockResolvedValue([
      indexEntry({ id: sessionIdFrom('2026-08-10-1430'), scopeHash: scope.hash, scopeSlug: scope.slug }),
    ]);

    var resolved = await new ResolveScopeFromHashUseCase(sessionIndex, indexReconciliation).execute(scope.hash);

    expect(indexReconciliation.reconcileIfNeeded).toHaveBeenCalledOnce();
    expect(sessionIndex.search).toHaveBeenCalledWith({ scopeHash: scope.hash, status: 'active' });
    expect(resolved).toEqual(scope);
  });

  it('falls back to a trashed scope when no active row exists', async () => {
    var { sessionIndex, indexReconciliation } = createMocks();
    var scope = projectScope(projectHashFromPath('/test/ui'), 'ui');
    vi.mocked(sessionIndex.search)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        indexEntry({
          id: sessionIdFrom('2026-08-10-1430'),
          scopeHash: scope.hash,
          scopeSlug: scope.slug,
          status: 'trashed',
        }),
      ]);

    var resolved = await new ResolveScopeFromHashUseCase(sessionIndex, indexReconciliation).execute(scope.hash);

    expect(sessionIndex.search).toHaveBeenNthCalledWith(2, { scopeHash: scope.hash, status: 'trashed' });
    expect(resolved).toEqual(scope);
  });
});

describe('GetSessionUseCase', () => {
  it('returns the full markdown body without truncation', async () => {
    var { sessionStore, sessionIndex, indexReconciliation } = createMocks();
    var scope = projectScope(projectHashFromPath('/test/ui'), 'ui');
    var sessionId = sessionIdFrom('2026-08-10-1430');
    var content = sessionContentFrom('x'.repeat(50_000));
    vi.mocked(sessionIndex.search).mockResolvedValue([
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

    var result = await getSessionUseCase(sessionStore, sessionIndex, indexReconciliation).execute({
      scopeHash: scope.hash,
      sessionId,
    });

    expect(indexReconciliation.reconcileIfNeeded).toHaveBeenCalledOnce();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.content.length).toBe(50_000);
      expect(result.value.sessionId).toBe('2026-08-10-1430');
    }
  });

  it('returns not_found when the project hash is unknown', async () => {
    var { sessionStore, sessionIndex, indexReconciliation } = createMocks();
    var result = await getSessionUseCase(sessionStore, sessionIndex, indexReconciliation).execute({
      scopeHash: 'missing',
      sessionId: sessionIdFrom('2026-08-10-1430'),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('Project not found');
      expect(result.code).toBe('not_found');
    }
  });

  it('returns not_found when the session id is unknown', async () => {
    var { sessionStore, sessionIndex, indexReconciliation } = createMocks();
    var scope = projectScope(projectHashFromPath('/test/ui'), 'ui');
    vi.mocked(sessionIndex.search).mockResolvedValue([
      indexEntry({ id: sessionIdFrom('2026-08-10-1430'), scopeHash: scope.hash, scopeSlug: scope.slug }),
    ]);

    var result = await getSessionUseCase(sessionStore, sessionIndex, indexReconciliation).execute({
      scopeHash: scope.hash,
      sessionId: sessionIdFrom('2026-01-01-0000'),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('Session not found');
      expect(result.code).toBe('not_found');
    }
  });
});
