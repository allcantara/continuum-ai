import { projectHashFromPath } from '../domain/scope/ProjectHash.js';
import { projectScope, workspaceScope } from '../domain/scope/Scope.js';
import { workspaceHashFromProjectHashes } from '../domain/scope/WorkspaceHash.js';
import type { GitRemoteReader } from '../domain/ports/GitRemoteReader.js';
import type { Scope } from '../domain/scope/Scope.js';
import type { Result } from './Result.js';
import { err, ok } from './Result.js';

export type ScopeResolutionInput = {
  readonly roots: readonly string[];
};

export class ScopeResolutionService {
  constructor(private readonly gitRemoteReader: GitRemoteReader) {}

  async resolve(input: ScopeResolutionInput): Promise<Result<Scope>> {
    if (input.roots.length === 0) {
      return err('No project roots provided');
    }

    var projectHashes = await Promise.all(
      input.roots.map((root) => this.gitRemoteReader.resolveProjectHash(root)),
    );

    if (projectHashes.length === 1) {
      return ok(projectScope(projectHashes[0]!));
    }

    var workspaceHash = workspaceHashFromProjectHashes(projectHashes);
    return ok(workspaceScope(workspaceHash, projectHashes));
  }

  async resolveFromPath(absolutePath: string): Promise<Result<Scope>> {
    var hash = projectHashFromPath(absolutePath);
    return ok(projectScope(hash));
  }
}
