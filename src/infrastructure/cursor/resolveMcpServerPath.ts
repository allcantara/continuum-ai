import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export function resolveBundledMcpServerPath(): string {
  var currentFile = fileURLToPath(import.meta.url);
  return join(dirname(currentFile), '../../presentation/mcp/server.js');
}
