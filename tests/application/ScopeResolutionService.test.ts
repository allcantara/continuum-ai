import { describe, expect, it, vi } from 'vitest';
import { ScopeResolutionService } from '../../src/application/ScopeResolutionService.js';
import { projectHashFromPath, projectSlugFromPath } from '../../src/domain/scope/ProjectHash.js';
import { isUnscoped } from '../../src/domain/scope/Scope.js';
import type { GitRemoteReader, ProjectIdentity } from '../../src/domain/ports/GitRemoteReader.js';

function identityFromPath(path: string): ProjectIdentity {
  return { hash: projectHashFromPath(path), slug: projectSlugFromPath(path), sourceHint: path };
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
});
