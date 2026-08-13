import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { projectHashFromPath } from '../../src/domain/scope/ProjectHash.js';
import { projectScope } from '../../src/domain/scope/Scope.js';
import { findGitRoot } from '../../src/infrastructure/git/GitRootResolver.js';

describe('findGitRoot', () => {
  var tempDir = '';

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'continuum-gitroot-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('finds git root from a nested subdirectory', async () => {
    var gitDir = join(tempDir, '.git');
    await mkdir(gitDir);
    var nested = join(tempDir, 'packages', 'api');
    await mkdir(nested, { recursive: true });

    expect(await findGitRoot(nested)).toBe(tempDir);
  });

  it('returns null when no git metadata exists', async () => {
    expect(await findGitRoot(tempDir)).toBeNull();
  });

  it('follows gitdir pointer from a nested path', async () => {
    var realGitDir = join(tempDir, 'real-git');
    await mkdir(realGitDir);
    await writeFile(join(tempDir, '.git'), `gitdir: ${realGitDir}\n`, 'utf-8');
    var nested = join(tempDir, 'src', 'lib');
    await mkdir(nested, { recursive: true });

    expect(await findGitRoot(nested)).toBe(tempDir);
  });
});

describe('SqliteScopeRegistry', () => {
  var tempHome = '';

  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'continuum-scope-reg-'));
  });

  afterEach(async () => {
    await rm(tempHome, { recursive: true, force: true });
  });

  it('links subdirectory path alias to the canonical scope_hash', async () => {
    var { SqliteScopeRegistry } = await import(
      '../../src/infrastructure/persistence/sqlite/SqliteScopeRegistry.js'
    );
    var registry = new SqliteScopeRegistry(tempHome);
    await registry.initialize();

    var repoRoot = '/Users/dev/projects/continuum';
    var subdir = '/Users/dev/projects/continuum/packages/api';
    var canonicalHash = projectHashFromPath('/canonical-hash');
    var scope = projectScope(canonicalHash, 'continuum', repoRoot);

    await registry.register(scope, [
      { alias: repoRoot, kind: 'git_root' },
      { alias: subdir, kind: 'path' },
    ]);

    var found = await registry.findByAliases([{ alias: subdir, kind: 'path' }]);
    expect(found?.scopeHash).toBe(canonicalHash);
  });

  it('prefers the longest path alias when kind priority is equal', async () => {
    var { SqliteScopeRegistry } = await import(
      '../../src/infrastructure/persistence/sqlite/SqliteScopeRegistry.js'
    );
    var registry = new SqliteScopeRegistry(tempHome);
    await registry.initialize();

    var parentHash = projectHashFromPath('/parent-scope');
    var childHash = projectHashFromPath('/child-scope');
    await registry.register(projectScope(parentHash, 'parent'), [
      { alias: '/Users/dev', kind: 'path' },
    ]);
    await registry.register(projectScope(childHash, 'child'), [
      { alias: '/Users/dev/projects/s3', kind: 'path' },
    ]);

    var found = await registry.findByAliases([
      { alias: '/Users/dev', kind: 'path' },
      { alias: '/Users/dev/projects/s3', kind: 'path' },
    ]);
    expect(found?.scopeHash).toBe(childHash);
  });

  it('drops parent-directory path aliases on initialize so sibling projects stay isolated', async () => {
    var { SqliteScopeRegistry } = await import(
      '../../src/infrastructure/persistence/sqlite/SqliteScopeRegistry.js'
    );
    var registry = new SqliteScopeRegistry(tempHome);
    await registry.initialize();

    var canonicalHash = projectHashFromPath('/canonical-hash');
    var repoRoot = '/Users/dev/projects/continuum';
    await registry.register(projectScope(canonicalHash, 'continuum', repoRoot), [
      { alias: '/', kind: 'path' },
      { alias: '/Users/dev', kind: 'path' },
      { alias: '/Users/dev/projects', kind: 'path' },
      { alias: repoRoot, kind: 'git_root' },
    ]);

    var reopened = new SqliteScopeRegistry(tempHome);
    await reopened.initialize();

    expect(await reopened.findByAliases([{ alias: '/', kind: 'path' }])).toBeNull();
    expect(await reopened.findByAliases([{ alias: '/Users/dev', kind: 'path' }])).toBeNull();
    expect(await reopened.findByAliases([{ alias: '/Users/dev/projects', kind: 'path' }])).toBeNull();
    expect((await reopened.findByAliases([{ alias: repoRoot, kind: 'git_root' }]))?.scopeHash).toBe(
      canonicalHash,
    );
  });
});
