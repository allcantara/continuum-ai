import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GitRemoteReader, parseOriginUrl } from '../../src/infrastructure/git/GitRemoteReader.js';
import { projectHashFromRemote, projectSlugFromRemote } from '../../src/domain/scope/ProjectHash.js';

describe('parseOriginUrl', () => {
  it('reads the origin url from a git config section', () => {
    var config = `[core]
	bare = false
[remote "origin"]
	url = git@github.com:user/repo.git
	fetch = +refs/heads/*:refs/remotes/origin/*
`;
    expect(parseOriginUrl(config)).toBe('git@github.com:user/repo.git');
  });

  it('returns null when origin is missing', () => {
    expect(parseOriginUrl('[core]\n\tbare = false\n')).toBeNull();
  });
});

describe('GitRemoteReader', () => {
  var tempDir = '';

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'continuum-git-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('reads origin from .git/config when git is not a usable repository', async () => {
    var gitDir = join(tempDir, '.git');
    await mkdir(gitDir);
    await writeFile(
      join(gitDir, 'config'),
      `[remote "origin"]\n\turl = git@github.com:user/from-config.git\n`,
      'utf-8',
    );

    var reader = new GitRemoteReader();
    var identity = await reader.resolveProjectIdentity(tempDir);

    expect(identity.fromRemote).toBe(true);
    expect(identity.hash).toBe(projectHashFromRemote('git@github.com:user/from-config.git'));
    expect(identity.slug).toBe(projectSlugFromRemote('git@github.com:user/from-config.git'));
  });

  it('follows a gitdir pointer file to the real config', async () => {
    var realGitDir = join(tempDir, 'real-git');
    await mkdir(realGitDir);
    await writeFile(
      join(realGitDir, 'config'),
      `[remote "origin"]\n\turl = https://github.com/user/worktree-repo.git\n`,
      'utf-8',
    );
    await writeFile(join(tempDir, '.git'), `gitdir: ${realGitDir}\n`, 'utf-8');

    var reader = new GitRemoteReader();
    var identity = await reader.resolveProjectIdentity(tempDir);

    expect(identity.fromRemote).toBe(true);
    expect(identity.slug).toBe('worktree-repo');
  });

  it('falls back to the path hash when no git metadata exists', async () => {
    var reader = new GitRemoteReader();
    var identity = await reader.resolveProjectIdentity(tempDir);

    expect(identity.fromRemote).toBe(false);
    expect(identity.sourceHint).toBe(tempDir);
  });
});
