import { describe, expect, it } from 'vitest';
import {
  normalizeGitRemote,
  projectHashFromPath,
  projectHashFromRemote,
} from '../../src/domain/scope/ProjectHash.js';

describe('ProjectHash', () => {
  it('normalizes ssh and https remotes to the same hash', () => {
    var ssh = projectHashFromRemote('git@github.com:user/repo.git');
    var https = projectHashFromRemote('https://github.com/user/repo');
    expect(ssh).toBe(https);
  });

  it('normalizes ssh protocol urls', () => {
    var sshProtocol = projectHashFromRemote('ssh://git@github.com/user/repo.git');
    var https = projectHashFromRemote('https://github.com/user/repo');
    expect(sshProtocol).toBe(https);
  });

  it('produces stable hash from absolute path', () => {
    var hash1 = projectHashFromPath('/home/user/projects/my-app');
    var hash2 = projectHashFromPath('/home/user/projects/my-app');
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(16);
  });

  it('normalizes remote url for display', () => {
    expect(normalizeGitRemote('git@github.com:user/repo.git')).toBe('https://github.com/user/repo');
  });
});
