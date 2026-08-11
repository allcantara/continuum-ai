import type { ProjectHash } from '../scope/ProjectHash.js';

export type ProjectIdentity = {
  readonly hash: ProjectHash;
  readonly slug: string;
  readonly sourceHint: string;
};

export type GitRemoteReader = {
  readRemoteUrl(absolutePath: string): Promise<string | null>;
  resolveProjectIdentity(absolutePath: string): Promise<ProjectIdentity>;
};
