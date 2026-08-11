import { describe, expect, it } from 'vitest';
import { ScopeRootCache } from '../../src/presentation/mcp/ScopeRootCache.js';

describe('ScopeRootCache', () => {
  it('stores explicit roots and reuses them when later calls omit roots', () => {
    var cache = new ScopeRootCache();

    var first = cache.resolve(['/project/a'], undefined);
    expect(first.roots).toEqual(['/project/a']);
    expect(first.fromProcessCache).toBe(false);

    var second = cache.resolve(undefined, undefined);
    expect(second.roots).toEqual(['/project/a']);
    expect(second.fromProcessCache).toBe(true);
  });

  it('overwrites cached roots when a new explicit path is provided', () => {
    var cache = new ScopeRootCache();

    cache.resolve(['/project/a'], undefined);
    var updated = cache.resolve(['/project/b'], undefined);

    expect(updated.roots).toEqual(['/project/b']);
    expect(updated.fromProcessCache).toBe(false);

    var reused = cache.resolve(undefined, undefined);
    expect(reused.roots).toEqual(['/project/b']);
  });
});
