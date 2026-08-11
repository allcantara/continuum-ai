import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SqliteSessionIndex } from '../../src/infrastructure/persistence/sqlite/SqliteSessionIndex.js';

var WORKER_SOURCE = join(process.cwd(), 'tests', 'fixtures', 'sqliteIndexWorker.ts');
var WORKER_COUNT = 15;
var bundledWorkerPath: string;

function runWorker(home: string, workerId: number): Promise<string> {
  return new Promise((resolve, reject) => {
    var child = spawn(process.execPath, [bundledWorkerPath, home, String(workerId)]);
    var output = '';
    child.stdout.on('data', (chunk) => (output += chunk.toString()));
    child.on('error', reject);
    child.on('close', () => resolve(output.trim()));
  });
}

describe('SqliteSessionIndex under real multi-process concurrency', () => {
  beforeAll(async () => {
    // Bundle to a plain .mjs once so every spawned process starts near-instantly (no
    // per-process TS transform): that keeps all workers' DB opens close enough in time to
    // actually reproduce the multi-process file-lock race this test guards against.
    var outDir = await mkdtemp(join(tmpdir(), 'continuum-sqlite-race-bundle-'));
    bundledWorkerPath = join(outDir, 'worker.mjs');
    await build({
      entryPoints: [WORKER_SOURCE],
      outfile: bundledWorkerPath,
      bundle: true,
      platform: 'node',
      format: 'esm',
      packages: 'external',
    });
  });

  afterAll(() => {
    bundledWorkerPath = '';
  });

  it(
    'persists every writer\'s row when many OS processes open the index at once',
    async () => {
      var home = await mkdtemp(join(tmpdir(), 'continuum-sqlite-race-'));

      var results = await Promise.all(
        Array.from({ length: WORKER_COUNT }, (_, i) => runWorker(home, i)),
      );

      var fallbacks = results.filter((r) => r.startsWith('fallback:'));
      var errors = results.filter((r) => r.startsWith('error:'));
      expect(fallbacks).toEqual([]);
      expect(errors).toEqual([]);

      var verifyIndex = new SqliteSessionIndex(home);
      await verifyIndex.initialize();
      expect(verifyIndex.isAvailable()).toBe(true);
      expect(await verifyIndex.count()).toBe(WORKER_COUNT);
    },
    20_000,
  );
});
