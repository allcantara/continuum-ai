export type SyncConfiguration = {
  readonly enabled: boolean;
  readonly remoteUrl: string | null;
};

export function syncDisabled(): SyncConfiguration {
  return { enabled: false, remoteUrl: null };
}

export function syncEnabled(remoteUrl: string): SyncConfiguration {
  if (remoteUrl.trim().length === 0) {
    throw new Error('Remote URL cannot be empty when sync is enabled');
  }
  return { enabled: true, remoteUrl: remoteUrl.trim() };
}
