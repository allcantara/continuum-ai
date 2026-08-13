import type { ProjectMarker } from '../project/ProjectMarker.js';

export type ProjectMarkerStore = {
  findFromPath(absolutePath: string): Promise<ProjectMarker | null>;
  ensureFromPath(absolutePath: string): Promise<ProjectMarker>;
};
