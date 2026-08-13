import type { SessionIndex } from '../../domain/ports/SessionStore.js';
import type { Scope } from '../../domain/scope/Scope.js';
import type { IndexReconciliationService } from '../IndexReconciliationService.js';
import { resolveScopeFromHash } from './resolveScopeFromHash.js';

export class ResolveScopeFromHashUseCase {
  constructor(
    private readonly sessionIndex: SessionIndex,
    private readonly indexReconciliation: IndexReconciliationService,
  ) {}

  async execute(scopeHash: string): Promise<Scope | null> {
    await this.indexReconciliation.reconcileIfNeeded();
    return resolveScopeFromHash(this.sessionIndex, scopeHash);
  }
}
