import { z } from 'zod';
import type { Container } from '../../../container.js';
import { isUnscoped } from '../../../domain/scope/Scope.js';
import type { Scope } from '../../../domain/scope/Scope.js';
import { isPlausibleGitRemote } from '../../../domain/scope/ProjectHash.js';
import { sessionIdFrom } from '../../../domain/session/SessionId.js';
import type { ListSessionEntry } from '../../../application/list/ListSessionsUseCase.js';
import type { ListTrashEntry } from '../../../application/trash/ListTrashUseCase.js';
import type { RecapSessionEntry } from '../../../application/recap/RecapUseCase.js';
import { appendWarnings, formatWarning } from './ResponseFormatting.js';

/**
 * `cli`: the terminal's own working directory is a trustworthy signal of the project
 * the user is in, so it's used as a fallback.
 * `mcp`: the MCP server process's cwd is set by the client at spawn time and is NOT
 * reliably tied to the workspace open in the calling chat — falling back to it would
 * silently mix up projects. Without an explicit `roots` argument, MCP calls land in
 * the stable "sem-projeto" bucket instead of guessing.
 */
export type ScopeSource = 'cli' | 'mcp';

export type ScopeResolutionOptions = {
  readonly fromProcessCache?: boolean;
};

export async function resolveScope(
  container: Container,
  roots: string[] | undefined,
  source: ScopeSource,
): Promise<Scope> {
  if (roots && roots.length > 0) {
    var result = await container.scopeResolution.resolve({ roots });
    if (!result.ok) {
      throw new Error(result.reason);
    }
    return result.value;
  }

  if (source === 'cli') {
    var pathResult = await container.scopeResolution.resolveFromPath(process.cwd());
    if (!pathResult.ok) {
      throw new Error(pathResult.reason);
    }
    return pathResult.value;
  }

  return container.scopeResolution.resolveUnscoped();
}

const UNSCOPED_WARNING = formatWarning(
  'nenhuma raiz de workspace foi informada (roots). Sessão salva no espaço genérico "sem-projeto", ' +
  'compartilhado por todos os chats sem projeto aberto. Para vincular ao projeto certo, informe o caminho ' +
  'absoluto do workspace no parâmetro roots.',
);

const CACHED_SCOPE_WARNING = formatWarning(
  'escopo reaproveitado da chamada anterior desta sessão MCP. Informe roots explicitamente se o workspace mudou.',
);

const PATH_BASED_WARNING = formatWarning(
  'o remoto git não pôde ser lido; a identidade usou o caminho da pasta e pode não coincidir com sessões ' +
  'salvas quando o remoto estava disponível. Se a lista vier vazia, passe roots e tente all_projects: true.',
);

const TRUNCATION_WARNING = formatWarning(
  'conteúdo truncado para caber no contexto do modelo. O arquivo completo permanece salvo em disco.',
);

const EMPTY_UNSCOPED =
  'No sessions found in the shared "sem-projeto" bucket. Sessions for an open project are stored under ' +
  'that project — pass roots with the workspace absolute path, or call again with all_projects: true.';

function isPathBasedScope(scope: Scope): boolean {
  if (scope.type !== 'project' || isUnscoped(scope) || !scope.sourceHint) {
    return false;
  }
  if (isPlausibleGitRemote(scope.sourceHint)) {
    return false;
  }
  return scope.sourceHint.startsWith('/') || /^[A-Za-z]:[\\/]/.test(scope.sourceHint);
}

function emptySessionsMessage(scope: Scope | undefined, fallback: string): string {
  if (scope && isUnscoped(scope)) {
    return EMPTY_UNSCOPED;
  }
  return fallback;
}

function withScopeWarnings(message: string, scope: Scope, options?: ScopeResolutionOptions): string {
  var warnings: string[] = [];
  if (isUnscoped(scope)) {
    warnings.push(UNSCOPED_WARNING);
  }
  if (isPathBasedScope(scope)) {
    warnings.push(PATH_BASED_WARNING);
  }
  if (options?.fromProcessCache) {
    warnings.push(CACHED_SCOPE_WARNING);
  }
  return appendWarnings(message, warnings);
}

export const ROOTS_TOOL_HINT =
  ' Always pass `roots` with the absolute path of the open workspace. Cursor does not implement MCP ' +
  'roots/list; omitting roots uses the shared "sem-projeto" bucket instead of this project.';

export const ROOTS_DESCRIPTION =
  'Absolute workspace path(s). REQUIRED in Cursor (roots/list is broken). Omit only when no folder is open — then the shared sem-projeto bucket is used.';

type ParsedSessionId =
  | { readonly ok: true; readonly id: ReturnType<typeof sessionIdFrom> }
  | { readonly ok: false; readonly error: string };

