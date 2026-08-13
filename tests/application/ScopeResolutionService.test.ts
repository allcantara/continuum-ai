import { describe, expect, it, vi } from 'vitest';
import { ScopeResolutionService } from '../../src/application/ScopeResolutionService.js';
import { projectHashFromPath, projectSlugFromPath } from '../../src/domain/scope/ProjectHash.js';
import { isUnscoped } from '../../src/domain/scope/Scope.js';
import type { GitRemoteReader, ProjectIdentity } from '../../src/domain/ports/GitRemoteReader.js';

function identityFromPath(path: string): ProjectIdentity {
  return { hash: projectHashFromPath(path), slug: projectSlugFromPath(path), sourceHint: path, fromRemote: false };
}

describe('ScopeResolutionService', () => {
  it('resolves single root as project scope', async () => {
    var gitRemoteReader: GitRemoteReader = {
      readRemoteUrl: vi.fn(),
      resolveProjectIdentity: vi.fn().mockResolvedValue(identityFromPath('/project/a')),
    };

    var service = new ScopeResolutionService(gitRemoteReader);
    var result = await service.resolve({ roots: ['/project/a'] });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.type).toBe('project');
      expect(result.value.slug).toBe('a');
    }
  });

  it('resolves multiple roots as workspace scope', async () => {
    var gitRemoteReader: GitRemoteReader = {
      readRemoteUrl: vi.fn(),
      resolveProjectIdentity: vi
        .fn()
        .mockResolvedValueOnce(identityFromPath('/project/a'))
        .mockResolvedValueOnce(identityFromPath('/project/b')),
    };

    var service = new ScopeResolutionService(gitRemoteReader);
    var result = await service.resolve({ roots: ['/project/a', '/project/b'] });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.type).toBe('workspace');
      expect(result.value.slug).toBe('a+b');
    }
  });

  it('returns error when no roots provided', async () => {
    var gitRemoteReader: GitRemoteReader = {
      readRemoteUrl: vi.fn(),
      resolveProjectIdentity: vi.fn(),
    };

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
    var gitRemoteReader: GitRemoteReader = {
      readRemoteUrl: vi.fn().mockResolvedValue('git@github.com:user/repo.git'),
      resolveProjectIdentity: vi.fn().mockResolvedValue(remoteIdentity),
    };

    var service = new ScopeResolutionService(gitRemoteReader);
    var result = await service.resolveFromPath('/some/local/checkout/of/repo');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.hash).toBe(remoteIdentity.hash);
    }
    expect(gitRemoteReader.resolveProjectIdentity).toHaveBeenCalledWith('/some/local/checkout/of/repo');
  });

  it('resolveUnscoped returns a stable scope regardless of how many times it is called', () => {
    var gitRemoteReader: GitRemoteReader = {
      readRemoteUrl: vi.fn(),
      resolveProjectIdentity: vi.fn(),
    };

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
      {
        readRemoteUrl: vi.fn(),
        resolveProjectIdentity: vi.fn().mockResolvedValue(pathIdentity),
      },
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
      {
        readRemoteUrl: vi.fn(),
        resolveProjectIdentity: vi.fn().mockResolvedValue(remoteIdentity),
      },
      { findByPathHint },
    );

    await service.resolve({ roots: ['/some/checkout'] });
    expect(findByPathHint).not.toHaveBeenCalled();
  });
});
