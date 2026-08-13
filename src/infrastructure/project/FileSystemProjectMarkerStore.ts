import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import type { ProjectMarkerStore } from '../../domain/ports/ProjectMarkerStore.js';
import {
  parseProjectMarker,
  PROJECT_MARKER_FILENAME,
  serializeProjectMarker,
  type ProjectMarker,
} from '../../domain/project/ProjectMarker.js';
import { excludeFromLocalGit } from '../git/GitExclude.js';
import { findGitRoot } from '../git/GitRootResolver.js';

export class FileSystemProjectMarkerStore implements ProjectMarkerStore {
  async findFromPath(absolutePath: string): Promise<ProjectMarker | null> {
    var markerPath = await this.findMarkerPath(absolutePath);
    if (!markerPath) {
      return null;
    }
    return this.readMarker(markerPath);
  }

  async ensureFromPath(absolutePath: string): Promise<ProjectMarker> {
    var existing = await this.findFromPath(absolutePath);
    if (existing) {
      return existing;
    }

    var start = resolve(absolutePath);
    var gitRoot = await findGitRoot(start);
    var markerDir = gitRoot ?? start;
    var marker: ProjectMarker = {
      id: randomUUID().toLowerCase(),
      folderName: basename(markerDir) || 'project',
    };

    await writeFile(join(markerDir, PROJECT_MARKER_FILENAME), serializeProjectMarker(marker), 'utf-8');

    if (gitRoot) {
      await excludeFromLocalGit(gitRoot);
    }

    return marker;
  }

  private async findMarkerPath(absolutePath: string): Promise<string | null> {
    var current = resolve(absolutePath);
    var gitRoot = await findGitRoot(current);

    while (true) {
      var candidate = join(current, PROJECT_MARKER_FILENAME);
      if (await this.readMarker(candidate)) {
        return candidate;
      }
      if (!gitRoot || current === gitRoot) {
        return null;
      }
      var parent = dirname(current);
      if (parent === current) {
        return null;
      }
      current = parent;
    }
  }

  private async readMarker(markerPath: string): Promise<ProjectMarker | null> {
    try {
      var raw = await readFile(markerPath, 'utf-8');
      return parseProjectMarker(raw);
    } catch {
      return null;
    }
  }
}
