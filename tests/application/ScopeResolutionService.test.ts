import { describe, expect, it, vi } from 'vitest';
import { NO_PROJECT_MARKER_REASON, ScopeResolutionService } from '../../src/application/ScopeResolutionService.js';
import type { ProjectMarkerStore } from '../../src/domain/ports/ProjectMarkerStore.js';
import { isUnscoped } from '../../src/domain/scope/Scope.js';

function markerStoreStub(overrides: Partial<ProjectMarkerStore> = {}): ProjectMarkerStore {
  return {
    findFromPath: overrides.findFromPath ?? vi.fn().mockResolvedValue(null),
    ensureFromPath: overrides.ensureFromPath ?? vi.fn(),
  };
}

describe('ScopeResolutionService', () => {
  it('resolves a single root from an existing marker', async () => {
    var store = markerStoreStub({
      findFromPath: vi.fn().mockResolvedValue({
        id: 'a3f1c8e2-9b44-4d1a-8f0e-2c7b91d4e5aa',
        folderName: 'my-app',
      }),
    });
    var service = new ScopeResolutionService(store);

    var result = await service.resolve({ roots: ['/project/my-app'] });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.type).toBe('project');
      expect(result.value.hash).toBe('a3f1c8e2-9b44-4d1a-8f0e-2c7b91d4e5aa');
      expect(result.value.slug).toBe('my-app');
    }
    expect(store.ensureFromPath).not.toHaveBeenCalled();
  });

  it('returns NO_PROJECT_MARKER when the file is missing and createIfMissing is false', async () => {
    var service = new ScopeResolutionService(markerStoreStub());
    var result = await service.resolve({ roots: ['/project/new'] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe(NO_PROJECT_MARKER_REASON);
    }
  });

  it('creates a marker when createIfMissing is true', async () => {
    var store = markerStoreStub({
      ensureFromPath: vi.fn().mockResolvedValue({
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        folderName: 'new-app',
      }),
    });
    var service = new ScopeResolutionService(store);

    var result = await service.resolve({ roots: ['/project/new-app'], createIfMissing: true });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.hash).toBe('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    }
    expect(store.ensureFromPath).toHaveBeenCalledWith('/project/new-app');
  });

  it('resolves multiple roots as a workspace of marker ids', async () => {
    var store = markerStoreStub({
      findFromPath: vi
        .fn()
        .mockResolvedValueOnce({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', folderName: 'a' })
        .mockResolvedValueOnce({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', folderName: 'b' }),
    });
    var service = new ScopeResolutionService(store);

    var result = await service.resolve({ roots: ['/a', '/b'] });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.type).toBe('workspace');
      expect(result.value.slug).toBe('a+b');
    }
  });

  it('resolveUnscoped returns the stable no-folder bucket', () => {
    var service = new ScopeResolutionService(markerStoreStub());
    expect(isUnscoped(service.resolveUnscoped())).toBe(true);
  });
});
