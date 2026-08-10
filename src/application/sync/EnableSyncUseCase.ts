import type { GitSyncPort } from '../../domain/ports/GitSyncPort.js';
import type { SyncConfiguration } from '../../domain/sync/SyncConfiguration.js';
import type { Result } from '../Result.js';
import { ok } from '../Result.js';

export type EnableSyncInput = {
  readonly remoteUrl: string;
};

export type EnableSyncOutput = {
  readonly configuration: SyncConfiguration;
  readonly message: string;
};

export class EnableSyncUseCase {
  constructor(private readonly gitSync: GitSyncPort) {}

  async execute(input: EnableSyncInput): Promise<Result<EnableSyncOutput>> {
    var result = await this.gitSync.enable(input.remoteUrl);
    var configuration = await this.gitSync.getConfiguration();

    return ok({
      configuration,
      message: result.message,
    });
  }
}
