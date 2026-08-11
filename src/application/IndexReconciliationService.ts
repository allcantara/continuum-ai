import type { SessionIndex, SessionStore } from '../domain/ports/SessionStore.js';

export class IndexReconciliationService {
  constructor(
    private readonly sessionStore: SessionStore,
    private readonly sessionIndex: SessionIndex,
  ) {}

  async reconcileIfNeeded(): Promise<void> {
    var fileCount = await this.sessionStore.countAllSessions();
    var indexCount = await this.sessionIndex.count();
    if (fileCount === indexCount) {
      return;
    }

    var sessions = await this.sessionStore.listAllSessions();
    await this.sessionIndex.rebuildFromSessions(sessions);
  }
}
