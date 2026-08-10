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
      content: [{ type: 'text' as const, text: await handleSave(container, args) }],
    }),
  );

  server.tool(
    'continuum_load',
    'Load the most recent session for the current project or workspace',
    loadSchema.shape,
    async (args) => ({
      content: [{ type: 'text' as const, text: await handleLoad(container, args) }],
    }),
  );

  server.tool(
    'continuum_recap',
    'Load the last N sessions for deeper history (default: 5)',
    recapSchema.shape,
    async (args) => ({
      content: [{ type: 'text' as const, text: await handleRecap(container, args) }],
    }),
  );

  server.tool(
    'continuum_list',
    'Search and list sessions via the index',
    listSchema.shape,
    async (args) => ({
      content: [{ type: 'text' as const, text: await handleList(container, args) }],
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
      content: [{ type: 'text' as const, text: await handleStash(container, args) }],
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
      content: [{ type: 'text' as const, text: await handleRestore(container, args) }],
    }),
  );

  var transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Continuum MCP server failed:', error);
  process.exit(1);
});
