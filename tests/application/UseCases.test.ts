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
    findById: vi.fn().mockResolvedValue(null),
    findLatest: vi.fn(),
    findRecent: vi.fn(),
    moveToTrash: vi.fn(),
    restoreFromTrash: vi.fn(),
    moveScopeToTrash: vi.fn(),
    listAllSessions: vi.fn().mockResolvedValue([]),
  };

  var sessionIndex: SessionIndex = {
    upsert: vi.fn(),
    search: vi.fn().mockResolvedValue([]),
    updateStatus: vi.fn(),
    rebuildFromSessions: vi.fn(),
    isAvailable: vi.fn().mockReturnValue(true),
  };

  var gitSync: GitSyncPort = {
    getConfiguration: vi.fn().mockResolvedValue(syncDisabled()),
    enable: vi.fn(),
    pull: vi.fn().mockResolvedValue({ success: true, message: 'ok' }),
    commitAndPush: vi.fn().mockResolvedValue({ success: true, message: 'ok' }),
  };

  return { sessionStore, sessionIndex, gitSync };
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
    expect(sessionStore.save).toHaveBeenCalledOnce();
    expect(sessionIndex.upsert).toHaveBeenCalledOnce();
  });
});

describe('LoadSessionUseCase', () => {
  it('returns error when no session exists', async () => {
    var { sessionStore, gitSync } = createMocks();
    vi.mocked(sessionStore.findLatest).mockResolvedValue(null);

    var useCase = new LoadSessionUseCase(sessionStore, gitSync);
    var scope = projectScope(projectHashFromPath('/test/project'));

    var result = await useCase.execute({ scope });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('No session found for current scope');
    }
  });

  it('loads latest session content', async () => {
    var { sessionStore, gitSync } = createMocks();
    var scope = projectScope(projectHashFromPath('/test/project'));
    var session = createSession({
      id: sessionIdFrom('2026-08-10-1430'),
      scope,
      content: sessionContentFrom('Session content here'),
      summary: sessionSummaryFrom('Summary'),
      createdAt: new Date('2026-08-10T14:30:00Z'),
    });
    vi.mocked(sessionStore.findLatest).mockResolvedValue(session);

    var useCase = new LoadSessionUseCase(sessionStore, gitSync);
    var result = await useCase.execute({ scope });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.content).toBe('Session content here');
      expect(result.value.sessionId).toBe('2026-08-10-1430');
    }
  });
});
