import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createContainer } from '../../container.js';
import {
  handleList,
  handleLoad,
  handleRecap,
  handleRestore,
  handleSave,
  handleStash,
  handleSync,
  handleTrash,
  listSchema,
  loadSchema,
  recapSchema,
  restoreSchema,
  saveSchema,
  stashSchema,
  syncSchema,
} from './tools/handlers.js';

/**
 * Queries the MCP `roots` primitive so the client's open workspace folders drive
 * scope resolution, instead of relying on the calling agent to pass them manually.
 * Falls back to `undefined` when the client has no roots (or doesn't support the capability).
 */
async function resolveClientRoots(server: McpServer): Promise<string[] | undefined> {
  try {
    var result = await server.server.listRoots();
    var paths = result.roots
      .map((root) => fileUriToPath(root.uri))
      .filter((path): path is string => path !== null);
    return paths.length > 0 ? paths : undefined;
  } catch {
    return undefined;
  }
}

function fileUriToPath(uri: string): string | null {
  try {
    var url = new URL(uri);
    if (url.protocol !== 'file:') {
      return null;
    }
    return decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
}

async function withResolvedRoots<T extends { roots?: string[] | undefined }>(
  server: McpServer,
  args: T,
): Promise<T> {
  var clientRoots = await resolveClientRoots(server);
  if (clientRoots === undefined) {
    return args;
  }
  return { ...args, roots: clientRoots };
}

async function main(): Promise<void> {
  var container = await createContainer();

  var server = new McpServer({
    name: 'continuum',
    version: '0.1.0',
  });

  server.tool(
    'continuum_save',
    'Save a cumulative session snapshot of the current work context',
    saveSchema.shape,
    async (args) => ({
      content: [{ type: 'text' as const, text: await handleSave(container, await withResolvedRoots(server, args)) }],
    }),
  );

  server.tool(
    'continuum_load',
    'Load the most recent session for the current project or workspace',
    loadSchema.shape,
    async (args) => ({
      content: [{ type: 'text' as const, text: await handleLoad(container, await withResolvedRoots(server, args)) }],
    }),
  );

  server.tool(
    'continuum_recap',
    'Load the last N sessions for deeper history (default: 5)',
    recapSchema.shape,
    async (args) => ({
      content: [{ type: 'text' as const, text: await handleRecap(container, await withResolvedRoots(server, args)) }],
    }),
  );

  server.tool(
    'continuum_list',
    'Search and list sessions via the index',
    listSchema.shape,
    async (args) => ({
      content: [{ type: 'text' as const, text: await handleList(container, await withResolvedRoots(server, args)) }],
    }),
  );

  server.tool(
    'continuum_sync',
    'Enable or check git sync configuration',
    syncSchema.shape,
    async (args) => ({
      content: [{ type: 'text' as const, text: await handleSync(container, args) }],
    }),
  );

  server.tool(
    'continuum_stash',
    'Move a session or entire project/workspace to trash',
    stashSchema.shape,
    async (args) => ({
      content: [{ type: 'text' as const, text: await handleStash(container, await withResolvedRoots(server, args)) }],
    }),
  );

  server.tool(
    'continuum_trash',
    'List items in trash',
    {},
    async () => ({
      content: [{ type: 'text' as const, text: await handleTrash(container) }],
    }),
  );

  server.tool(
    'continuum_restore',
    'Restore a session from trash',
    restoreSchema.shape,
    async (args) => ({
      content: [{ type: 'text' as const, text: await handleRestore(container, await withResolvedRoots(server, args)) }],
    }),
  );

  var transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Continuum MCP server failed:', error);
  process.exit(1);
});
