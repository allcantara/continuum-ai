import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createContainer, type Container } from '../../src/container.js';
import { projectScope } from '../../src/domain/scope/Scope.js';
import { projectHashFromPath } from '../../src/domain/scope/ProjectHash.js';
import { createSession } from '../../src/domain/session/Session.js';
import { sessionContentFrom } from '../../src/domain/session/SessionContent.js';
import { sessionIdFrom } from '../../src/domain/session/SessionId.js';
import { sessionSummaryFrom } from '../../src/domain/session/SessionSummary.js';
import { startUiServer, type StartedUiServer } from '../../src/presentation/ui/startUiServer.js';

describe('Continuum UI server', () => {
  var container: Container;
  var server: StartedUiServer;
  var scope = projectScope(projectHashFromPath('/test/ui-browse'), 'ui-browse');

  beforeEach(async () => {
    var home = await mkdtemp(join(tmpdir(), 'continuum-ui-'));
    container = await createContainer(home);
    await container.saveSession.execute({
      scope,
      content: 'Full snapshot for the UI browse test.',
      summary: 'UI browse summary',
    });
    server = await startUiServer(container, { port: 0 });
  });

  afterEach(async () => {
    if (server) {
      await server.close();
    }
  });

  it('lists projects, shows session markdown, and stashes to trash', async () => {
    var page = await fetch(server.url);
    expect(page.status).toBe(200);
    var html = await page.text();
    expect(html).toContain('Continuum');
    expect(html).toContain('cdn.jsdelivr.net/npm/bootstrap@5.3.8');

    var projects = await json(`${server.url}/api/projects`);
    expect(projects.projects).toEqual([
      expect.objectContaining({ slug: 'ui-browse', hash: scope.hash, sessionCount: 1 }),
    ]);

    var sessions = await json(`${server.url}/api/projects/${scope.hash}/sessions`);
    var sessionId = sessions.sessions[0].sessionId as string;

    var session = await json(`${server.url}/api/projects/${scope.hash}/sessions/${sessionId}`);
    expect(session.content).toContain('Full snapshot for the UI browse test.');
    expect(session.summary).toBe('UI browse summary');

    var stash = await fetch(`${server.url}/api/projects/${scope.hash}/sessions/${sessionId}/stash`, {
      method: 'POST',
    });
    expect(stash.status).toBe(200);

    var trash = await json(`${server.url}/api/trash`);
    expect(trash.items[0].sessionId).toBe(sessionId);

    var restore = await fetch(`${server.url}/api/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scopeHash: scope.hash, sessionId }),
    });
    expect(restore.status).toBe(200);

    var index = await json(`${server.url}/api/index`);
    expect(index.entries.some((entry: { id: string; status: string }) => entry.id === sessionId && entry.status === 'active')).toBe(
      true,
    );
  });

  it('stashes and restores an entire project', async () => {
    var stash = await fetch(`${server.url}/api/projects/${scope.hash}/stash`, { method: 'POST' });
    expect(stash.status).toBe(200);

    var restore = await fetch(`${server.url}/api/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scopeHash: scope.hash, project: true }),
    });
    expect(restore.status).toBe(200);

    var projects = await json(`${server.url}/api/projects`);
    expect(projects.projects.some((project) => project.hash === scope.hash)).toBe(true);
  });

  it('rejects a project hash that is not a safe identifier', async () => {
    var response = await fetch(`${server.url}/api/projects/unscoped..etc/sessions`);
    expect(response.status).toBe(400);
  });

  it('lists sessions for a project that exists on disk but not yet in the index', async () => {
    var orphan = projectScope(projectHashFromPath('/test/ui-orphan'), 'ui-orphan');
    await container.sessionStore.save(
      createSession({
        id: sessionIdFrom('2026-08-11-0900'),
        scope: orphan,
        content: sessionContentFrom('Saved without updating the index.'),
        summary: sessionSummaryFrom('Orphan session'),
        createdAt: new Date('2026-08-11T09:00:00Z'),
      }),
    );

    var sessions = await json(`${server.url}/api/projects/${orphan.hash}/sessions`);
    expect(sessions.sessions).toEqual([expect.objectContaining({ sessionId: '2026-08-11-0900' })]);
  });

  it('returns 404 when the session id is unknown', async () => {
    var response = await fetch(`${server.url}/api/projects/${scope.hash}/sessions/2026-01-01-0000`);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Session not found: 2026-01-01-0000' });
  });
});

async function json(url: string): Promise<{
  projects: Array<{ slug: string; hash: string; sessionCount: number }>;
  sessions: Array<{ sessionId: string }>;
  content: string;
  summary: string;
  items: Array<{ sessionId: string }>;
  entries: Array<{ id: string; status: string }>;
}> {
  var response = await fetch(url);
  expect(response.ok).toBe(true);
  return response.json();
}
