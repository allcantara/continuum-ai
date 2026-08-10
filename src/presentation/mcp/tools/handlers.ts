import { z } from 'zod';
import type { Container } from '../../../container.js';
import type { Scope } from '../../../domain/scope/Scope.js';
import { sessionIdFrom } from '../../../domain/session/SessionId.js';
import type { ListSessionEntry } from '../../../application/list/ListSessionsUseCase.js';
import type { ListTrashEntry } from '../../../application/trash/ListTrashUseCase.js';
import type { RecapSessionEntry } from '../../../application/recap/RecapUseCase.js';

export async function resolveScope(
  container: Container,
  roots?: string[],
  cwd?: string,
): Promise<Scope> {
  if (roots && roots.length > 0) {
    var result = await container.scopeResolution.resolve({ roots });
    if (!result.ok) {
      throw new Error(result.reason);
    }
    return result.value;
  }

  var path = cwd ?? process.cwd();
  var result = await container.scopeResolution.resolveFromPath(path);
  if (!result.ok) {
    throw new Error(result.reason);
  }
  return result.value;
}

export const saveSchema = z.object({
  content: z.string().min(1).describe('Full cumulative session snapshot in markdown'),
  summary: z.string().optional().describe('Short summary (1-2 lines). Auto-extracted if omitted.'),
  roots: z.array(z.string()).optional().describe('Project root paths from MCP roots primitive'),
});

export async function handleSave(
  container: Container,
  args: z.infer<typeof saveSchema>,
): Promise<string> {
  var scope = await resolveScope(container, args.roots);
  var saveInput: { scope: Scope; content: string; summary?: string } = {
    scope,
    content: args.content,
  };
  if (args.summary !== undefined) {
    saveInput.summary = args.summary;
  }
  var result = await container.saveSession.execute(saveInput);

  if (!result.ok) {
    return `Error: ${result.reason}`;
  }

  var message = `Session saved: ${result.value.sessionId}`;
  if (result.value.syncWarning) {
    message += `\nSync warning: ${result.value.syncWarning}`;
  }
  return message;
}

export const loadSchema = z.object({
  roots: z.array(z.string()).optional().describe('Project root paths from MCP roots primitive'),
});

export async function handleLoad(
  container: Container,
  args: z.infer<typeof loadSchema>,
): Promise<string> {
  var scope = await resolveScope(container, args.roots);
  var result = await container.loadSession.execute({ scope });

  if (!result.ok) {
    return `Error: ${result.reason}`;
  }

  return [
    `# Session ${result.value.sessionId}`,
    `Summary: ${result.value.summary}`,
    `Created: ${result.value.createdAt}`,
    '',
    result.value.content,
  ].join('\n');
}

export const recapSchema = z.object({
  last: z.number().int().positive().optional().describe('Number of recent sessions to load (default: 5)'),
  roots: z.array(z.string()).optional(),
});

export async function handleRecap(
  container: Container,
  args: z.infer<typeof recapSchema>,
): Promise<string> {
  var scope = await resolveScope(container, args.roots);
  var recapInput: { scope: Scope; last?: number } = { scope };
  if (args.last !== undefined) {
    recapInput.last = args.last;
  }
  var result = await container.recap.execute(recapInput);

  if (!result.ok) {
    return `Error: ${result.reason}`;
  }

  return result.value.sessions
    .map(
      (s: RecapSessionEntry) =>
        `## ${s.sessionId} (${s.createdAt})\n${s.summary}\n\n${s.content}`,
    )
    .join('\n\n---\n\n');
}

export const listSchema = z.object({
  query: z.string().optional().describe('Search query'),
  all_projects: z.boolean().optional().describe('Search across all projects'),
  roots: z.array(z.string()).optional(),
});

export async function handleList(
  container: Container,
  args: z.infer<typeof listSchema>,
): Promise<string> {
  var scope = args.all_projects ? undefined : await resolveScope(container, args.roots);
  var listInput: { scope?: Scope; query?: string; allProjects?: boolean } = {};
  if (scope !== undefined) {
    listInput.scope = scope;
  }
  if (args.query !== undefined) {
    listInput.query = args.query;
  }
  if (args.all_projects !== undefined) {
    listInput.allProjects = args.all_projects;
  }
  var result = await container.listSessions.execute(listInput);

  if (!result.ok) {
    return `Error: ${result.reason}`;
  }

  if (result.value.sessions.length === 0) {
    return 'No sessions found.';
  }

  return result.value.sessions
    .map((s: ListSessionEntry) => `[${s.sessionId}] (${s.scopeType}:${s.scopeHash}) ${s.summary}`)
    .join('\n');
}

export const syncSchema = z.object({
  action: z.enum(['enable', 'status']).describe('Sync action'),
  remote_url: z.string().optional().describe('Git remote URL (required for enable)'),
});

export async function handleSync(
  container: Container,
  args: z.infer<typeof syncSchema>,
): Promise<string> {
  if (args.action === 'status') {
    var statusResult = await container.syncStatus.execute();
    if (!statusResult.ok) {
      return `Error: ${statusResult.reason}`;
    }
    var config = statusResult.value;
    return config.enabled
      ? `Sync enabled: ${config.remoteUrl}`
      : 'Sync disabled';
  }

  if (!args.remote_url) {
    return 'Error: remote_url is required for enable action';
  }

  var enableResult = await container.enableSync.execute({ remoteUrl: args.remote_url });
  if (!enableResult.ok) {
    return `Error: ${enableResult.reason}`;
  }
  return enableResult.value.message;
}

export const stashSchema = z.object({
  session_id: z.string().optional().describe('Session ID to stash'),
  project: z.boolean().optional().describe('Stash entire project/workspace'),
  roots: z.array(z.string()).optional(),
});

export async function handleStash(
  container: Container,
  args: z.infer<typeof stashSchema>,
): Promise<string> {
  var scope = await resolveScope(container, args.roots);
  var stashInput: { scope: Scope; sessionId?: ReturnType<typeof sessionIdFrom>; stashProject?: boolean } = { scope };
  if (args.session_id !== undefined) {
    stashInput.sessionId = sessionIdFrom(args.session_id);
  }
  if (args.project !== undefined) {
    stashInput.stashProject = args.project;
  }
  var result = await container.stash.execute(stashInput);

  if (!result.ok) {
    return `Error: ${result.reason}`;
  }

  var message = result.value.message;
  if (result.value.syncWarning) {
    message += `\nSync warning: ${result.value.syncWarning}`;
  }
  return message;
}

export async function handleTrash(container: Container): Promise<string> {
  var result = await container.listTrash.execute();

  if (!result.ok) {
    return `Error: ${result.reason}`;
  }

  if (result.value.items.length === 0) {
    return 'Trash is empty.';
  }

  return result.value.items
    .map((item: ListTrashEntry) => `[${item.sessionId}] (${item.scopeType}:${item.scopeHash}) ${item.summary}`)
    .join('\n');
}

export const restoreSchema = z.object({
  session_id: z.string().describe('Session ID to restore from trash'),
  roots: z.array(z.string()).optional(),
});

export async function handleRestore(
  container: Container,
  args: z.infer<typeof restoreSchema>,
): Promise<string> {
  var scope = await resolveScope(container, args.roots);
  var result = await container.restore.execute({
    scope,
    sessionId: sessionIdFrom(args.session_id),
  });

  if (!result.ok) {
    return `Error: ${result.reason}`;
  }

  var message = result.value.message;
  if (result.value.syncWarning) {
    message += `\nSync warning: ${result.value.syncWarning}`;
  }
  return message;
}
