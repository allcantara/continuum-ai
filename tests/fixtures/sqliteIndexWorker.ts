/**
 * Standalone worker spawned as a real OS process by
 * `SqliteSessionIndexConcurrency.integration.test.ts`. Runs outside vitest's single-threaded
 * runner so it can reproduce genuine multi-process file-lock contention on the shared
 * SQLite index file (unlike `Promise.all` in one process, where synchronous `node:sqlite`
 * calls never actually overlap).
 */
import { SqliteSessionIndex } from '../../src/infrastructure/persistence/sqlite/SqliteSessionIndex.js';

var [home, workerId] = process.argv.slice(2);

async function main(): Promise<void> {
  var index = new SqliteSessionIndex(home);
  await index.initialize();

  if (!index.isAvailable()) {
    console.log(`fallback:${workerId}`);
    return;
  }

  await index.upsert(
    {
      id: `sess-${workerId}` as never,
      scopeHash: `hash-${workerId}`,
      scopeSlug: `slug-${workerId}`,
      scopeType: 'project',
      summary: `summary-${workerId}` as never,
      createdAt: new Date(),
      status: 'active',
    },
    `content-${workerId}` as never,
  );
  console.log(`ok:${workerId}`);
}

main().catch((error) => {
  console.log(`error:${workerId}:${(error as Error).message}`);
  process.exitCode = 1;
});
