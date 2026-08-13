import type { SessionIndex } from '../../domain/ports/SessionStore.js';
import type { Scope } from '../../domain/scope/Scope.js';
import { scopeFromIndexEntry } from './scopeFromIndexEntry.js';

export async function resolveScopeFromHash(
  sessionIndex: SessionIndex,
  scopeHash: string,
): Promise<Scope | null> {
  var entries = await sessionIndex.listAllEntries();
  var match = entries.find((entry) => entry.scopeHash === scopeHash);
  if (!match) {
    return null;
  }
  return scopeFromIndexEntry(match);
}
