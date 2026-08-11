import { homedir } from 'node:os';
import { join } from 'node:path';

export const CONTINUUM_MCP_SERVER_NAME = 'continuum';

export function resolveCursorHome(): string {
  return join(homedir(), '.cursor');
}

export function resolveCursorMcpConfigPath(): string {
  return join(resolveCursorHome(), 'mcp.json');
}

export function resolveCursorCommandsDir(): string {
  return join(resolveCursorHome(), 'commands');
}
