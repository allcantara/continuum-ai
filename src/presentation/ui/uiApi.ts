import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Container } from '../../container.js';
import type { FailureCode } from '../../application/Result.js';
import { sessionIdFrom } from '../../domain/session/SessionId.js';
import { readJsonBody, sendJson } from './httpJson.js';

const SCOPE_HASH_PATTERN = /^[A-Za-z0-9._-]+$/;

export async function handleUiApi(
  container: Container,
  method: string,
  pathname: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (method === 'GET' && pathname === '/api/projects') {
    replyResult(res, await container.listScopes.execute());
    return;
  }

  var projectSessions = /^\/api\/projects\/([^/]+)\/sessions$/.exec(pathname);
  if (method === 'GET' && projectSessions) {
    await listProjectSessions(container, decodeParam(projectSessions[1]!), res);
    return;
  }

  var oneSession = /^\/api\/projects\/([^/]+)\/sessions\/([^/]+)$/.exec(pathname);
  if (method === 'GET' && oneSession) {
    var sessionHash = decodeParam(oneSession[1]!);
    if (!isValidScopeHash(sessionHash, res)) {
      return;
    }
    await getSession(container, sessionHash, decodeParam(oneSession[2]!), res);
    return;
  }

  var stashSession = /^\/api\/projects\/([^/]+)\/sessions\/([^/]+)\/stash$/.exec(pathname);
  if (method === 'POST' && stashSession) {
    await stash(container, decodeParam(stashSession[1]!), decodeParam(stashSession[2]!), false, res);
    return;
  }

  var stashProject = /^\/api\/projects\/([^/]+)\/stash$/.exec(pathname);
  if (method === 'POST' && stashProject) {
    await stash(container, decodeParam(stashProject[1]!), undefined, true, res);
    return;
  }

  if (method === 'GET' && pathname === '/api/trash') {
    replyResult(res, await container.listTrash.execute());
    return;
  }

  if (method === 'POST' && pathname === '/api/restore') {
    await restore(container, req, res);
    return;
  }

  if (method === 'GET' && pathname === '/api/index') {
    replyResult(res, await container.listIndex.execute());
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
}

async function listProjectSessions(container: Container, scopeHash: string, res: ServerResponse): Promise<void> {
  var scope = await requireScope(container, scopeHash, res);
  if (!scope) {
    return;
  }
  replyResult(res, await container.listSessions.execute({ scope }));
}

async function getSession(
  container: Container,
  scopeHash: string,
  sessionId: string,
  res: ServerResponse,
): Promise<void> {
  var parsedId = parseSessionId(sessionId, res);
  if (!parsedId) {
    return;
  }
  replyResult(res, await container.getSession.execute({ scopeHash, sessionId: parsedId }));
}

async function stash(
  container: Container,
  scopeHash: string,
  sessionId: string | undefined,
  stashProject: boolean,
  res: ServerResponse,
): Promise<void> {
  var scope = await requireScope(container, scopeHash, res);
  if (!scope) {
    return;
  }
  if (stashProject) {
    replyResult(res, await container.stash.execute({ scope, stashProject: true }));
    return;
  }
  var parsedId = parseSessionId(sessionId ?? '', res);
  if (!parsedId) {
    return;
  }
  replyResult(res, await container.stash.execute({ scope, sessionId: parsedId }));
}

async function restore(container: Container, req: IncomingMessage, res: ServerResponse): Promise<void> {
  var body = await readJsonBody(req);
  if (typeof body !== 'object' || body === null) {
    sendJson(res, 400, { error: 'Invalid JSON body' });
    return;
  }
  var payload = body as { scopeHash?: unknown; sessionId?: unknown; project?: unknown };
  if (typeof payload.scopeHash !== 'string') {
    sendJson(res, 400, { error: 'scopeHash is required' });
    return;
  }
  var scope = await requireScope(container, payload.scopeHash, res);
  if (!scope) {
    return;
  }
  if (payload.project === true) {
    replyResult(res, await container.restore.execute({ scope, restoreProject: true }));
    return;
  }
  if (typeof payload.sessionId !== 'string') {
    sendJson(res, 400, { error: 'sessionId is required' });
    return;
  }
  var parsedId = parseSessionId(payload.sessionId, res);
  if (!parsedId) {
    return;
  }
  replyResult(res, await container.restore.execute({ scope, sessionId: parsedId }));
}

function isValidScopeHash(scopeHash: string, res: ServerResponse): boolean {
  if (!SCOPE_HASH_PATTERN.test(scopeHash) || scopeHash.includes('..')) {
    sendJson(res, 400, { error: 'Invalid project hash' });
    return false;
  }
  return true;
}

async function requireScope(container: Container, scopeHash: string, res: ServerResponse) {
  if (!isValidScopeHash(scopeHash, res)) {
    return null;
  }
  var scope = await container.resolveScopeFromHash.execute(scopeHash);
  if (!scope) {
    sendJson(res, 404, { error: `Project not found: ${scopeHash}` });
    return null;
  }
  return scope;
}

function parseSessionId(value: string, res: ServerResponse) {
  try {
    return sessionIdFrom(value);
  } catch (error) {
    sendJson(res, 400, { error: (error as Error).message });
    return null;
  }
}

function decodeParam(value: string): string {
  return decodeURIComponent(value);
}

function replyResult<T>(
  res: ServerResponse,
  result: { ok: true; value: T } | { ok: false; reason: string; code?: FailureCode },
): void {
  if (!result.ok) {
    var status = result.code === 'not_found' ? 404 : 400;
    sendJson(res, status, { error: result.reason });
    return;
  }
  sendJson(res, 200, result.value);
}
