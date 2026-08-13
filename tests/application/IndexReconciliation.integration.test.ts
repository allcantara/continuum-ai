import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createContainer } from '../../src/container.js';
import { projectScope, scopeFolderName } from '../../src/domain/scope/Scope.js';
import { projectHashFromPath } from '../../src/domain/scope/ProjectHash.js';

describe('Index reconciliation on boot', () => {
  it('rebuilds an empty sqlite index from session files already on disk', async () => {
    var home = await mkdtemp(join(tmpdir(), 'continuum-reconcile-'));
    var scope = projectScope(projectHashFromPath('/test/reconcile-project'), 'reconcile-project');
    var sessionsDir = join(home, 'projects', scopeFolderName(scope), 'sessions');
    await mkdir(sessionsDir, { recursive: true });
    await writeFile(join(sessionsDir, '2026-08-10-1430.md'), '# Saved offline\n\nContext from another machine.');

    var container = await createContainer(home);
    var listResult = await container.listSessions.execute({ scope });

    expect(listResult.ok).toBe(true);
    if (listResult.ok) {
      expect(listResult.value.sessions.length).toBe(1);
      expect(listResult.value.sessions[0]!.sessionId).toBe('2026-08-10-1430');
    }
  });

  it('rebuilds a stale index with phantom entries when list is called', async () => {
    var home = await mkdtemp(join(tmpdir(), 'continuum-reconcile-list-'));
    var scope = projectScope(projectHashFromPath('/test/reconcile-list'), 'reconcile-list');
    var sessionsDir = join(home, 'projects', scopeFolderName(scope), 'sessions');
    await mkdir(sessionsDir, { recursive: true });
    await writeFile(join(sessionsDir, '2026-08-10-1430.md'), 'Real session on disk\n\nBody.');
    await writeFile(join(sessionsDir, '2026-08-10-1500.md'), 'Second real session\n\nBody.');

    var container = await createContainer(home);
    await container.sessionIndex.upsert(
      {
        id: '2026-08-10-9999',
        scopeHash: scope.hash,
        scopeSlug: scope.slug,
        scopeType: scope.type,
        summary: 'Phantom session',
        createdAt: new Date('2026-08-10T09:59:00.000Z'),
        status: 'active',
      },
      'Phantom content',
    );

    var listResult = await container.listSessions.execute({ scope });

    expect(listResult.ok).toBe(true);
    if (listResult.ok) {
      expect(listResult.value.sessions.map((entry) => entry.sessionId).sort()).toEqual([
        '2026-08-10-1430',
        '2026-08-10-1500',
      ]);
    }
  });
});
