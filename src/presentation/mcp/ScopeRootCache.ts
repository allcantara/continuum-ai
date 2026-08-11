export type ScopeRootResolution = {
  readonly roots?: string[];
  readonly fromProcessCache: boolean;
};

export class ScopeRootCache {
  private lastResolvedRoots: string[] | undefined;

  resolve(explicitRoots: string[] | undefined, clientRoots: string[] | undefined): ScopeRootResolution {
    if (explicitRoots && explicitRoots.length > 0) {
      this.lastResolvedRoots = explicitRoots;
      return { roots: explicitRoots, fromProcessCache: false };
    }

    if (clientRoots && clientRoots.length > 0) {
      this.lastResolvedRoots = clientRoots;
      return { roots: clientRoots, fromProcessCache: false };
    }

    if (this.lastResolvedRoots !== undefined) {
      return { roots: this.lastResolvedRoots, fromProcessCache: true };
    }

    return { fromProcessCache: false };
  }
}
