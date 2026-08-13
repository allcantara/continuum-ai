import { projectScope, unscopedProjectScope, workspaceScope } from '../domain/scope/Scope.js';
import { workspaceHashFromProjectHashes, workspaceSlugFromProjectSlugs } from '../domain/scope/WorkspaceHash.js';
import type { GitRemoteReader, ProjectIdentity } from '../domain/ports/GitRemoteReader.js';
import type { ScopeRegistry } from '../domain/ports/ScopeRegistry.js';
import type { Scope } from '../domain/scope/Scope.js';
import type { Result } from './Result.js';
import { err, ok } from './Result.js';
import { buildScopeAliases } from './scope/ScopeAliasBuilder.js';

export type ScopeResolutionInput = {
  readonly roots: readonly string[];
};

export type ProjectIdentityLookup = {
  findByPathHint(absolutePath: string, slug: string): Promise<ProjectIdentity | null>;
};

const NOOP_IDENTITY_LOOKUP: ProjectIdentityLookup = {
  findByPathHint: async () => null,
};

const NOOP_SCOPE_REGISTRY: ScopeRegistry = {
  findByAliases: async () => null,
  register: async () => {},
  countScopes: async () => 0,
  isAvailable: () => false,
};

export class ScopeResolutionService {
  constructor(
    private readonly gitRemoteReader: GitRemoteReader,
    private readonly identityLookup: ProjectIdentityLookup = NOOP_IDENTITY_LOOKUP,
    private readonly scopeRegistry: ScopeRegistry = NOOP_SCOPE_REGISTRY,
  ) {}

  async resolve(input: ScopeResolutionInput): Promise<Result<Scope>> {
    if (input.roots.length === 0) {
      return err('No project roots provided');
    }

    var identities = await Promise.all(input.roots.map((root) => this.resolveIdentity(root)));

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
    var identity = await this.resolveIdentity(absolutePath);
    return ok(projectScope(identity.hash, identity.slug, identity.sourceHint));
  }

  /** Stable "no project open" bucket — used only for MCP calls with no resolvable path. */
  resolveUnscoped(): Scope {
    return unscopedProjectScope();
  }

  private async resolveIdentity(absolutePath: string): Promise<ProjectIdentity> {
    var gitRoot = await this.gitRemoteReader.findRepositoryRoot(absolutePath);
    var identity = await this.gitRemoteReader.resolveProjectIdentity(absolutePath);
    var aliases = buildScopeAliases(absolutePath, gitRoot, identity);

    var registered = await this.scopeRegistry.findByAliases(aliases);
    if (registered) {
      var fromRegistry: ProjectIdentity = {
        hash: registered.scopeHash as ProjectIdentity['hash'],
        slug: registered.slug || identity.slug,
        sourceHint: identity.sourceHint,
        fromRemote: identity.fromRemote,
      };
      await this.persistAliases(absolutePath, gitRoot, fromRegistry);
      return fromRegistry;
    }

    if (!identity.fromRemote) {
      var existing = await this.identityLookup.findByPathHint(absolutePath, identity.slug);
      if (existing) {
        await this.persistAliases(absolutePath, gitRoot, existing);
        return existing;
      }
    }

    await this.persistAliases(absolutePath, gitRoot, identity);
    return identity;
  }

  private async persistAliases(
    absolutePath: string,
    gitRoot: string | null,
    identity: ProjectIdentity,
  ): Promise<void> {
    if (!this.scopeRegistry.isAvailable()) {
      return;
    }

    var scope = projectScope(identity.hash, identity.slug, identity.sourceHint);
    var aliases = buildScopeAliases(absolutePath, gitRoot, identity);
    await this.scopeRegistry.register(scope, aliases);
  }
}
