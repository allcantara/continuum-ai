import type { GitRemoteReader } from '../../domain/ports/GitRemoteReader.js';
import type { ScopeRegistry } from '../../domain/ports/ScopeRegistry.js';
import type { SessionStore } from '../../domain/ports/SessionStore.js';
import { isPlausibleGitRemote } from '../../domain/scope/ProjectHash.js';
import { buildScopeAliases } from '../scope/ScopeAliasBuilder.js';

export class ScopeRegistryBootstrap {
  constructor(
    private readonly scopeRegistry: ScopeRegistry,
    private readonly sessionStore: SessionStore,
    private readonly gitRemoteReader: GitRemoteReader,
  ) {}

  async bootstrapIfEmpty(): Promise<void> {
    if (!this.scopeRegistry.isAvailable()) {
      return;
    }

    if ((await this.scopeRegistry.countScopes()) > 0) {
      return;
    }

    var sessions = await this.sessionStore.listAllSessions();
    var seen = new Set<string>();

    for (var session of sessions) {
      var hash = session.scope.hash;
      if (seen.has(hash)) {
        continue;
      }
      seen.add(hash);

      if (session.scope.type !== 'project') {
        await this.scopeRegistry.register(session.scope, []);
        continue;
      }

      var sourceHint = session.scope.sourceHint;
      if (!sourceHint) {
        await this.scopeRegistry.register(session.scope, []);
        continue;
      }

      var gitRoot = await this.gitRemoteReader.findRepositoryRoot(sourceHint);
      var aliases = buildScopeAliases(sourceHint, gitRoot, {
        hash: session.scope.hash,
        slug: session.scope.slug,
        sourceHint,
        fromRemote: isPlausibleGitRemote(sourceHint),
      });

      await this.scopeRegistry.register(session.scope, aliases);
    }
  }
}
