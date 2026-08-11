import { execFile } from 'node:child_process';
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
    try {
      var { stdout } = await execFileAsync('git', ['-C', absolutePath, 'remote', 'get-url', 'origin'], {
        timeout: 5000,
      });
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }

  async resolveProjectIdentity(absolutePath: string): Promise<ProjectIdentity> {
    var remote = await this.readRemoteUrl(absolutePath);
    if (remote) {
      return {
        hash: projectHashFromRemote(remote),
        slug: projectSlugFromRemote(remote),
        sourceHint: normalizeGitRemote(remote),
      };
    }
    return {
      hash: projectHashFromPath(absolutePath),
      slug: projectSlugFromPath(absolutePath),
      sourceHint: absolutePath,
    };
  }
}