function parseSessionIdSafe(value: string): ParsedSessionId {
  try {
    return { ok: true, id: sessionIdFrom(value) };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

function formatScopeLabel(entry: { scopeType: string; scopeSlug: string; scopeHash: string }): string {
  return entry.scopeSlug
    ? `${entry.scopeType}:${entry.scopeSlug}(${entry.scopeHash})`
    : `${entry.scopeType}:${entry.scopeHash}`;
}

/**
 * `superRefine`-based schemas (e.g. `syncSchema`, `restoreSchema`) can't be passed as an MCP
 * tool's `inputSchema` — the SDK needs a plain `ZodRawShape` (`.shape`), which a
 * `ZodEffects` wrapper doesn't expose — so the refined schema must be applied here, inside
 * the handler, for both the CLI and MCP call paths.
 */
function parseOrError<T>(schema: z.ZodType<T>, args: unknown): { ok: true; value: T } | { ok: false; error: string } {
  var result = schema.safeParse(args);
  if (result.success) {
    return { ok: true, value: result.data };
  }
  return { ok: false, error: result.error.issues.map((issue) => issue.message).join('; ') };
}

export const saveSchema = z.object({
  content: z.string().min(1).describe('Full cumulative session snapshot in markdown'),
  summary: z.string().optional().describe('Short summary (1-2 lines). Auto-extracted if omitted.'),
  roots: z.array(z.string()).optional().describe(ROOTS_DESCRIPTION),
});

export async function handleSave(
  container: Container,
  args: z.infer<typeof saveSchema>,
  source: ScopeSource,
  scopeOptions?: ScopeResolutionOptions,
): Promise<string> {
  var scope = await resolveScope(container, args.roots, source);
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

  var warnings: string[] = [];
  if (result.value.syncWarning) {
    warnings.push(formatWarning(`sync: ${result.value.syncWarning}`));
  }
  if (result.value.securityWarning) {
    warnings.push(result.value.securityWarning);
  }

  return appendWarnings(
    withScopeWarnings(`Session saved: ${result.value.sessionId}`, scope, scopeOptions),
    warnings,
  );
}

export const loadSchema = z.object({
  roots: z.array(z.string()).optional().describe(ROOTS_DESCRIPTION),
});

export async function handleLoad(
  container: Container,
  args: z.infer<typeof loadSchema>,
  source: ScopeSource,
  scopeOptions?: ScopeResolutionOptions,
): Promise<string> {
  var scope = await resolveScope(container, args.roots, source);
  var result = await container.loadSession.execute({ scope });

  if (!result.ok) {
    return withScopeWarnings(`Error: ${emptySessionsMessage(scope, result.reason)}`, scope, scopeOptions);
  }

  var body = [
    `# Session ${result.value.sessionId}`,
    `Summary: ${result.value.summary}`,
    `Created: ${result.value.createdAt}`,
    '',
    result.value.content,
  ].join('\n');

  var warnings = result.value.truncated ? [TRUNCATION_WARNING] : [];
  return appendWarnings(body, warnings);
}

export const recapSchema = z.object({
  last: z.number().int().positive().optional().describe('Number of recent sessions to load (default: 5)'),
  roots: z.array(z.string()).optional().describe(ROOTS_DESCRIPTION),
});

export async function handleRecap(
  container: Container,
  args: z.infer<typeof recapSchema>,
  source: ScopeSource,
  scopeOptions?: ScopeResolutionOptions,
): Promise<string> {
  var scope = await resolveScope(container, args.roots, source);
  var recapInput: { scope: Scope; last?: number } = { scope };
  if (args.last !== undefined) {
    recapInput.last = args.last;
  }
  var result = await container.recap.execute(recapInput);

  if (!result.ok) {
    return withScopeWarnings(`Error: ${emptySessionsMessage(scope, result.reason)}`, scope, scopeOptions);
  }

  var body = result.value.sessions
    .map(
      (s: RecapSessionEntry) =>
        `## ${s.sessionId} (${s.createdAt})\n${s.summary}\n\n${s.content}`,
    )
    .join('\n\n---\n\n');

  var warnings = result.value.anyTruncated ? [TRUNCATION_WARNING] : [];
  return appendWarnings(withScopeWarnings(body, scope, scopeOptions), warnings);
}

export const listSchema = z.object({
  query: z.string().optional().describe('Search query'),
  all_projects: z.boolean().optional().describe('Search across all projects'),
  roots: z.array(z.string()).optional().describe(ROOTS_DESCRIPTION),
});

export async function handleList(
  container: Container,
  args: z.infer<typeof listSchema>,
  source: ScopeSource,
  scopeOptions?: ScopeResolutionOptions,
): Promise<string> {
  var scope = args.all_projects ? undefined : await resolveScope(container, args.roots, source);
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
    return scope
      ? withScopeWarnings(emptySessionsMessage(scope, 'No sessions found.'), scope, scopeOptions)
      : 'No sessions found.';
  }

  return result.value.sessions
    .map((s: ListSessionEntry) => `[${s.sessionId}] (${formatScopeLabel(s)}) ${s.summary}`)
    .join('\n');
}

export const syncInputSchema = z.object({
  action: z.enum(['enable', 'status']).describe('Sync action'),
  remote_url: z.string().optional().describe('Git remote URL (required for enable)'),
});

export const syncSchema = syncInputSchema.superRefine((value, ctx) => {
    if (value.action !== 'enable') {
      return;
    }

    if (!value.remote_url) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'remote_url is required for enable action',
        path: ['remote_url'],
      });
      return;
    }

    if (!isPlausibleGitRemote(value.remote_url)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'remote_url must be a plausible git remote URL (https://, git@, or ssh://)',
        path: ['remote_url'],
      });
    }
  });

