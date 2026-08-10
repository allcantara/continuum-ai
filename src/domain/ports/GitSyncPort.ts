import type { SyncConfiguration } from '../sync/SyncConfiguration.js';

export type GitSyncResult = {
  readonly success: boolean;
  readonly message: string;
};

export type GitSyncPort = {
  getConfiguration(): Promise<SyncConfiguration>;
  enable(remoteUrl: string): Promise<GitSyncResult>;
  pull(): Promise<GitSyncResult>;
  commitAndPush(message: string): Promise<GitSyncResult>;
};
