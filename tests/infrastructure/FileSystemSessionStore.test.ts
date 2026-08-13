import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createContainer, type Container } from '../../src/container.js';
import { isUnscoped, projectScope, scopeFolderName, unscopedProjectScope } from '../../src/domain/scope/Scope.js';
import { projectHashFromPath } from '../../src/domain/scope/ProjectHash.js';
import { createSession } from '../../src/domain/session/Session.js';
import { sessionContentFrom } from '../../src/domain/session/SessionContent.js';
import { sessionIdFrom } from '../../src/domain/session/SessionId.js';
import { sessionSummaryFrom } from '../../src/domain/session/SessionSummary.js';
import { FileSystemSessionStore } from '../../src/infrastructure/persistence/filesystem/FileSystemSessionStore.js';

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

  it('finds the chronologically latest session by id, not by file mtime (e.g. after a git checkout, mtimes no longer reflect save order)', async () => {
    // The session with the *later* id is written to disk *first*, so its file mtime is the
    // *oldest* — a store that (incorrectly) sorted by mtime would return the other one.
    await container.sessionStore.save(
      createSession({
        id: sessionIdFrom('2026-01-01-1000'),
        scope,
        content: sessionContentFrom('Newest session by id, written to disk first.'),
        summary: sessionSummaryFrom('Newest by id'),
        createdAt: new Date('2026-01-01T10:00:00Z'),
      }),
    );
    await container.sessionStore.save(
      createSession({
        id: sessionIdFrom('2026-01-01-0900'),
        scope,
        content: sessionContentFrom('Older session by id, written to disk last.'),
        summary: sessionSummaryFrom('Older by id'),
        createdAt: new Date('2026-01-01T09:00:00Z'),
      }),
    );

    var latest = await container.sessionStore.findLatest(scope);
    expect(latest?.summary).toBe('Newest by id');
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

  it('names a fresh project folder using slug-hash when a slug is known', async () => {
    var slugScope = projectScope(projectHashFromPath('/test/slugged-project'), 'slugged-project');

    await container.saveSession.execute({ scope: slugScope, content: 'Session with a known slug.' });

    var sessionsDir = join(home, 'projects', scopeFolderName(slugScope), 'sessions');
    var files = await readdir(sessionsDir);
    expect(files.some((f) => f.endsWith('.md'))).toBe(true);
  });

  it('keeps writing into a pre-existing bare-hash folder instead of creating a duplicate slug-hash one', async () => {
    var slugScope = projectScope(projectHashFromPath('/test/legacy-project'), 'legacy-project');
    var legacyDir = join(home, 'projects', slugScope.hash);
    await mkdir(legacyDir, { recursive: true });

    await container.saveSession.execute({ scope: slugScope, content: 'Session for a pre-existing legacy folder.' });

    var legacySessions = await readdir(join(legacyDir, 'sessions'));
    expect(legacySessions.some((f) => f.endsWith('.md'))).toBe(true);

    var slugHashDirExists = await readdir(join(home, 'projects')).then(
      (entries) => entries.includes(scopeFolderName(slugScope)),
    );
    expect(slugHashDirExists).toBe(false);
  });

  it('records slug and source provenance in meta.md for a fresh project', async () => {
    var slugScope = projectScope(
      projectHashFromPath('/test/documented-project'),
      'documented-project',
      '/test/documented-project',
    );

    await container.saveSession.execute({ scope: slugScope, content: 'Session with provenance.' });

    var metaContent = await readFile(join(home, 'projects', scopeFolderName(slugScope), 'meta.md'), 'utf-8');
    expect(metaContent).toContain('Slug: documented-project');
    expect(metaContent).toContain('Source: /test/documented-project');
  });

  it('stashes and restores an entire project from trash', async () => {
    await container.saveSession.execute({ scope, content: 'First session.' });
    await container.saveSession.execute({ scope, content: 'Second session.' });

    var stashResult = await container.stash.execute({ scope, stashProject: true });
    expect(stashResult.ok).toBe(true);

    var loadAfterStash = await container.loadSession.execute({ scope });
    expect(loadAfterStash.ok).toBe(false);

    var restoreResult = await container.restore.execute({ scope, restoreProject: true });
    expect(restoreResult.ok).toBe(true);

    var loadAfterRestore = await container.loadSession.execute({ scope });
    expect(loadAfterRestore.ok).toBe(true);
  });

  it('preserves a custom summary through load and index reconciliation, not just the initial save', async () => {
    var saveResult = await container.saveSession.execute({
      scope,
      content: 'The first content line does not describe this session at all.',
      summary: 'Custom summary explicitly provided by the caller',
    });
    expect(saveResult.ok).toBe(true);

    var loadResult = await container.loadSession.execute({ scope });
    expect(loadResult.ok).toBe(true);
    if (loadResult.ok) {
      expect(loadResult.value.summary).toBe('Custom summary explicitly provided by the caller');
    }

    // Simulate the index being rebuilt from disk (boot reconciliation, post-sync-pull, etc.).
    await container.indexReconciliation.reconcileIfNeeded();
    await container.sessionIndex.rebuildFromSessions(await container.sessionStore.listAllSessions());

    var listResult = await container.listSessions.execute({ scope });
    expect(listResult.ok).toBe(true);
    if (listResult.ok) {
      expect(listResult.value.sessions[0]!.summary).toBe('Custom summary explicitly provided by the caller');
    }
  });

  it('excludes meta.md from countAllSessions so reconciliation does not trigger on every boot', async () => {
    await container.saveSession.execute({ scope, content: 'First session.' });
    await container.saveSession.execute({ scope, content: 'Second session.' });

    var count = await container.sessionStore.countAllSessions();
    expect(count).toBe(2);
  });

  it('keeps every session file when many saves race concurrently in the same scope and minute', async () => {
    // Concurrent MCP tool calls (or a CLI save racing an MCP save) can land in the same
    // scope within the same minute. Picking a free id and writing it must be atomic —
    // otherwise two saves can pick the same id and one silently overwrites the other's file.
    var results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        container.saveSession.execute({ scope, content: `Concurrent session ${i}.` }),
      ),
    );

    expect(results.every((r) => r.ok)).toBe(true);
    var ids = results.map((r) => (r.ok ? r.value.sessionId : ''));
    expect(new Set(ids).size).toBe(10);

    var listResult = await container.listSessions.execute({ scope });
    expect(listResult.ok).toBe(true);
    if (listResult.ok) {
      expect(listResult.value.sessions.length).toBe(10);
    }
  });

  it('saves, finds and re-derives the stable "sem-projeto" bucket from disk when rebuilding the index', async () => {
    var noScope = unscopedProjectScope();

    await container.saveSession.execute({ scope: noScope, content: 'Session saved without a workspace open.' });

    var allSessions = await container.sessionStore.listAllSessions();
    var unscopedSessions = allSessions.filter((s) => isUnscoped(s.scope));
    expect(unscopedSessions).toHaveLength(1);
    expect(unscopedSessions[0]!.scope.hash).toBe(noScope.hash);
  });

  it('updates a legacy meta.md that is missing slug and source', async () => {
    var slugScope = projectScope(
      projectHashFromPath('/test/legacy-meta-project'),
      'legacy-meta-project',
      'https://github.com/user/legacy-meta-project',
    );
    var legacyDir = join(home, 'projects', slugScope.hash);
    await mkdir(join(legacyDir, 'sessions'), { recursive: true });
    await writeFile(
      join(legacyDir, 'meta.md'),
      `# project\n\n- Hash: ${slugScope.hash}\n- Created: 2026-08-01\n`,
      'utf-8',
    );

    await container.saveSession.execute({ scope: slugScope, content: 'Backfill meta.' });

    var metaContent = await readFile(join(legacyDir, 'meta.md'), 'utf-8');
    expect(metaContent).toContain('Slug: legacy-meta-project');
    expect(metaContent).toContain('Source: https://github.com/user/legacy-meta-project');
    expect(metaContent).toContain('Created: 2026-08-01');
  });

  it('reuses a stored project by slug when looking up a path hint', async () => {
    var stored = projectScope(
      projectHashFromPath('/stored-as-remote'),
      'cpc-refinancing-app-bff',
      'https://gitlab.example/cpc-refinancing-app-bff',
    );
    await container.saveSession.execute({ scope: stored, content: 'Original remote-hash session.' });

    var store = new FileSystemSessionStore(home);
    var found = await store.findByPathHint(
      '/Users/dev/git/cpc-refinancing-app-bff',
      'cpc-refinancing-app-bff',
    );
    expect(found?.hash).toBe(stored.hash);
    expect(found?.fromRemote).toBe(true);
  });

  it('rebuilds session scopes from meta slug for a hash-only folder', async () => {
    var hash = projectHashFromPath('/test/hash-only-slug');
    var dir = join(home, 'projects', hash);
    await mkdir(join(dir, 'sessions'), { recursive: true });
    await writeFile(
      join(dir, 'meta.md'),
      `# project\n\n- Hash: ${hash}\n- Slug: cpc-refinancing-app-bff\n- Source: https://gitlab.example/cpc-refinancing-app-bff\n- Created: 2026-08-12\n`,
      'utf-8',
    );
    await writeFile(join(dir, 'sessions', '2026-08-12-1603.md'), '<!-- continuum:summary: Hello -->\nBody\n', 'utf-8');

    var all = await container.sessionStore.listAllSessions();
    expect(all[0]?.scope.slug).toBe('cpc-refinancing-app-bff');
  });
});
