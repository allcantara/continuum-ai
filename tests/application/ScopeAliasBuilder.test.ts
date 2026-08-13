import { describe, expect, it } from 'vitest';
import { buildScopeAliases } from '../../src/application/scope/ScopeAliasBuilder.js';
import { projectHashFromPath, projectHashFromRemote } from '../../src/domain/scope/ProjectHash.js';
import type { ProjectIdentity } from '../../src/domain/ports/GitRemoteReader.js';

function pathIdentity(absolutePath: string): ProjectIdentity {
  return {
    hash: projectHashFromPath(absolutePath),
    slug: 'app',
    sourceHint: absolutePath,
    fromRemote: false,
  };
}

function remoteIdentity(remoteUrl: string): ProjectIdentity {
  return {
    hash: projectHashFromRemote(remoteUrl),
    slug: 'repo',
    sourceHint: remoteUrl,
    fromRemote: true,
  };
}

describe('buildScopeAliases', () => {
  it('does not register filesystem ancestors above the git root', () => {
    var gitRoot = '/Users/dev/projects/continuum';
    var aliases = buildScopeAliases(gitRoot, gitRoot, remoteIdentity('https://github.com/org/continuum'));

    var paths = aliases.filter((alias) => alias.kind !== 'remote').map((alias) => alias.alias);
    expect(paths).toEqual([gitRoot]);
    expect(paths).not.toContain('/Users/dev/projects');
    expect(paths).not.toContain('/Users/dev');
    expect(paths).not.toContain('/Users');
    expect(paths).not.toContain('/');
  });

  it('registers subdirectory paths only up to the git root', () => {
    var gitRoot = '/Users/dev/projects/continuum';
    var nested = `${gitRoot}/packages/api`;
    var aliases = buildScopeAliases(nested, gitRoot, pathIdentity(nested));

    var byKind = Object.fromEntries(aliases.map((alias) => [alias.alias, alias.kind]));
    expect(byKind[gitRoot]).toBe('git_root');
    expect(byKind[`${gitRoot}/packages`]).toBe('path');
    expect(byKind[nested]).toBe('path');
    expect(byKind['/Users/dev/projects']).toBeUndefined();
  });

  it('registers only the exact path when there is no git root', () => {
    var projectPath = '/Users/dev/scratch/new-folder';
    var aliases = buildScopeAliases(projectPath, null, pathIdentity(projectPath));

    expect(aliases).toEqual([{ alias: projectPath, kind: 'path' }]);
  });

  it('does not treat a git remote URL as a filesystem path', () => {
    var remote = 'https://github.com/org/continuum';
    var aliases = buildScopeAliases(remote, null, remoteIdentity(remote));

    var paths = aliases.filter((alias) => alias.kind !== 'remote');
    expect(paths).toEqual([]);
    expect(aliases.some((alias) => alias.alias === '/')).toBe(false);
  });

  it('keeps sibling project paths from sharing a parent alias', () => {
    var repoA = '/Users/dev/git/configuracoes-microsservicos-s3';
    var repoB = '/Users/dev/projects/continuum';
    var aliasesA = buildScopeAliases(repoA, repoA, remoteIdentity('https://github.com/org/s3-config'));
    var aliasesB = buildScopeAliases(repoB, repoB, remoteIdentity('https://github.com/org/continuum'));

    var pathAliasesA = new Set(aliasesA.filter((alias) => alias.kind !== 'remote').map((alias) => alias.alias));
    var pathAliasesB = new Set(aliasesB.filter((alias) => alias.kind !== 'remote').map((alias) => alias.alias));

    expect([...pathAliasesA].some((alias) => pathAliasesB.has(alias))).toBe(false);
  });
});
