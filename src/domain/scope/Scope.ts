import type { ProjectHash } from './ProjectHash.js';
import type { WorkspaceHash } from './WorkspaceHash.js';

export type ScopeType = 'project' | 'workspace';

export type ProjectScope = {
  readonly type: 'project';
  readonly hash: ProjectHash;
  readonly slug: string;
  readonly sourceHint?: string;
};

export type WorkspaceScope = {
  readonly type: 'workspace';
  readonly hash: WorkspaceHash;
  readonly projectHashes: readonly ProjectHash[];
  readonly slug: string;
};

export type Scope = ProjectScope | WorkspaceScope;

export function projectScope(hash: ProjectHash, slug: string = '', sourceHint?: string): ProjectScope {
  var scope: ProjectScope = { type: 'project', hash, slug };
  return sourceHint !== undefined ? { ...scope, sourceHint } : scope;
}

export function workspaceScope(
  hash: WorkspaceHash,
  projectHashes: readonly ProjectHash[],
  slug: string = '',
): WorkspaceScope {
  return { type: 'workspace', hash, projectHashes, slug };
}

export function scopeHash(scope: Scope): string {
  return scope.hash;
}

export function scopeKind(scope: Scope): ScopeType {
  return scope.type;
}

/**
 * Folder-safe display name for a scope: `<slug>-<hash>` when a slug is known,
 * or the bare hash otherwise (legacy behavior, kept for scopes resolved without one).
 */
export function scopeFolderName(scope: Scope): string {
  return scope.slug ? `${scope.slug}-${scope.hash}` : scope.hash;
}

export const UNSCOPED_PROJECT_HASH = 'unscoped' as ProjectHash;
export const UNSCOPED_PROJECT_SLUG = 'sem-projeto';

/**
 * Stable bucket used when no workspace root is known at all (no `roots` argument,
 * no reliable `cwd`). Keeps "no project open" sessions findable across chats,
 * instead of hashing an arbitrary, unstable path.
 */
export function unscopedProjectScope(): ProjectScope {
  return projectScope(UNSCOPED_PROJECT_HASH, UNSCOPED_PROJECT_SLUG);
}

export function isUnscoped(scope: Scope): boolean {
  return scope.type === 'project' && scope.hash === UNSCOPED_PROJECT_HASH;
}
