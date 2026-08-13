import type { Scope } from '../scope/Scope.js';

export type RegisteredScope = {
  readonly scopeId: string;
  readonly scopeHash: string;
  readonly scopeType: 'project' | 'workspace';
  readonly slug: string;
};

export type ScopeAliasKind = 'remote' | 'path' | 'git_root';

export type ScopeAlias = {
  readonly alias: string;
  readonly kind: ScopeAliasKind;
};

export type ScopeRegistry = {
  findByAliases(aliases: readonly ScopeAlias[]): Promise<RegisteredScope | null>;
  register(scope: Scope, aliases: readonly ScopeAlias[]): Promise<void>;
  countScopes(): Promise<number>;
  isAvailable(): boolean;
};
