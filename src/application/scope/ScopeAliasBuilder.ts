import { dirname, parse, resolve } from 'node:path';
import type { ProjectIdentity } from '../../domain/ports/GitRemoteReader.js';
import type { ScopeAlias, ScopeAliasKind } from '../../domain/ports/ScopeRegistry.js';
import { isPlausibleGitRemote, normalizeGitRemote } from '../../domain/scope/ProjectHash.js';

export function buildScopeAliases(
  absolutePath: string,
  gitRoot: string | null,
  identity: ProjectIdentity,
): ScopeAlias[] {
  var aliases = new Map<string, ScopeAliasKind>();

  if (identity.fromRemote && isPlausibleGitRemote(identity.sourceHint)) {
    aliases.set(normalizeGitRemote(identity.sourceHint), 'remote');
    aliases.set(identity.sourceHint.trim(), 'remote');
  }

  addPathAliases(aliases, absolutePath, 'path');
  if (gitRoot) {
    addPathAliases(aliases, gitRoot, 'git_root');
  }

  return [...aliases.entries()].map(([alias, kind]) => ({ alias, kind }));
}

function addPathAliases(
  aliases: Map<string, ScopeAliasKind>,
  startPath: string,
  kind: ScopeAliasKind,
): void {
  var current = resolve(startPath).replace(/\/$/, '');
  var root = parse(current).root;

  while (true) {
    if (!aliases.has(current)) {
      aliases.set(current, kind);
    }
    if (current === root) {
      break;
    }
    var parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
}
