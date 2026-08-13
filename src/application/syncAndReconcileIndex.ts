import type { GitSyncPort } from '../domain/ports/GitSyncPort.js';
import type { IndexReconciliationService } from './IndexReconciliationService.js';

export async function syncAndReconcileIndex(
  gitSync: GitSyncPort,
  indexReconciliation: IndexReconciliationService,
): Promise<void> {
  var config = await gitSync.getConfiguration();
  if (config.enabled) {
    await gitSync.pull();
  }

  await indexReconciliation.reconcileIfNeeded();
}
