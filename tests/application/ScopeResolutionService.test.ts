import { describe, expect, it, vi } from 'vitest';
import { ScopeResolutionService } from '../../src/application/ScopeResolutionService.js';
import { projectHashFromPath, projectSlugFromPath } from '../../src/domain/scope/ProjectHash.js';
import { isUnscoped } from '../../src/domain/scope/Scope.js';
import type { GitRemoteReader, ProjectIdentity } from '../../src/domain/ports/GitRemoteReader.js';
import type { ScopeRegistry } from '../../src/domain/ports/ScopeRegistry.js';

function identityFromPath(path: string): ProjectIdentity {
  return { hash: projectHashFromPath(path), slug: projectSlugFromPath(path), sourceHint: path, fromRemote: false };
}

function gitRemoteReaderStub(
  overrides: Partial<GitRemoteReader> & {
    resolveProjectIdentity?: GitRemoteReader['resolveProjectIdentity'];
  } = {},
): GitRemoteReader {
  return {
    readRemoteUrl: overrides.readRemoteUrl ?? vi.fn(),
    resolveProjectIdentity: overrides.resolveProjectIdentity ?? vi.fn(),
    findRepositoryRoot: overrides.findRepositoryRoot ?? vi.fn().mockResolvedValue(null),
  };
}

describe('ScopeResolutionService', () => {
  it('resolves single root as project scope', async () => {
    var gitRemoteReader = gitRemoteReaderStub({
      resolveProjectIdentity: vi.fn().mockResolvedValue(identityFromPath('/project/a')),
    });

    var service = new ScopeResolutionService(gitRemoteReader);
    var result = await service.resolve({ roots: ['/project/a'] });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.type).toBe('project');
      expect(result.value.slug).toBe('a');
    }
  });

  it('resolves multiple roots as workspace scope', async () => {
    var gitRemoteReader = gitRemoteReaderStub({
      resolveProjectIdentity: vi
        .fn()
        .mockResolvedValueOnce(identityFromPath('/project/a'))
        .mockResolvedValueOnce(identityFromPath('/project/b')),
    });

    var service = new ScopeResolutionService(gitRemoteReader);
    var result = await service.resolve({ roots: ['/project/a', '/project/b'] });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.type).toBe('workspace');
      expect(result.value.slug).toBe('a+b');
    }
  });

  it('returns error when no roots provided', async () => {
    var gitRemoteReader = gitRemoteReaderStub();

    var service = new ScopeResolutionService(gitRemoteReader);
    var result = await service.resolve({ roots: [] });

    expect(result.ok).toBe(false);
  });

  it('resolveFromPath uses the git remote hash when available, not just the path', async () => {
    var remoteIdentity: ProjectIdentity = {
      hash: projectHashFromPath('/would-be-different-if-path-based'),
      slug: 'repo',
      sourceHint: 'https://github.com/user/repo',
      fromRemote: true,
    };
    var gitRemoteReader = gitRemoteReaderStub({
      readRemoteUrl: vi.fn().mockResolvedValue('git@github.com:user/repo.git'),
      resolveProjectIdentity: vi.fn().mockResolvedValue(remoteIdentity),
    });

    var service = new ScopeResolutionService(gitRemoteReader);
    var result = await service.resolveFromPath('/some/local/checkout/of/repo');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.hash).toBe(remoteIdentity.hash);
    }
    expect(gitRemoteReader.resolveProjectIdentity).toHaveBeenCalledWith('/some/local/checkout/of/repo');
  });

  it('resolveUnscoped returns a stable scope regardless of how many times it is called', () => {
    var gitRemoteReader = gitRemoteReaderStub();

    var service = new ScopeResolutionService(gitRemoteReader);
    var first = service.resolveUnscoped();
    var second = service.resolveUnscoped();

    expect(first.hash).toBe(second.hash);
    expect(isUnscoped(first)).toBe(true);
  });

  it('reuses an existing project identity when git remote is unavailable', async () => {
    var pathIdentity = identityFromPath('/Users/dev/git/cpc-refinancing-app-bff');
    var stored: ProjectIdentity = {
      hash: projectHashFromPath('/stored-remote-hash-stand-in'),
      slug: 'cpc-refinancing-app-bff',
      sourceHint: 'https://gitlab.example/cpc-refinancing-app-bff',
      fromRemote: true,
    };
    var findByPathHint = vi.fn().mockResolvedValue(stored);
    var service = new ScopeResolutionService(
      gitRemoteReaderStub({
        resolveProjectIdentity: vi.fn().mockResolvedValue(pathIdentity),
      }),
      { findByPathHint },
    );

    var result = await service.resolve({ roots: ['/Users/dev/git/cpc-refinancing-app-bff'] });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.hash).toBe(stored.hash);
      expect(result.value.slug).toBe('cpc-refinancing-app-bff');
    }
    expect(findByPathHint).toHaveBeenCalledWith(
      '/Users/dev/git/cpc-refinancing-app-bff',
      'cpc-refinancing-app-bff',
    );
  });

  it('does not look up existing projects when the git remote was resolved', async () => {
    var remoteIdentity: ProjectIdentity = {
      hash: projectHashFromPath('/remote'),
      slug: 'repo',
      sourceHint: 'https://github.com/user/repo',
      fromRemote: true,
    };
    var findByPathHint = vi.fn();
    var service = new ScopeResolutionService(
      gitRemoteReaderStub({
        resolveProjectIdentity: vi.fn().mockResolvedValue(remoteIdentity),
      }),
      { findByPathHint },
    );

    await service.resolve({ roots: ['/some/checkout'] });
    expect(findByPathHint).not.toHaveBeenCalled();
  });

  it('reuses scope_hash from registry when cwd is a subdirectory of a registered git root', async () => {
    var repoRoot = '/Users/dev/projects/continuum';
    var subdir = '/Users/dev/projects/continuum/packages/api';
    var storedHash = projectHashFromPath('/stored-canonical-hash');
    var pathIdentity = identityFromPath(subdir);

    var scopeRegistry: ScopeRegistry = {
      findByAliases: vi.fn().mockResolvedValue({
        scopeId: 'uuid-1',
        scopeHash: storedHash,
        scopeType: 'project',
        slug: 'continuum',
      }),
      register: vi.fn(),
      countScopes: vi.fn(),
      isAvailable: () => true,
    };

    var service = new ScopeResolutionService(
      gitRemoteReaderStub({
        findRepositoryRoot: vi.fn().mockResolvedValue(repoRoot),
        resolveProjectIdentity: vi.fn().mockResolvedValue(pathIdentity),
      }),
      NOOP_IDENTITY_LOOKUP,
      scopeRegistry,
    );

    var result = await service.resolveFromPath(subdir);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.hash).toBe(storedHash);
    }
    expect(scopeRegistry.findByAliases).toHaveBeenCalled();
  });
});

const NOOP_IDENTITY_LOOKUP = {
  findByPathHint: async () => null,
};
