import type { Result } from '../../application/Result.js';
import { err, ok } from '../../application/Result.js';
import { CONTINUUM_MCP_SERVER_NAME } from './CursorPaths.js';

export type CursorMcpServerEntry = {
  readonly command: string;
  readonly args?: string[];
  readonly env?: Record<string, string>;
};

export type CursorMcpConfig = {
  readonly mcpServers?: Record<string, CursorMcpServerEntry>;
};

export function buildContinuumMcpServerEntry(serverPath: string): CursorMcpServerEntry {
  if (process.platform === 'win32') {
    return { command: process.execPath, args: [serverPath] };
  }
  return { command: serverPath };
}

export function mergeContinuumMcpServer(
  config: CursorMcpConfig,
  serverPath: string,
): { config: CursorMcpConfig; updated: boolean } {
  var nextEntry = buildContinuumMcpServerEntry(serverPath);
  var existing = config.mcpServers?.[CONTINUUM_MCP_SERVER_NAME];

  if (existing !== undefined && entriesEqual(existing, nextEntry)) {
    return { config, updated: false };
  }

  return {
    config: {
      ...config,
      mcpServers: {
        ...config.mcpServers,
        [CONTINUUM_MCP_SERVER_NAME]: nextEntry,
      },
    },
    updated: true,
  };
}

export function parseCursorMcpConfig(raw: string): Result<CursorMcpConfig> {
  try {
    var parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return err('Cursor mcp.json must be a JSON object');
    }
    return ok(parsed as CursorMcpConfig);
  } catch {
    return err('Cursor mcp.json is not valid JSON');
  }
}

function entriesEqual(left: CursorMcpServerEntry, right: CursorMcpServerEntry): boolean {
  return (
    left.command === right.command
    && JSON.stringify(left.args ?? []) === JSON.stringify(right.args ?? [])
    && JSON.stringify(left.env ?? {}) === JSON.stringify(right.env ?? {})
  );
}