export async function handleSync(
  container: Container,
  args: z.infer<typeof syncInputSchema>,
): Promise<string> {
  var validation = parseOrError(syncSchema, args);
  if (!validation.ok) {
    return `Error: ${validation.error}`;
  }
  var validArgs = validation.value;

  if (validArgs.action === 'status') {
    var statusResult = await container.syncStatus.execute();
    if (!statusResult.ok) {
      return `Error: ${statusResult.reason}`;
    }
    var config = statusResult.value;
    return config.enabled
      ? `Sync enabled: ${config.remoteUrl}`
      : 'Sync disabled';
  }

  var enableResult = await container.enableSync.execute({ remoteUrl: validArgs.remote_url! });
  if (!enableResult.ok) {
    return `Error: ${enableResult.reason}`;
  }
  return enableResult.value.message;
}

export const stashSchema = z.object({
  session_id: z.string().optional().describe('Session ID to stash'),
  project: z.boolean().optional().describe('Stash entire project/workspace'),
  roots: z.array(z.string()).optional().describe(ROOTS_DESCRIPTION),
});

export async function handleStash(
  container: Container,
  args: z.infer<typeof stashSchema>,
  source: ScopeSource,
  scopeOptions?: ScopeResolutionOptions,
): Promise<string> {
  var scope = await resolveScope(container, args.roots, source);
  var stashInput: { scope: Scope; sessionId?: ReturnType<typeof sessionIdFrom>; stashProject?: boolean } = { scope };

  if (args.session_id !== undefined) {
    var parsedSessionId = parseSessionIdSafe(args.session_id);
    if (!parsedSessionId.ok) {
      return withScopeWarnings(`Error: ${parsedSessionId.error}`, scope, scopeOptions);
    }
    stashInput.sessionId = parsedSessionId.id;
  }

  if (args.project !== undefined) {
    stashInput.stashProject = args.project;
  }

  var result = await container.stash.execute(stashInput);

  if (!result.ok) {
    return withScopeWarnings(`Error: ${result.reason}`, scope, scopeOptions);
  }

  var warnings = result.value.syncWarning ? [formatWarning(`sync: ${result.value.syncWarning}`)] : [];
  return appendWarnings(withScopeWarnings(result.value.message, scope, scopeOptions), warnings);
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
    .map((item: ListTrashEntry) => `[${item.sessionId}] (${formatScopeLabel(item)}) ${item.summary}`)
    .join('\n');
}

export const restoreInputSchema = z.object({
  session_id: z.string().optional().describe('Session ID to restore from trash'),
  project: z.boolean().optional().describe('Restore entire project/workspace from trash'),
  roots: z.array(z.string()).optional().describe(ROOTS_DESCRIPTION),
});

export const restoreSchema = restoreInputSchema.superRefine((value, ctx) => {
    if (!value.project && !value.session_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Either session_id or project must be provided',
      });
    }
  });

export async function handleRestore(
  container: Container,
  args: z.infer<typeof restoreInputSchema>,
  source: ScopeSource,
  scopeOptions?: ScopeResolutionOptions,
): Promise<string> {
  var scope = await resolveScope(container, args.roots, source);
  var validation = parseOrError(restoreSchema, args);
  if (!validation.ok) {
    return withScopeWarnings(`Error: ${validation.error}`, scope, scopeOptions);
  }

  var restoreInput: {
    scope: Scope;
    sessionId?: ReturnType<typeof sessionIdFrom>;
    restoreProject?: boolean;
  } = { scope };

  if (args.session_id !== undefined) {
    var parsedSessionId = parseSessionIdSafe(args.session_id);
    if (!parsedSessionId.ok) {
      return withScopeWarnings(`Error: ${parsedSessionId.error}`, scope, scopeOptions);
    }
    restoreInput.sessionId = parsedSessionId.id;
  }

  if (args.project !== undefined) {
    restoreInput.restoreProject = args.project;
  }

  var result = await container.restore.execute(restoreInput);

  if (!result.ok) {
    return withScopeWarnings(`Error: ${result.reason}`, scope, scopeOptions);
  }

  var warnings = result.value.syncWarning ? [formatWarning(`sync: ${result.value.syncWarning}`)] : [];
  return appendWarnings(withScopeWarnings(result.value.message, scope, scopeOptions), warnings);
}
