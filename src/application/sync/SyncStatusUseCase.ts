import type { GitSyncPort } from '../../domain/ports/GitSyncPort.js';
import type { SyncConfiguration } from '../../domain/sync/SyncConfiguration.js';
import type { Result } from '../Result.js';
import { ok } from '../Result.js';

export class SyncStatusUseCase {
  constructor(private readonly gitSync: GitSyncPort) {}

  async execute(): Promise<Result<SyncConfiguration>> {
    var configuration = await this.gitSync.getConfiguration();
    return ok(configuration);
  }
}
