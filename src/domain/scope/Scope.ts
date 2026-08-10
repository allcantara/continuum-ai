import type { ProjectHash } from './ProjectHash.js';
import type { WorkspaceHash } from './WorkspaceHash.js';

export type ScopeType = 'project' | 'workspace';

export type ProjectScope = {
  readonly type: 'project';
  readonly hash: ProjectHash;
};

export type WorkspaceScope = {
  readonly type: 'workspace';
  readonly hash: WorkspaceHash;
  readonly projectHashes: readonly ProjectHash[];
};

export type Scope = ProjectScope | WorkspaceScope;

export function projectScope(hash: ProjectHash): ProjectScope {
  return { type: 'project', hash };
}

export function workspaceScope(hash: WorkspaceHash, projectHashes: readonly ProjectHash[]): WorkspaceScope {
  return { type: 'workspace', hash, projectHashes };
}

export function scopeHash(scope: Scope): string {
  return scope.hash;
}

export function scopeKind(scope: Scope): ScopeType {
  return scope.type;
}
