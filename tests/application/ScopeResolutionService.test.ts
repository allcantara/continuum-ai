import { describe, expect, it, vi } from 'vitest';
import { ScopeResolutionService } from '../../src/application/ScopeResolutionService.js';
import { projectHashFromPath } from '../../src/domain/scope/ProjectHash.js';
import type { GitRemoteReader } from '../../src/domain/ports/GitRemoteReader.js';

describe('ScopeResolutionService', () => {
  it('resolves single root as project scope', async () => {
    var gitRemoteReader: GitRemoteReader = {
      readRemoteUrl: vi.fn(),
      resolveProjectHash: vi.fn().mockResolvedValue(projectHashFromPath('/project/a')),
    };

    var service = new ScopeResolutionService(gitRemoteReader);
    var result = await service.resolve({ roots: ['/project/a'] });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.type).toBe('project');
    }
  });

  it('resolves multiple roots as workspace scope', async () => {
    var gitRemoteReader: GitRemoteReader = {
      readRemoteUrl: vi.fn(),
      resolveProjectHash: vi
        .fn()
        .mockResolvedValueOnce(projectHashFromPath('/project/a'))
        .mockResolvedValueOnce(projectHashFromPath('/project/b')),
    };

    var service = new ScopeResolutionService(gitRemoteReader);
    var result = await service.resolve({ roots: ['/project/a', '/project/b'] });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.type).toBe('workspace');
    }
  });

  it('returns error when no roots provided', async () => {
    var gitRemoteReader: GitRemoteReader = {
      readRemoteUrl: vi.fn(),
      resolveProjectHash: vi.fn(),
    };

    var service = new ScopeResolutionService(gitRemoteReader);
    var result = await service.resolve({ roots: [] });

    expect(result.ok).toBe(false);
  });
});
