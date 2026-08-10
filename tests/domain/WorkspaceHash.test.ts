import { describe, expect, it } from 'vitest';
import { projectHashFromPath } from '../../src/domain/scope/ProjectHash.js';
import { workspaceHashFromProjectHashes } from '../../src/domain/scope/WorkspaceHash.js';

describe('WorkspaceHash', () => {
  it('produces stable hash regardless of project order', () => {
    var hashA = projectHashFromPath('/project/a');
    var hashB = projectHashFromPath('/project/b');

    var ws1 = workspaceHashFromProjectHashes([hashA, hashB]);
    var ws2 = workspaceHashFromProjectHashes([hashB, hashA]);
    expect(ws1).toBe(ws2);
    expect(ws1).toHaveLength(16);
  });

  it('throws when no project hashes provided', () => {
    expect(() => workspaceHashFromProjectHashes([])).toThrow('at least one project hash');
  });
});
