import { describe, expect, it } from 'vitest';
import { projectHashFromPath } from '../../src/domain/scope/ProjectHash.js';
import {
  isUnscoped,
  projectScope,
  scopeFolderName,
  unscopedProjectScope,
} from '../../src/domain/scope/Scope.js';

describe('Scope', () => {
  it('builds a folder name combining slug and hash when a slug is known', () => {
    var hash = projectHashFromPath('/project/a');
    var scope = projectScope(hash, 'my-app');
    expect(scopeFolderName(scope)).toBe(`my-app-${hash}`);
  });

  it('falls back to the bare hash as folder name when no slug is known', () => {
    var hash = projectHashFromPath('/project/a');
    var scope = projectScope(hash);
    expect(scopeFolderName(scope)).toBe(hash);
  });

  it('produces a stable, well-known scope for sessions with no workspace open', () => {
    var scope = unscopedProjectScope();
    expect(isUnscoped(scope)).toBe(true);
    expect(scopeFolderName(scope)).toBe(`sem-projeto-${scope.hash}`);
  });

  it('does not flag a regular project scope as unscoped', () => {
    var scope = projectScope(projectHashFromPath('/project/a'), 'a');
    expect(isUnscoped(scope)).toBe(false);
  });
});
