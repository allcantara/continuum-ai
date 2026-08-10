import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { GitRemoteReader as GitRemoteReaderPort } from '../../domain/ports/GitRemoteReader.js';
import { projectHashFromPath, projectHashFromRemote } from '../../domain/scope/ProjectHash.js';
import type { ProjectHash } from '../../domain/scope/ProjectHash.js';

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

  async resolveProjectHash(absolutePath: string): Promise<ProjectHash> {
    var remote = await this.readRemoteUrl(absolutePath);
    if (remote) {
      return projectHashFromRemote(remote);
    }
    return projectHashFromPath(absolutePath);
  }
}
