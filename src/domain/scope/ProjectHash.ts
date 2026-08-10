import { createHash } from 'node:crypto';

export type ProjectHash = string & { readonly __brand: 'ProjectHash' };

function normalizeRemoteUrl(url: string): string {
  var normalized = url.trim();

  normalized = normalized.replace(/^git@([^:]+):(.+)$/, 'https://$1/$2');
  normalized = normalized.replace(/^ssh:\/\/git@/, 'https://');
  normalized = normalized.replace(/\.git$/, '');
  normalized = normalized.replace(/\/$/, '');

  return normalized.toLowerCase();
}

function hashValue(value: string): ProjectHash {
  var hash = createHash('sha256').update(value).digest('hex').slice(0, 16);
  return hash as ProjectHash;
}

export function projectHashFromRemote(remoteUrl: string): ProjectHash {
  return hashValue(normalizeRemoteUrl(remoteUrl));
}

export function projectHashFromPath(absolutePath: string): ProjectHash {
  var normalized = absolutePath.replace(/\/$/, '');
  return hashValue(normalized);
}

export function normalizeGitRemote(url: string): string {
  return normalizeRemoteUrl(url);
}
