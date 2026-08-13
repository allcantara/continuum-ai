import type { SessionIndex } from '../../domain/ports/SessionStore.js';
import type { Scope } from '../../domain/scope/Scope.js';
import { scopeFromIndexEntry } from './scopeFromIndexEntry.js';

export async function resolveScopeFromHash(
  sessionIndex: SessionIndex,
  scopeHash: string,
): Promise<Scope | null> {
  var active = await sessionIndex.search({ scopeHash, status: 'active' });
  var match = active[0] ?? (await sessionIndex.search({ scopeHash, status: 'trashed' }))[0];
  if (!match) {
    return null;
  }
  return scopeFromIndexEntry(match);
}
