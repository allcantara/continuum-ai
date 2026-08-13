import { execFile } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { GitRemoteReader as GitRemoteReaderPort, ProjectIdentity } from '../../domain/ports/GitRemoteReader.js';
import {
  normalizeGitRemote,
  projectHashFromPath,
  projectHashFromRemote,
  projectSlugFromPath,
  projectSlugFromRemote,
} from '../../domain/scope/ProjectHash.js';

const execFileAsync = promisify(execFile);

export class GitRemoteReader implements GitRemoteReaderPort {
  async readRemoteUrl(absolutePath: string): Promise<string | null> {
    var fromGit = await this.readRemoteFromGitCommand(absolutePath);
    if (fromGit) {
      return fromGit;
    }
    return this.readOriginUrlFromGitConfig(absolutePath);
  }

  async resolveProjectIdentity(absolutePath: string): Promise<ProjectIdentity> {
    var remote = await this.readRemoteUrl(absolutePath);
    if (remote) {
      return {
        hash: projectHashFromRemote(remote),
        slug: projectSlugFromRemote(remote),
        sourceHint: normalizeGitRemote(remote),
        fromRemote: true,
      };
    }
    return {
      hash: projectHashFromPath(absolutePath),
      slug: projectSlugFromPath(absolutePath),
      sourceHint: absolutePath,
      fromRemote: false,
    };
  }

  private async readRemoteFromGitCommand(absolutePath: string): Promise<string | null> {
    try {
      var { stdout } = await execFileAsync('git', ['-C', absolutePath, 'remote', 'get-url', 'origin'], {
        timeout: 5000,
      });
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }

  private async readOriginUrlFromGitConfig(absolutePath: string): Promise<string | null> {
    var gitDir = await resolveGitDir(absolutePath);
    if (!gitDir) {
      return null;
    }

    try {
      var config = await readFile(join(gitDir, 'config'), 'utf-8');
      return parseOriginUrl(config);
    } catch {
      return null;
    }
  }
}

async function resolveGitDir(absolutePath: string): Promise<string | null> {
  var gitPath = join(absolutePath, '.git');
  try {
    var gitStat = await stat(gitPath);
    if (gitStat.isDirectory()) {
      return gitPath;
    }
    if (!gitStat.isFile()) {
      return null;
    }
    var pointer = await readFile(gitPath, 'utf-8');
    var match = /^gitdir:\s*(.+)$/m.exec(pointer);
    return match?.[1]?.trim() || null;
  } catch {
    return null;
  }
}

export function parseOriginUrl(config: string): string | null {
  var originSection = /\[remote "origin"\]([\s\S]*?)(?=\n\[|$)/.exec(config);
  if (!originSection) {
    return null;
  }
  var url = /^\s*url\s*=\s*(.+)$/m.exec(originSection[1]!);
  return url?.[1]?.trim() || null;
}
