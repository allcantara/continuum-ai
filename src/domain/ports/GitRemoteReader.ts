import type { ProjectHash } from '../scope/ProjectHash.js';

export type GitRemoteReader = {
  readRemoteUrl(absolutePath: string): Promise<string | null>;
  resolveProjectHash(absolutePath: string): Promise<ProjectHash>;
};
