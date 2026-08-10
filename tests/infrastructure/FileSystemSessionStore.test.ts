import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createContainer, type Container } from '../../src/container.js';
import { projectScope } from '../../src/domain/scope/Scope.js';
import { projectHashFromPath } from '../../src/domain/scope/ProjectHash.js';
import { sessionIdFrom } from '../../src/domain/session/SessionId.js';

describe('FileSystemSessionStore integration', () => {
  var home: string;
  var container: Container;
  var scope = projectScope(projectHashFromPath('/test/integration-project'));

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'continuum-test-'));
    container = await createContainer(home);
  });

  afterEach(async () => {
    // cleanup handled by OS temp dir
  });

  it('saves and loads a session', async () => {
    var saveResult = await container.saveSession.execute({
      scope,
      content: '# Auth Flow\n\nImplemented JWT validation.',
      summary: 'JWT validation done',
    });

    expect(saveResult.ok).toBe(true);

    var loadResult = await container.loadSession.execute({ scope });
    expect(loadResult.ok).toBe(true);
    if (loadResult.ok) {
      expect(loadResult.value.content).toContain('JWT validation');
    }
  });

  it('creates session markdown file on disk', async () => {
    await container.saveSession.execute({
      scope,
      content: 'Test content for file check.',
    });

    var sessionsDir = join(home, 'projects', scope.hash, 'sessions');
    var files = await readdir(sessionsDir);
    expect(files.some((f) => f.endsWith('.md'))).toBe(true);

    var content = await readFile(join(sessionsDir, files[0]!), 'utf-8');
    expect(content).toContain('Test content');
  });

  it('lists sessions via index', async () => {
    await container.saveSession.execute({ scope, content: 'First session about auth.' });
    await container.saveSession.execute({ scope, content: 'Second session about payments.' });

    var listResult = await container.listSessions.execute({ scope });
    expect(listResult.ok).toBe(true);
    if (listResult.ok) {
      expect(listResult.value.sessions.length).toBe(2);
    }
  });

  it('searches sessions by query', async () => {
    await container.saveSession.execute({ scope, content: 'Working on authentication module.' });
    await container.saveSession.execute({ scope, content: 'Working on payment gateway.' });

    var listResult = await container.listSessions.execute({ scope, query: 'authentication' });
    expect(listResult.ok).toBe(true);
    if (listResult.ok) {
      expect(listResult.value.sessions.length).toBeGreaterThanOrEqual(1);
      expect(listResult.value.sessions[0]!.summary.toLowerCase()).toContain('authentication');
    }
  });

  it('recaps last N sessions', async () => {
    await container.saveSession.execute({ scope, content: 'Session one.' });
    await container.saveSession.execute({ scope, content: 'Session two.' });
    await container.saveSession.execute({ scope, content: 'Session three.' });

    var recapResult = await container.recap.execute({ scope, last: 2 });
    expect(recapResult.ok).toBe(true);
    if (recapResult.ok) {
      expect(recapResult.value.sessions.length).toBe(2);
    }
  });

  it('stashes and restores a session', async () => {
    var saveResult = await container.saveSession.execute({
      scope,
      content: 'Session to stash.',
    });
    expect(saveResult.ok).toBe(true);

    var sessionId = saveResult.ok ? sessionIdFrom(saveResult.value.sessionId) : sessionIdFrom('2026-01-01-0000');

    var stashResult = await container.stash.execute({ scope, sessionId });
    expect(stashResult.ok).toBe(true);

    var trashResult = await container.listTrash.execute();
    expect(trashResult.ok).toBe(true);
    if (trashResult.ok && saveResult.ok) {
      expect(trashResult.value.items.some((i) => i.sessionId === saveResult.value.sessionId)).toBe(true);
    }

    var restoreResult = await container.restore.execute({ scope, sessionId });
    expect(restoreResult.ok).toBe(true);

    var loadResult = await container.loadSession.execute({ scope });
    expect(loadResult.ok).toBe(true);
  });
});
