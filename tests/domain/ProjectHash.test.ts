import { describe, expect, it } from 'vitest';
import {
  normalizeGitRemote,
  projectHashFromPath,
  projectHashFromRemote,
  projectSlugFromPath,
  projectSlugFromRemote,
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

  it('derives a readable slug from the repository name in a remote url', () => {
    expect(projectSlugFromRemote('git@github.com:allcantara/continuum-ai.git')).toBe('continuum-ai');
  });

  it('sanitizes characters that are unsafe for a folder name in the remote-based slug', () => {
    expect(projectSlugFromRemote('git@github.com:user/My_Weird.Repo!.git')).toBe('my-weird-repo');
  });

  it('derives a readable slug from the last path segment for path-based projects', () => {
    expect(projectSlugFromPath('/Users/dev/projects/My App')).toBe('my-app');
  });
});
