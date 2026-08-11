import { projectScope, unscopedProjectScope, workspaceScope } from '../domain/scope/Scope.js';
import { workspaceHashFromProjectHashes, workspaceSlugFromProjectSlugs } from '../domain/scope/WorkspaceHash.js';
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

    var identities = await Promise.all(
      input.roots.map((root) => this.gitRemoteReader.resolveProjectIdentity(root)),
    );

    if (identities.length === 1) {
      var only = identities[0]!;
      return ok(projectScope(only.hash, only.slug, only.sourceHint));
    }

    var hashes = identities.map((identity) => identity.hash);
    var slug = workspaceSlugFromProjectSlugs(identities.map((identity) => identity.slug));
    var workspaceHash = workspaceHashFromProjectHashes(hashes);
    return ok(workspaceScope(workspaceHash, hashes, slug));
  }

  async resolveFromPath(absolutePath: string): Promise<Result<Scope>> {
    var identity = await this.gitRemoteReader.resolveProjectIdentity(absolutePath);
    return ok(projectScope(identity.hash, identity.slug, identity.sourceHint));
  }

  /** Stable "no project open" bucket — used only for MCP calls with no resolvable path. */
  resolveUnscoped(): Scope {
    return unscopedProjectScope();
  }
}
