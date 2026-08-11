import { describe, expect, it, vi } from 'vitest';
import { LoadSessionUseCase } from '../../src/application/load/LoadSessionUseCase.js';
import { SaveSessionUseCase } from '../../src/application/save/SaveSessionUseCase.js';
import { projectScope } from '../../src/domain/scope/Scope.js';
import { projectHashFromPath } from '../../src/domain/scope/ProjectHash.js';
import { createSession } from '../../src/domain/session/Session.js';
import { sessionContentFrom } from '../../src/domain/session/SessionContent.js';
import { sessionIdFrom } from '../../src/domain/session/SessionId.js';
import { sessionSummaryFrom } from '../../src/domain/session/SessionSummary.js';
import type { GitSyncPort } from '../../src/domain/ports/GitSyncPort.js';
import type { SessionIndex, SessionStore } from '../../src/domain/ports/SessionStore.js';
import { syncDisabled } from '../../src/domain/sync/SyncConfiguration.js';

function createMocks() {
  var sessionStore: SessionStore = {
    save: vi.fn(),
    saveWithUniqueTimestamp: vi.fn(async (_scope, timestamp, build) => build(sessionIdFrom(timestamp))),
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
    updateStatus: vi.fn(),
    rebuildFromSessions: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
    isAvailable: vi.fn().mockReturnValue(true),
  };

  var gitSync: GitSyncPort = {
    getConfiguration: vi.fn().mockResolvedValue(syncDisabled()),
    enable: vi.fn(),
    pull: vi.fn().mockResolvedValue({ success: true, message: 'ok' }),
    commitAndPush: vi.fn().mockResolvedValue({ success: true, message: 'ok' }),
  };

  var indexReconciliation = {
    reconcileIfNeeded: vi.fn().mockResolvedValue(undefined),
  };

  return { sessionStore, sessionIndex, gitSync, indexReconciliation };
}

describe('SaveSessionUseCase', () => {
  it('saves session and indexes it', async () => {
    var { sessionStore, sessionIndex, gitSync } = createMocks();
    var useCase = new SaveSessionUseCase(sessionStore, sessionIndex, gitSync);
    var scope = projectScope(projectHashFromPath('/test/project'));

    var result = await useCase.execute({
      scope,
      content: 'Working on auth flow.',
      summary: 'Auth flow progress',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.sessionId).toMatch(/^\d{4}-\d{2}-\d{2}-\d{4}$/);
    }
    expect(sessionStore.saveWithUniqueTimestamp).toHaveBeenCalledOnce();
    expect(sessionIndex.upsert).toHaveBeenCalledOnce();
  });

  it('adds a security warning when content looks like a secret', async () => {
    var { sessionStore, sessionIndex, gitSync } = createMocks();
    var useCase = new SaveSessionUseCase(sessionStore, sessionIndex, gitSync);
    var scope = projectScope(projectHashFromPath('/test/project'));

    var result = await useCase.execute({
      scope,
      content: 'password: super-secret-value',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.securityWarning).toBeDefined();
    }
  });
});

describe('LoadSessionUseCase', () => {
  it('returns error when no session exists', async () => {
    var { sessionStore, gitSync, indexReconciliation } = createMocks();
    vi.mocked(sessionStore.findLatest).mockResolvedValue(null);

    var useCase = new LoadSessionUseCase(sessionStore, gitSync, indexReconciliation);
    var scope = projectScope(projectHashFromPath('/test/project'));

    var result = await useCase.execute({ scope });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('No session found for current scope');
    }
  });

  it('loads latest session content and marks truncation when content exceeds the limit', async () => {
    var { sessionStore, gitSync, indexReconciliation } = createMocks();
    var scope = projectScope(projectHashFromPath('/test/project'));
    var session = createSession({
      id: sessionIdFrom('2026-08-10-1430'),
      scope,
      content: sessionContentFrom('x'.repeat(50_000)),
      summary: sessionSummaryFrom('Summary'),
      createdAt: new Date('2026-08-10T14:30:00Z'),
    });
    vi.mocked(sessionStore.findLatest).mockResolvedValue(session);

    var useCase = new LoadSessionUseCase(sessionStore, gitSync, indexReconciliation);
    var result = await useCase.execute({ scope });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.content.length).toBeLessThan(session.content.length);
      expect(result.value.truncated).toBe(true);
      expect(result.value.sessionId).toBe('2026-08-10-1430');
    }
  });
});
