import type { ProjectMarkerStore } from '../domain/ports/ProjectMarkerStore.js';
import type { ProjectHash } from '../domain/scope/ProjectHash.js';
import { projectScope, unscopedProjectScope, workspaceScope } from '../domain/scope/Scope.js';
import type { Scope } from '../domain/scope/Scope.js';
import { workspaceHashFromProjectHashes, workspaceSlugFromProjectSlugs } from '../domain/scope/WorkspaceHash.js';
import type { Result } from './Result.js';
import { err, ok } from './Result.js';

export const NO_PROJECT_MARKER_REASON = 'NO_PROJECT_MARKER';

export type ScopeResolutionInput = {
  readonly roots: readonly string[];
  readonly createIfMissing?: boolean;
};

export class ScopeResolutionService {
  constructor(private readonly markerStore: ProjectMarkerStore) {}

  async resolve(input: ScopeResolutionInput): Promise<Result<Scope>> {
    if (input.roots.length === 0) {
      return err('No project roots provided');
    }

    var identities: { hash: ProjectHash; slug: string; sourceHint: string }[] = [];
    for (var root of input.roots) {
      var identity = await this.resolveIdentity(root, input.createIfMissing === true);
      if (!identity) {
        return err(NO_PROJECT_MARKER_REASON);
      }
      identities.push(identity);
    }

    if (identities.length === 1) {
      var only = identities[0]!;
      return ok(projectScope(only.hash, only.slug, only.sourceHint));
    }

    var hashes = identities.map((identity) => identity.hash);
    var slug = workspaceSlugFromProjectSlugs(identities.map((identity) => identity.slug));
    var workspaceHash = workspaceHashFromProjectHashes(hashes);
    return ok(workspaceScope(workspaceHash, hashes, slug));
  }

  async resolveFromPath(absolutePath: string, createIfMissing: boolean = false): Promise<Result<Scope>> {
    return this.resolve({ roots: [absolutePath], createIfMissing });
  }

  resolveUnscoped(): Scope {
    return unscopedProjectScope();
  }

  private async resolveIdentity(
    absolutePath: string,
    createIfMissing: boolean,
  ): Promise<{ hash: ProjectHash; slug: string; sourceHint: string } | null> {
    var marker = createIfMissing
      ? await this.markerStore.ensureFromPath(absolutePath)
      : await this.markerStore.findFromPath(absolutePath);

    if (!marker) {
      return null;
    }

    return {
      hash: marker.id as ProjectHash,
      slug: marker.folderName,
      sourceHint: absolutePath,
    };
  }
}
