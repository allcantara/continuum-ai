#!/usr/bin/env node

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
  restoreInputSchema,
  saveSchema,
  stashSchema,
  syncInputSchema,
  ROOTS_TOOL_HINT,
  type ScopeResolutionOptions,
} from './tools/handlers.js';
import { isErrorResponse } from './tools/ResponseFormatting.js';
import { ScopeRootCache } from './ScopeRootCache.js';

const scopeRootCache = new ScopeRootCache();

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

export type ResolvedToolArgs<T> = T & {
  readonly _scopeFromCache?: boolean;
};

/**
 * An explicit `roots` argument (supplied by the calling agent) always wins over the
 * MCP `roots` primitive: the primitive is unreliable in practice (e.g. Cursor
 * advertises support for it but its `roots/list` call fails), while an agent that
 * already knows the open workspace path is a much stronger signal.
 */
async function withResolvedRoots<T extends { roots?: string[] | undefined }>(
  server: McpServer,
  args: T,
): Promise<ResolvedToolArgs<T>> {
  var explicitRoots = args.roots && args.roots.length > 0 ? args.roots : undefined;
  var clientRoots = explicitRoots ? undefined : await resolveClientRoots(server);
  var resolution = scopeRootCache.resolve(explicitRoots, clientRoots);

  if (resolution.roots === undefined) {
    return args;
  }

  if (resolution.fromProcessCache) {
    return { ...args, roots: resolution.roots, _scopeFromCache: true };
  }

  return { ...args, roots: resolution.roots };
}

function scopeOptionsFromArgs<T extends ResolvedToolArgs<{ roots?: string[] | undefined }>>(
  args: T,
): ScopeResolutionOptions | undefined {
  return args._scopeFromCache ? { fromProcessCache: true } : undefined;
}

async function mcpTextResult(textPromise: Promise<string>) {
  var text = await textPromise;
  return {
    content: [{ type: 'text' as const, text }],
    isError: isErrorResponse(text),
  };
}

async function main(): Promise<void> {
  var container = await createContainer();

  var server = new McpServer({
    name: 'continuum',
    version: '0.1.3',
  });

  server.registerTool(
    'continuum_save',
    {
      description: 'Save a cumulative session snapshot of the current work context.' + ROOTS_TOOL_HINT,
      inputSchema: saveSchema.shape,
    },
    async (args) => {
      var resolvedArgs = await withResolvedRoots(server, args);
      return mcpTextResult(handleSave(container, resolvedArgs, 'mcp', scopeOptionsFromArgs(resolvedArgs)));
    },
  );

  server.registerTool(
    'continuum_load',
    {
      description: 'Load the most recent session for the current project or workspace.' + ROOTS_TOOL_HINT,
      inputSchema: loadSchema.shape,
    },
    async (args) => {
      var resolvedArgs = await withResolvedRoots(server, args);
      return mcpTextResult(handleLoad(container, resolvedArgs, 'mcp', scopeOptionsFromArgs(resolvedArgs)));
    },
  );

  server.registerTool(
    'continuum_recap',
    {
      description: 'Load the last N sessions for deeper history (default: 5).' + ROOTS_TOOL_HINT,
      inputSchema: recapSchema.shape,
    },
    async (args) => {
      var resolvedArgs = await withResolvedRoots(server, args);
      return mcpTextResult(handleRecap(container, resolvedArgs, 'mcp', scopeOptionsFromArgs(resolvedArgs)));
    },
  );

  server.registerTool(
    'continuum_list',
    {
      description: 'Search and list sessions via the index.' + ROOTS_TOOL_HINT,
      inputSchema: listSchema.shape,
    },
    async (args) => {
      var resolvedArgs = await withResolvedRoots(server, args);
      return mcpTextResult(handleList(container, resolvedArgs, 'mcp', scopeOptionsFromArgs(resolvedArgs)));
    },
  );

  server.registerTool(
    'continuum_sync',
    {
      description: 'Enable or check git sync configuration',
      inputSchema: syncInputSchema.shape,
    },
    async (args) => mcpTextResult(handleSync(container, args)),
  );

  server.registerTool(
    'continuum_stash',
    {
      description: 'Move a session or entire project/workspace to trash.' + ROOTS_TOOL_HINT,
      inputSchema: stashSchema.shape,
    },
    async (args) => {
      var resolvedArgs = await withResolvedRoots(server, args);
      return mcpTextResult(handleStash(container, resolvedArgs, 'mcp', scopeOptionsFromArgs(resolvedArgs)));
    },
  );

  server.registerTool(
    'continuum_trash',
    { description: 'List items in trash' },
    async () => mcpTextResult(handleTrash(container)),
  );

  server.registerTool(
    'continuum_restore',
    {
      description: 'Restore a session or entire project/workspace from trash.' + ROOTS_TOOL_HINT,
      inputSchema: restoreInputSchema.shape,
    },
    async (args) => {
      var resolvedArgs = await withResolvedRoots(server, args);
      return mcpTextResult(handleRestore(container, resolvedArgs, 'mcp', scopeOptionsFromArgs(resolvedArgs)));
    },
  );

  var transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Continuum MCP server failed:', error);
  process.exit(1);
});
