import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installContinuumCursorCommands } from '../../src/infrastructure/cursor/CursorCommandInstaller.js';
import {
  buildContinuumMcpServerEntry,
  mergeContinuumMcpServer,
  parseCursorMcpConfig,
} from '../../src/infrastructure/cursor/CursorMcpConfig.js';
import { CONTINUUM_MCP_SERVER_NAME } from '../../src/infrastructure/cursor/CursorPaths.js';
import { writeContinuumCursorMcpConfig } from '../../src/infrastructure/cursor/CursorMcpConfigWriter.js';

describe('CursorMcpConfig', () => {
  it('parseCursorMcpConfig rejects invalid JSON', () => {
    var result = parseCursorMcpConfig('{not-json');
    expect(result.ok).toBe(false);
  });

  it('mergeContinuumMcpServer preserves other servers and updates continuum entry', () => {
    var serverPath = '/opt/homebrew/lib/node_modules/continuum-ai/dist/presentation/mcp/server.js';
    var merged = mergeContinuumMcpServer(
      {
        mcpServers: {
          other: { command: 'other-tool' },
        },
      },
      serverPath,
    );

    expect(merged.updated).toBe(true);
    expect(merged.config.mcpServers?.other.command).toBe('other-tool');
    expect(merged.config.mcpServers?.[CONTINUUM_MCP_SERVER_NAME]).toEqual(
      buildContinuumMcpServerEntry(serverPath),
    );
  });

  it('mergeContinuumMcpServer is idempotent when entry is unchanged', () => {
    var serverPath = '/tmp/server.js';
    var entry = buildContinuumMcpServerEntry(serverPath);
    var config = { mcpServers: { [CONTINUUM_MCP_SERVER_NAME]: entry } };

    var merged = mergeContinuumMcpServer(config, serverPath);
    expect(merged.updated).toBe(false);
  });
});

describe('writeContinuumCursorMcpConfig', () => {
  var tempHome = '';

  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'continuum-cursor-'));
    vi.stubEnv('HOME', tempHome);
    if (process.platform === 'win32') {
      vi.stubEnv('USERPROFILE', tempHome);
    }
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(tempHome, { recursive: true, force: true });
  });

  it('creates mcp.json with continuum server when file is missing', async () => {
    var serverPath = '/opt/continuum/server.js';
    var result = await writeContinuumCursorMcpConfig(serverPath);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    var raw = await readFile(join(tempHome, '.cursor', 'mcp.json'), 'utf-8');
    var parsed = JSON.parse(raw) as { mcpServers: Record<string, { command: string }> };
    expect(parsed.mcpServers[CONTINUUM_MCP_SERVER_NAME].command).toBe(serverPath);
    expect(result.value.updated).toBe(true);
  });

  it('returns updated false when continuum entry already matches', async () => {
    var serverPath = '/opt/continuum/server.js';
    var cursorDir = join(tempHome, '.cursor');
    await mkdir(cursorDir, { recursive: true });
    await writeContinuumCursorMcpConfig(serverPath);

    var second = await writeContinuumCursorMcpConfig(serverPath);
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.value.updated).toBe(false);
    }
  });
});

describe('installContinuumCursorCommands', () => {
  var tempHome = '';

  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'continuum-cursor-cmd-'));
    vi.stubEnv('HOME', tempHome);
    if (process.platform === 'win32') {
      vi.stubEnv('USERPROFILE', tempHome);
    }
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(tempHome, { recursive: true, force: true });
  });

  it('installs slash commands for every Continuum MCP tool', async () => {
    var result = await installContinuumCursorCommands();

    expect(result.installed).toHaveLength(9);
    expect(result.installed).toEqual(
      expect.arrayContaining([
        'continuum-save.md',
        'continuum-load.md',
        'continuum-recap.md',
        'continuum-list.md',
        'continuum-sync-status.md',
        'continuum-sync-enable.md',
        'continuum-stash.md',
        'continuum-trash.md',
        'continuum-restore.md',
      ]),
    );
  });

  it('instructs managed slash commands to pass roots with the workspace path', async () => {
    await installContinuumCursorCommands();
    var commandsDir = join(tempHome, '.cursor', 'commands');

    for (var fileName of ['continuum-save.md', 'continuum-load.md', 'continuum-recap.md', 'continuum-list.md']) {
      var content = await readFile(join(commandsDir, fileName), 'utf-8');
      expect(content).toContain('roots');
      expect(content).toContain('sem-projeto');
    }
  });
});
