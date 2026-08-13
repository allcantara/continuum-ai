import { describe, expect, it, vi } from 'vitest';
import type { Container } from '../../src/container.js';
import { isUnscoped, projectScope, unscopedProjectScope } from '../../src/domain/scope/Scope.js';
import { projectHashFromPath } from '../../src/domain/scope/ProjectHash.js';
import { handleList, handleLoad, handleRecap, handleRestore, handleStash, resolveScope, ROOTS_DESCRIPTION, ROOTS_TOOL_HINT } from '../../src/presentation/mcp/tools/handlers.js';
import { err, ok } from '../../src/application/Result.js';

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

    expect(resolve).toHaveBeenCalledWith({ roots: ['/project/a'], createIfMissing: false });
    expect(scope).toBe(resolvedScope);
  });

  it('falls back to the terminal cwd for CLI calls without roots', async () => {
    var resolvedScope = projectScope(projectHashFromPath(process.cwd()), 'cwd-project');
    var resolveFromPath = vi.fn().mockResolvedValue(ok(resolvedScope));
    var container = containerWithScopeResolution({ resolveFromPath });

    var scope = await resolveScope(container, undefined, 'cli');

    expect(resolveFromPath).toHaveBeenCalledWith(process.cwd(), false);
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

describe('roots parameter copy', () => {
  it('tells the agent to pass a known folder including home, and to omit only when no path is known', () => {
    expect(ROOTS_DESCRIPTION).toContain('user home');
    expect(ROOTS_DESCRIPTION).toContain('sem-projeto');
    expect(ROOTS_DESCRIPTION).not.toContain('Omit only when no folder is open');
    expect(ROOTS_TOOL_HINT).toContain('user home directory');
    expect(ROOTS_TOOL_HINT).toContain('sem-projeto');
  });
});

describe('handleList', () => {
  it('tells the caller to pass roots or use all_projects when the unscoped bucket is empty', async () => {
    var container = {
      scopeResolution: {
        resolve: vi.fn(),
        resolveFromPath: vi.fn(),
        resolveUnscoped: vi.fn().mockReturnValue(unscopedProjectScope()),
      },
      listSessions: {
        execute: vi.fn().mockResolvedValue(ok({ sessions: [] })),
      },
    } as unknown as Container;

    var response = await handleList(container, {}, 'mcp');

    expect(response).toContain('sem-projeto');
    expect(response).toContain('all_projects');
    expect(response).toContain('roots');
  });
});

describe('handleLoad', () => {
  it('explains the empty unscoped bucket instead of a generic not-found error', async () => {
    var container = {
      scopeResolution: {
        resolve: vi.fn(),
        resolveFromPath: vi.fn(),
        resolveUnscoped: vi.fn().mockReturnValue(unscopedProjectScope()),
      },
      loadSession: {
        execute: vi.fn().mockResolvedValue(err('No session found for current scope')),
      },
    } as unknown as Container;

    var response = await handleLoad(container, {}, 'mcp');

    expect(response).toContain('sem-projeto');
    expect(response).toContain('all_projects');
  });
});

describe('handleRecap', () => {
  it('explains the empty unscoped bucket instead of a generic not-found error', async () => {
    var container = {
      scopeResolution: {
        resolve: vi.fn(),
        resolveFromPath: vi.fn(),
        resolveUnscoped: vi.fn().mockReturnValue(unscopedProjectScope()),
      },
      recap: {
        execute: vi.fn().mockResolvedValue(err('No sessions found for current scope')),
      },
    } as unknown as Container;

    var response = await handleRecap(container, {}, 'mcp');

    expect(response).toContain('sem-projeto');
    expect(response).toContain('roots');
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
