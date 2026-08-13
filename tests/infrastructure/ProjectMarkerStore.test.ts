import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PROJECT_MARKER_FILENAME } from '../../src/domain/project/ProjectMarker.js';
import { FileSystemProjectMarkerStore } from '../../src/infrastructure/project/FileSystemProjectMarkerStore.js';

describe('FileSystemProjectMarkerStore', () => {
  var tempDir = '';

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'continuum-marker-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('creates a marker with uuid and folder name on first ensure', async () => {
    var projectDir = join(tempDir, 'my-service');
    await mkdir(projectDir);
    var store = new FileSystemProjectMarkerStore();

    var created = await store.ensureFromPath(projectDir);
    var again = await store.ensureFromPath(projectDir);

    expect(created.folderName).toBe('my-service');
    expect(created.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(again.id).toBe(created.id);
  });

  it('creates the marker file in a folder that is not a git repository', async () => {
    var projectDir = join(tempDir, 'random-notes');
    await mkdir(projectDir);
    var store = new FileSystemProjectMarkerStore();

    var created = await store.ensureFromPath(projectDir);
    var found = await store.findFromPath(projectDir);
    var raw = await readFile(join(projectDir, PROJECT_MARKER_FILENAME), 'utf-8');

    expect(found?.id).toBe(created.id);
    expect(raw).toContain(created.id);
    await expect(readFile(join(projectDir, '.git', 'info', 'exclude'), 'utf-8')).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('places the marker at the git root when saving from a subdirectory', async () => {
    var repo = join(tempDir, 'repo');
    var nested = join(repo, 'packages', 'api');
    await mkdir(join(repo, '.git', 'info'), { recursive: true });
    await mkdir(nested, { recursive: true });
    var store = new FileSystemProjectMarkerStore();

    var created = await store.ensureFromPath(nested);

    expect(created.folderName).toBe('repo');
    var raw = await readFile(join(repo, PROJECT_MARKER_FILENAME), 'utf-8');
    expect(raw).toContain(created.id);
    await expect(readFile(join(nested, PROJECT_MARKER_FILENAME), 'utf-8')).rejects.toMatchObject({
      code: 'ENOENT',
    });
    var exclude = await readFile(join(repo, '.git', 'info', 'exclude'), 'utf-8');
    expect(exclude).toContain(PROJECT_MARKER_FILENAME);
  });

  it('finds the marker from a subdirectory of a git repo', async () => {
    var repo = join(tempDir, 'repo');
    var nested = join(repo, 'packages', 'api');
    await mkdir(join(repo, '.git'), { recursive: true });
    await mkdir(nested, { recursive: true });
    var store = new FileSystemProjectMarkerStore();

    var created = await store.ensureFromPath(repo);
    var found = await store.findFromPath(nested);

    expect(found?.id).toBe(created.id);
    expect(found?.folderName).toBe('repo');
  });

  it('does not leak a sibling folder without its own marker', async () => {
    var repoA = join(tempDir, 'repo-a');
    var repoB = join(tempDir, 'repo-b');
    await mkdir(join(repoA, '.git'), { recursive: true });
    await mkdir(join(repoB, '.git'), { recursive: true });
    var store = new FileSystemProjectMarkerStore();

    var markerA = await store.ensureFromPath(repoA);
    var foundB = await store.findFromPath(repoB);

    expect(foundB).toBeNull();
    var markerB = await store.ensureFromPath(repoB);
    expect(markerB.id).not.toBe(markerA.id);
  });

  it('adds the marker filename to .git/info/exclude', async () => {
    var repo = join(tempDir, 'repo');
    await mkdir(join(repo, '.git', 'info'), { recursive: true });
    var store = new FileSystemProjectMarkerStore();

    await store.ensureFromPath(repo);

    var exclude = await readFile(join(repo, '.git', 'info', 'exclude'), 'utf-8');
    expect(exclude).toContain(PROJECT_MARKER_FILENAME);
    var raw = await readFile(join(repo, PROJECT_MARKER_FILENAME), 'utf-8');
    expect(raw).toContain('"id"');
  });

  it('does not duplicate the exclude entry on a second save', async () => {
    var repo = join(tempDir, 'repo');
    await mkdir(join(repo, '.git', 'info'), { recursive: true });
    await writeFile(join(repo, '.git', 'info', 'exclude'), `.continuum.local.json\n`, 'utf-8');
    var store = new FileSystemProjectMarkerStore();

    await store.ensureFromPath(repo);
    await store.ensureFromPath(repo);

    var exclude = await readFile(join(repo, '.git', 'info', 'exclude'), 'utf-8');
    expect(exclude.match(/\.continuum\.local\.json/g)?.length).toBe(1);
  });
});
