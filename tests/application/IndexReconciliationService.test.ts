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
      listAllEntries: vi.fn().mockResolvedValue([]),
      rebuildFromSessions: vi.fn(),
    } as unknown as SessionIndex;

    var service = new IndexReconciliationService(sessionStore, sessionIndex);
    await service.reconcileIfNeeded();

    expect(sessionIndex.rebuildFromSessions).toHaveBeenCalledOnce();
  });

  it('does not rebuild when counts and identities match', async () => {
    var sessionStore = {
      countAllSessions: vi.fn().mockResolvedValue(3),
      listAllSessions: vi.fn().mockResolvedValue([
        { id: 'a', scope: { hash: 'h1', slug: 'app' }, status: 'active' },
        { id: 'b', scope: { hash: 'h1', slug: 'app' }, status: 'active' },
        { id: 'c', scope: { hash: 'h1', slug: 'app' }, status: 'active' },
      ]),
    } as unknown as SessionStore;

    var sessionIndex = {
      count: vi.fn().mockResolvedValue(3),
      listAllEntries: vi.fn().mockResolvedValue([
        { id: 'a', scopeHash: 'h1', scopeSlug: 'app', status: 'active' },
        { id: 'b', scopeHash: 'h1', scopeSlug: 'app', status: 'active' },
        { id: 'c', scopeHash: 'h1', scopeSlug: 'app', status: 'active' },
      ]),
      rebuildFromSessions: vi.fn(),
    } as unknown as SessionIndex;

    var service = new IndexReconciliationService(sessionStore, sessionIndex);
    await service.reconcileIfNeeded();

    expect(sessionIndex.rebuildFromSessions).not.toHaveBeenCalled();
  });

  it('rebuilds when counts match but the index is missing slugs that disk already has', async () => {
    var sessionStore = {
      countAllSessions: vi.fn().mockResolvedValue(1),
      listAllSessions: vi.fn().mockResolvedValue([
        { id: 'a', scope: { hash: 'h1', slug: 'cpc-refinancing-app-bff' }, status: 'active' },
      ]),
    } as unknown as SessionStore;

    var sessionIndex = {
      count: vi.fn().mockResolvedValue(1),
      listAllEntries: vi.fn().mockResolvedValue([
        { id: 'a', scopeHash: 'h1', scopeSlug: '', status: 'active' },
      ]),
      rebuildFromSessions: vi.fn(),
    } as unknown as SessionIndex;

    var service = new IndexReconciliationService(sessionStore, sessionIndex);
    await service.reconcileIfNeeded();

    expect(sessionIndex.rebuildFromSessions).toHaveBeenCalledOnce();
  });

  it('rebuilds when counts match but indexed session identities differ from disk', async () => {
    var sessionStore = {
      countAllSessions: vi.fn().mockResolvedValue(2),
      listAllSessions: vi.fn().mockResolvedValue([
        { id: '2026-08-10-1000', scope: { hash: 'abc', slug: 'app' }, status: 'active' },
        { id: '2026-08-10-1100', scope: { hash: 'abc', slug: 'app' }, status: 'active' },
      ]),
    } as unknown as SessionStore;

    var sessionIndex = {
      count: vi.fn().mockResolvedValue(2),
      listAllEntries: vi.fn().mockResolvedValue([
        { id: '2026-08-10-1000', scopeHash: 'abc', status: 'active' },
        { id: '2026-08-10-9999', scopeHash: 'abc', status: 'active' },
      ]),
      rebuildFromSessions: vi.fn(),
    } as unknown as SessionIndex;

    var service = new IndexReconciliationService(sessionStore, sessionIndex);
    await service.reconcileIfNeeded();

    expect(sessionIndex.rebuildFromSessions).toHaveBeenCalledOnce();
  });
});
