import { describe, expect, it, vi } from 'vitest';
import { IndexReconciliationService } from '../../src/application/IndexReconciliationService.js';
import type { SessionIndex, SessionStore } from '../../src/domain/ports/SessionStore.js';

describe('IndexReconciliationService', () => {
  it('rebuilds the index when file and index counts diverge', async () => {
    var sessionStore = {
      countAllSessions: vi.fn().mockResolvedValue(2),
      listAllSessions: vi.fn().mockResolvedValue([{ id: 'a' }, { id: 'b' }]),
    } as unknown as SessionStore;

    var sessionIndex = {
      count: vi.fn().mockResolvedValue(0),
      rebuildFromSessions: vi.fn(),
    } as unknown as SessionIndex;

    var service = new IndexReconciliationService(sessionStore, sessionIndex);
    await service.reconcileIfNeeded();

    expect(sessionIndex.rebuildFromSessions).toHaveBeenCalledOnce();
  });

  it('does not rebuild when counts match', async () => {
    var sessionStore = {
      countAllSessions: vi.fn().mockResolvedValue(3),
      listAllSessions: vi.fn(),
    } as unknown as SessionStore;

    var sessionIndex = {
      count: vi.fn().mockResolvedValue(3),
      rebuildFromSessions: vi.fn(),
    } as unknown as SessionIndex;

    var service = new IndexReconciliationService(sessionStore, sessionIndex);
    await service.reconcileIfNeeded();

    expect(sessionIndex.rebuildFromSessions).not.toHaveBeenCalled();
    expect(sessionStore.listAllSessions).not.toHaveBeenCalled();
  });
});
