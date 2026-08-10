import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { projectScope } from '../../src/domain/scope/Scope.js';
import { projectHashFromPath } from '../../src/domain/scope/ProjectHash.js';
import { FileSystemSessionStore } from '../../src/infrastructure/persistence/filesystem/FileSystemSessionStore.js';
import { PlainTextFallbackIndex } from '../../src/infrastructure/persistence/sqlite/PlainTextFallbackIndex.js';
import { createSession } from '../../src/domain/session/Session.js';
import { sessionContentFrom } from '../../src/domain/session/SessionContent.js';
import { sessionIdFrom } from '../../src/domain/session/SessionId.js';
import { sessionSummaryFrom } from '../../src/domain/session/SessionSummary.js';

describe('PlainTextFallbackIndex', () => {
  var index: PlainTextFallbackIndex;
  var scope = projectScope(projectHashFromPath('/test/fallback'));

  beforeEach(() => {
    index = new PlainTextFallbackIndex();
  });

  it('indexes and searches sessions', async () => {
    var session = createSession({
      id: sessionIdFrom('2026-08-10-1430'),
      scope,
      content: sessionContentFrom('Authentication module implementation.'),
      summary: sessionSummaryFrom('Auth module'),
      createdAt: new Date('2026-08-10T14:30:00Z'),
    });

    await index.upsert(
      {
        id: session.id,
        scopeHash: scope.hash,
        scopeType: 'project',
        summary: session.summary,
        createdAt: session.createdAt,
        status: 'active',
      },
      session.content,
    );

    var results = await index.search({ query: 'authentication', scopeHash: scope.hash });
    expect(results.length).toBe(1);
    expect(results[0]!.id).toBe('2026-08-10-1430');
  });

  it('filters by trash status', async () => {
    await index.upsert(
      {
        id: sessionIdFrom('2026-08-10-1430'),
        scopeHash: scope.hash,
        scopeType: 'project',
        summary: sessionSummaryFrom('Active session'),
        createdAt: new Date(),
        status: 'active',
      },
      sessionContentFrom('Active content'),
    );

    await index.upsert(
      {
        id: sessionIdFrom('2026-08-10-1500'),
        scopeHash: scope.hash,
        scopeType: 'project',
        summary: sessionSummaryFrom('Trashed session'),
        createdAt: new Date(),
        status: 'trashed',
      },
      sessionContentFrom('Trashed content'),
    );

    var active = await index.search({ status: 'active', scopeHash: scope.hash });
    var trashed = await index.search({ status: 'trashed', scopeHash: scope.hash });

    expect(active.length).toBe(1);
    expect(trashed.length).toBe(1);
  });
});

describe('DirectoryLock integration', () => {
  it('serializes concurrent writes', async () => {
    var home = await mkdtemp(join(tmpdir(), 'continuum-lock-'));
    var store = new FileSystemSessionStore(home);
    var scope = projectScope(projectHashFromPath('/test/concurrent'));

    var promises = Array.from({ length: 5 }, (_, i) =>
      store.save(
        createSession({
          id: sessionIdFrom(`2026-08-10-${String(1400 + i).padStart(4, '0')}`),
          scope,
          content: sessionContentFrom(`Concurrent write ${i}`),
          summary: sessionSummaryFrom(`Write ${i}`),
          createdAt: new Date(),
        }),
      ),
    );

    await Promise.all(promises);

    var sessions = await store.findRecent(scope, 10);
    expect(sessions.length).toBe(5);
  });
});
