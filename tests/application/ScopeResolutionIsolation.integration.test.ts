import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ScopeResolutionService } from '../../src/application/ScopeResolutionService.js';
import { GitRemoteReader } from '../../src/infrastructure/git/GitRemoteReader.js';
import { SqliteScopeRegistry } from '../../src/infrastructure/persistence/sqlite/SqliteScopeRegistry.js';

async function initGitRepo(repoPath: string, remoteUrl: string): Promise<void> {
  await mkdir(join(repoPath, '.git'), { recursive: true });
  await writeFile(join(repoPath, '.git', 'config'), `[remote "origin"]\n\turl = ${remoteUrl}\n`, 'utf-8');
}

describe('ScopeResolutionService sibling isolation', () => {
  var tempHome = '';
  var workspaceParent = '';

  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'continuum-iso-home-'));
    workspaceParent = await mkdtemp(join(tmpdir(), 'continuum-iso-ws-'));
  });

  afterEach(async () => {
    await rm(tempHome, { recursive: true, force: true });
    await rm(workspaceParent, { recursive: true, force: true });
  });

  it('does not resolve a new sibling repo to another project that was registered first', async () => {
    var repoA = join(workspaceParent, 'continuum-ai');
    var repoB = join(workspaceParent, 'configuracoes-microsservicos-s3');
    await initGitRepo(repoA, 'https://github.com/org/continuum-ai.git');
    await initGitRepo(repoB, 'https://github.com/org/configuracoes-microsservicos-s3.git');

    var registry = new SqliteScopeRegistry(tempHome);
    await registry.initialize();
    var service = new ScopeResolutionService(
      new GitRemoteReader(),
      { findByPathHint: async () => null },
      registry,
    );

    var first = await service.resolveFromPath(repoA);
    var second = await service.resolveFromPath(repoB);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.value.hash).not.toBe(first.value.hash);
      expect(first.value.slug).toBe('continuum-ai');
      expect(second.value.slug).toBe('configuracoes-microsservicos-s3');
    }
  });

  it('still maps a subdirectory of a git repo to the same project as the git root', async () => {
    var repo = join(workspaceParent, 'continuum-ai');
    var nested = join(repo, 'packages', 'api');
    await initGitRepo(repo, 'https://github.com/org/continuum-ai.git');
    await mkdir(nested, { recursive: true });

    var registry = new SqliteScopeRegistry(tempHome);
    await registry.initialize();
    var service = new ScopeResolutionService(
      new GitRemoteReader(),
      { findByPathHint: async () => null },
      registry,
    );

    var fromRoot = await service.resolveFromPath(repo);
    var fromNested = await service.resolveFromPath(nested);

    expect(fromRoot.ok).toBe(true);
    expect(fromNested.ok).toBe(true);
    if (fromRoot.ok && fromNested.ok) {
      expect(fromNested.value.hash).toBe(fromRoot.value.hash);
    }
  });
});
