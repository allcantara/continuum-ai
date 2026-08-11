import { execFile } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import type { GitSyncPort, GitSyncResult } from '../../domain/ports/GitSyncPort.js';
import type { SyncConfiguration } from '../../domain/sync/SyncConfiguration.js';
import { syncDisabled, syncEnabled } from '../../domain/sync/SyncConfiguration.js';
import { resolveContinuumHome, syncConfigPath } from '../config/ContinuumHome.js';

const execFileAsync = promisify(execFile);

type StoredSyncConfig = {
  readonly enabled: boolean;
  readonly remoteUrl: string | null;
};

export class GitSyncAdapter implements GitSyncPort {
  constructor(private readonly home: string = resolveContinuumHome()) {}

  async getConfiguration(): Promise<SyncConfiguration> {
    try {
      var raw = await readFile(syncConfigPath(this.home), 'utf-8');
      var stored = JSON.parse(raw) as StoredSyncConfig;
      if (stored.enabled && stored.remoteUrl) {
        return syncEnabled(stored.remoteUrl);
      }
      return syncDisabled();
    } catch {
      return syncDisabled();
    }
  }

  async enable(remoteUrl: string): Promise<GitSyncResult> {
    await mkdir(this.home, { recursive: true });

    var isGitRepo = await this.isGitRepository();
    if (!isGitRepo) {
      await this.runGit(['init']);
    }

    try {
      await this.runGit(['remote', 'get-url', 'origin']);
    } catch {
      await this.runGit(['remote', 'add', 'origin', remoteUrl]);
    }

    // Pull before writing our own .gitignore/sync.json: `createContainer()` already
    // created index.sqlite (and its WAL side files) in this home directory before this
    // command ran, so on a second machine's first `sync enable`, those local untracked
    // files — plus a .gitignore/sync.json written here ahead of time — would collide with
    // the same paths coming from the remote and make git abort the merge silently.
    try {
      await this.runGit(['pull', 'origin', 'main', '--rebase']);
    } catch {
      try {
        await this.runGit(['pull', 'origin', 'master', '--rebase']);
      } catch {
        // fresh repo, no remote branch yet
      }
    }

    await this.ensureGitignore();

    var config = syncEnabled(remoteUrl);
    await writeFile(
      syncConfigPath(this.home),
      JSON.stringify({ enabled: true, remoteUrl: config.remoteUrl }, null, 2),
    );

    return { success: true, message: `Sync enabled with ${remoteUrl}` };
  }

  async pull(): Promise<GitSyncResult> {
    var config = await this.getConfiguration();
    if (!config.enabled) {
      return { success: true, message: 'Sync not enabled' };
    }

    try {
      await this.runGit(['pull', '--rebase']);
      return { success: true, message: 'Pull successful' };
    } catch (error) {
      return { success: false, message: `Pull failed: ${(error as Error).message}` };
    }
  }

  async commitAndPush(message: string): Promise<GitSyncResult> {
    var config = await this.getConfiguration();
    if (!config.enabled) {
      return { success: true, message: 'Sync not enabled' };
    }

    try {
      await this.runGit(['add', '-A']);

      var status = await this.runGit(['status', '--porcelain']);
      if (!status.stdout.trim()) {
        return { success: true, message: 'Nothing to commit' };
      }

      await this.runGit(['commit', '-m', message]);

      try {
        // `-u` sets the upstream tracking branch on the very first push (a fresh `sync
        // enable` has none yet) and is a no-op once tracking is already configured, so
        // plain `git pull`/`git push` keep working on every later call.
        await this.runGit(['push', '-u', 'origin', 'HEAD']);
        return { success: true, message: 'Committed and pushed' };
      } catch {
        await this.runGit(['pull', '--rebase']);
        await this.runGit(['push', '-u', 'origin', 'HEAD']);
        return { success: true, message: 'Committed and pushed after rebase' };
      }
    } catch (error) {
      return {
        success: false,
        message: `Commit/push failed (possível conflito real — resolva manualmente em ${this.home}): ${(error as Error).message}`,
      };
    }
  }

  private async isGitRepository(): Promise<boolean> {
    try {
      await access(`${this.home}/.git`);
      return true;
    } catch {
      return false;
    }
  }

  private async ensureGitignore(): Promise<void> {
    var gitignorePath = `${this.home}/.gitignore`;
    try {
      await access(gitignorePath);
    } catch {
      // index.sqlite-wal/-shm are WAL-mode companion files for index.sqlite (see
      // SqliteSessionIndex) — never commit any of them, they're a derived, rebuildable index.
      await writeFile(gitignorePath, 'index.sqlite*\n.lock\n');
    }
  }

  private async runGit(args: string[]): Promise<{ stdout: string; stderr: string }> {
    return execFileAsync('git', ['-C', this.home, ...args], { timeout: 30000 });
  }
}
