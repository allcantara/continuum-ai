import { describe, expect, it, vi } from 'vitest';
import type { Container } from '../../src/container.js';
import { isUnscoped, projectScope } from '../../src/domain/scope/Scope.js';
import { projectHashFromPath } from '../../src/domain/scope/ProjectHash.js';
import { handleRestore, handleStash, handleSync, resolveScope } from '../../src/presentation/mcp/tools/handlers.js';
import { ok } from '../../src/application/Result.js';

function containerWithScopeResolution(overrides: {
  resolve?: ReturnType<typeof vi.fn>;
  resolveFromPath?: ReturnType<typeof vi.fn>;
  resolveUnscoped?: ReturnType<typeof vi.fn>;
}): Container {
  return {
    scopeResolution: {
      resolve: overrides.resolve ?? vi.fn(),
      resolveFromPath: overrides.resolveFromPath ?? vi.fn(),
      resolveUnscoped: overrides.resolveUnscoped ?? vi.fn(),
    },
  } as unknown as Container;
}

function containerWithRestore(overrides: {
  resolve?: ReturnType<typeof vi.fn>;
  restoreExecute?: ReturnType<typeof vi.fn>;
}): Container {
  var resolvedScope = projectScope(projectHashFromPath('/project/a'), 'a');
  return {
    scopeResolution: {
      resolve: overrides.resolve ?? vi.fn().mockResolvedValue(ok(resolvedScope)),
      resolveFromPath: vi.fn(),
      resolveUnscoped: vi.fn(),
    },
    restore: {
      execute: overrides.restoreExecute ?? vi.fn(),
    },
  } as unknown as Container;
}

describe('resolveScope', () => {
  it('resolves via roots when explicitly provided, regardless of source', async () => {
    var resolvedScope = projectScope(projectHashFromPath('/project/a'), 'a');
    var resolve = vi.fn().mockResolvedValue(ok(resolvedScope));
    var container = containerWithScopeResolution({ resolve });

    var scope = await resolveScope(container, ['/project/a'], 'mcp');

    expect(resolve).toHaveBeenCalledWith({ roots: ['/project/a'] });
    expect(scope).toBe(resolvedScope);
  });

  it('falls back to the terminal cwd for CLI calls without roots', async () => {
    var resolvedScope = projectScope(projectHashFromPath(process.cwd()), 'cwd-project');
    var resolveFromPath = vi.fn().mockResolvedValue(ok(resolvedScope));
    var container = containerWithScopeResolution({ resolveFromPath });

    var scope = await resolveScope(container, undefined, 'cli');

    expect(resolveFromPath).toHaveBeenCalledWith(process.cwd());
    expect(scope).toBe(resolvedScope);
  });

  it('falls back to the stable unscoped bucket for MCP calls without roots, instead of trusting the server process cwd', async () => {
    var resolveFromPath = vi.fn();
    var resolveUnscoped = vi.fn().mockReturnValue(projectScope('unscoped' as never, 'sem-projeto'));
    var container = containerWithScopeResolution({ resolveFromPath, resolveUnscoped });

    var scope = await resolveScope(container, undefined, 'mcp');

    expect(resolveFromPath).not.toHaveBeenCalled();
    expect(resolveUnscoped).toHaveBeenCalled();
    expect(isUnscoped(scope)).toBe(true);
  });
});

describe('handleStash', () => {
  it('returns an error response for malformed session ids instead of throwing', async () => {
    var resolvedScope = projectScope(projectHashFromPath('/project/a'), 'a');
    var container = {
      scopeResolution: {
        resolve: vi.fn().mockResolvedValue(ok(resolvedScope)),
        resolveFromPath: vi.fn(),
        resolveUnscoped: vi.fn(),
      },
      stash: { execute: vi.fn() },
    } as unknown as Container;

    var response = await handleStash(
      container,
      { session_id: 'invalid-id', roots: ['/project/a'] },
      'mcp',
    );

    expect(response.startsWith('Error:')).toBe(true);
  });
});

describe('handleRestore', () => {
  it('supports restoring an entire project from trash', async () => {
    var container = containerWithRestore({
      restoreExecute: vi.fn().mockResolvedValue(ok({ message: 'Restored 2 session(s) from trash' })),
    });

    var response = await handleRestore(
      container,
      { project: true, roots: ['/project/a'] },
      'mcp',
    );

    expect(response).toContain('Restored 2 session(s) from trash');
  });

  it('rejects a call with neither session_id nor project with a clear error, instead of a confusing downstream failure', async () => {
    var restoreExecute = vi.fn();
    var container = containerWithRestore({ restoreExecute });

    var response = await handleRestore(container, { roots: ['/project/a'] }, 'mcp');

    expect(response).toContain('Error:');
    expect(response).toContain('Either session_id or project must be provided');
    expect(restoreExecute).not.toHaveBeenCalled();
  });
});

describe('handleSync', () => {
  function containerWithEnableSync(overrides: { enableSyncExecute?: ReturnType<typeof vi.fn> }): Container {
    return {
      enableSync: { execute: overrides.enableSyncExecute ?? vi.fn() },
      syncStatus: { execute: vi.fn() },
    } as unknown as Container;
  }

  it('rejects an enable call missing remote_url instead of forwarding undefined to git', async () => {
    var enableSyncExecute = vi.fn();
    var container = containerWithEnableSync({ enableSyncExecute });

    var response = await handleSync(container, { action: 'enable' });

    expect(response).toContain('Error:');
    expect(response).toContain('remote_url is required for enable action');
    expect(enableSyncExecute).not.toHaveBeenCalled();
  });

  it('rejects an enable call whose remote_url is not a plausible git remote', async () => {
    var enableSyncExecute = vi.fn();
    var container = containerWithEnableSync({ enableSyncExecute });

    var response = await handleSync(container, { action: 'enable', remote_url: 'not-a-url' });

    expect(response).toContain('Error:');
    expect(response).toContain('plausible git remote URL');
    expect(enableSyncExecute).not.toHaveBeenCalled();
  });

  it('accepts a plausible remote_url for enable', async () => {
    var enableSyncExecute = vi.fn().mockResolvedValue(ok({ message: 'Sync enabled with git@example.com:user/repo.git' }));
    var container = containerWithEnableSync({ enableSyncExecute });

    var response = await handleSync(container, { action: 'enable', remote_url: 'git@example.com:user/repo.git' });

    expect(response).toContain('Sync enabled');
    expect(enableSyncExecute).toHaveBeenCalledWith({ remoteUrl: 'git@example.com:user/repo.git' });
  });
});
