import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import type { ProjectIdentity } from '../../domain/ports/GitRemoteReader.js';
import type { ScopeAlias, ScopeAliasKind } from '../../domain/ports/ScopeRegistry.js';
import {
  isAbsoluteFilesystemPath,
  isPlausibleGitRemote,
  normalizeGitRemote,
} from '../../domain/scope/ProjectHash.js';

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

  var root = gitRoot && isAbsoluteFilesystemPath(gitRoot) ? resolve(gitRoot).replace(/\/$/, '') : null;

  if (root) {
    addPathAliases(aliases, root, 'git_root', root);
  }

  if (isAbsoluteFilesystemPath(absolutePath)) {
    var pathToIndex = resolve(absolutePath).replace(/\/$/, '');
    var ceiling = root ?? pathToIndex;
    addPathAliases(aliases, pathToIndex, 'path', ceiling);
  }

  return [...aliases.entries()].map(([alias, kind]) => ({ alias, kind }));
}

function addPathAliases(
  aliases: Map<string, ScopeAliasKind>,
  startPath: string,
  kind: ScopeAliasKind,
  ceiling: string,
): void {
  var current = startPath;
  var stopAt = ceiling;

  while (true) {
    if (!aliases.has(current)) {
      aliases.set(current, kind);
    }
    if (current === stopAt) {
      break;
    }
    var parent = dirname(current);
    if (parent === current || !isInsideOrEqual(parent, stopAt)) {
      break;
    }
    current = parent;
  }
}

function isInsideOrEqual(target: string, ceiling: string): boolean {
  var rel = relative(ceiling, target);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}
