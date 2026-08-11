import { createHash } from 'node:crypto';
import type { ProjectHash } from './ProjectHash.js';

export type WorkspaceHash = string & { readonly __brand: 'WorkspaceHash' };

export function workspaceHashFromProjectHashes(projectHashes: readonly ProjectHash[]): WorkspaceHash {
  if (projectHashes.length === 0) {
    throw new Error('Workspace requires at least one project hash');
  }

  var sorted = [...projectHashes].sort();
  var composite = sorted.join(':');
  var hash = createHash('sha256').update(composite).digest('hex').slice(0, 16);
  return hash as WorkspaceHash;
}

const MAX_WORKSPACE_SLUG_LENGTH = 40;

export function workspaceSlugFromProjectSlugs(slugs: readonly string[]): string {
  var joined = [...slugs].sort().join('+');
  return joined.length > 0 && joined.length <= MAX_WORKSPACE_SLUG_LENGTH ? joined : 'workspace';
}
