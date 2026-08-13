import type { SessionIndexEntry } from '../../domain/ports/SessionStore.js';
import type { ProjectHash } from '../../domain/scope/ProjectHash.js';
import type { Scope } from '../../domain/scope/Scope.js';
import { projectScope, workspaceScope } from '../../domain/scope/Scope.js';
import type { WorkspaceHash } from '../../domain/scope/WorkspaceHash.js';

export function scopeFromIndexEntry(entry: SessionIndexEntry): Scope {
  if (entry.scopeType === 'workspace') {
    return workspaceScope(entry.scopeHash as WorkspaceHash, [], entry.scopeSlug);
  }
  return projectScope(entry.scopeHash as ProjectHash, entry.scopeSlug);
}
