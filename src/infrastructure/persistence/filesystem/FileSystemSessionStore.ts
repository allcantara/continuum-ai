import { mkdir, readdir, readFile, rename, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { SessionStore } from '../../../domain/ports/SessionStore.js';
import type { ProjectHash } from '../../../domain/scope/ProjectHash.js';
import type { Scope } from '../../../domain/scope/Scope.js';
import type { WorkspaceHash } from '../../../domain/scope/WorkspaceHash.js';
import { createSession } from '../../../domain/session/Session.js';
import { sessionContentFrom } from '../../../domain/session/SessionContent.js';
import { sessionFilename, sessionIdFrom } from '../../../domain/session/SessionId.js';
import { sessionSummaryFrom } from '../../../domain/session/SessionSummary.js';
import type { Session } from '../../../domain/session/Session.js';
import type { SessionId } from '../../../domain/session/SessionId.js';
import {
  projectsDir,
  resolveContinuumHome,
  scopeMetaPath,
  scopeSessionsDir,
  trashDir,
  workspacesDir,
} from '../../config/ContinuumHome.js';
import { writeFileAtomically } from './AtomicFileWriter.js';
import { DirectoryLock } from './DirectoryLock.js';

export class FileSystemSessionStore implements SessionStore {
  constructor(private readonly home: string = resolveContinuumHome()) {}

  async save(session: Session): Promise<void> {
    var sessionsDir = scopeSessionsDir(this.home, session.scope.type, session.scope.hash);
    await mkdir(sessionsDir, { recursive: true });
    await this.ensureMeta(session);

    var lock = DirectoryLock.forDirectory(sessionsDir);
    await lock.withLock(async () => {
      var filePath = join(sessionsDir, sessionFilename(session.id));
      await writeFileAtomically(filePath, session.content);
    });
  }

  async findById(scope: Scope, id: SessionId): Promise<Session | null> {
    var sessionsDir = scopeSessionsDir(this.home, scope.type, scope.hash);
    var filePath = join(sessionsDir, sessionFilename(id));

    try {
      var content = await readFile(filePath, 'utf-8');
      return createSession({
        id,
        scope,
        content: sessionContentFrom(content),
        summary: sessionSummaryFrom(content.split('\n')[0] ?? content.slice(0, 200)),
        createdAt: parseSessionDate(id),
        status: 'active',
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return await this.findTrashedById(scope, id);
      }
      throw error;
    }
  }

  async findLatest(scope: Scope): Promise<Session | null> {
    var sessions = await this.findRecent(scope, 1);
    return sessions[0] ?? null;
  }

  async findRecent(scope: Scope, limit: number): Promise<readonly Session[]> {
    var sessionsDir = scopeSessionsDir(this.home, scope.type, scope.hash);

    try {
      var files = await readdir(sessionsDir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }

    var mdFiles = files.filter((f) => f.endsWith('.md')).sort().reverse().slice(0, limit);

    var sessions: Session[] = [];
    for (var file of mdFiles) {
      var id = sessionIdFrom(file.replace('.md', ''));
      var content = await readFile(join(sessionsDir, file), 'utf-8');
      sessions.push(
        createSession({
          id,
          scope,
          content: sessionContentFrom(content),
          summary: sessionSummaryFrom(content.split('\n').find((l) => l.trim() && !l.startsWith('#')) ?? content.slice(0, 200)),
          createdAt: parseSessionDate(id),
          status: 'active',
        }),
      );
    }

    return sessions;
  }

  async moveToTrash(scope: Scope, id: SessionId): Promise<void> {
    var sessionsDir = scopeSessionsDir(this.home, scope.type, scope.hash);
    var sourcePath = join(sessionsDir, sessionFilename(id));
    var trashTarget = join(trashDir(this.home), 'sessions', scope.hash, `${id}-${Date.now()}.md`);

    await mkdir(join(trashTarget, '..'), { recursive: true });
    await rename(sourcePath, trashTarget);
  }

  async restoreFromTrash(scope: Scope, id: SessionId): Promise<void> {
    var trashSessionsDir = join(trashDir(this.home), 'sessions', scope.hash);

    try {
      var files = await readdir(trashSessionsDir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Session not found in trash: ${id}`);
      }
      throw error;
    }

    var match = files.find((f) => f.startsWith(`${id}-`) || f === `${id}.md`);
    if (!match) {
      throw new Error(`Session not found in trash: ${id}`);
    }

    var sessionsDir = scopeSessionsDir(this.home, scope.type, scope.hash);
    await mkdir(sessionsDir, { recursive: true });
    await rename(join(trashSessionsDir, match), join(sessionsDir, sessionFilename(id)));
  }

  async moveScopeToTrash(scope: Scope): Promise<void> {
    var scopeDir = scope.type === 'project'
      ? join(projectsDir(this.home), scope.hash)
      : join(workspacesDir(this.home), scope.hash);

    try {
      await stat(scopeDir);
    } catch {
      return;
    }

    var trashTarget = join(
      trashDir(this.home),
      scope.type === 'project' ? 'projects' : 'workspaces',
      `${scope.hash}-${Date.now()}`,
    );
    await mkdir(join(trashTarget, '..'), { recursive: true });
    await rename(scopeDir, trashTarget);
  }

  async listAllSessions(): Promise<readonly Session[]> {
    var allSessions: Session[] = [];

    for (var scopeType of ['project', 'workspace'] as const) {
      var baseDir = scopeType === 'project' ? projectsDir(this.home) : workspacesDir(this.home);

      try {
        var scopeHashes = await readdir(baseDir);
      } catch {
        continue;
      }

      for (var hash of scopeHashes) {
        if (scopeType === 'project') {
          var projectScope: Scope = { type: 'project', hash: hash as ProjectHash };
          var projectSessions = await this.findRecent(projectScope, Number.MAX_SAFE_INTEGER);
          allSessions.push(...projectSessions);
        } else {
          var workspaceScope: Scope = {
            type: 'workspace',
            hash: hash as WorkspaceHash,
            projectHashes: [],
          };
          var workspaceSessions = await this.findRecent(workspaceScope, Number.MAX_SAFE_INTEGER);
          allSessions.push(...workspaceSessions);
        }
      }
    }

    return allSessions;
  }

  private async findTrashedById(scope: Scope, id: SessionId): Promise<Session | null> {
    var trashSessionsDir = join(trashDir(this.home), 'sessions', scope.hash);

    try {
      var files = await readdir(trashSessionsDir);
    } catch {
      return null;
    }

    var match = files.find((f) => f.startsWith(`${id}-`) || f === `${id}.md`);
    if (!match) {
      return null;
    }

    var content = await readFile(join(trashSessionsDir, match), 'utf-8');
    return createSession({
      id,
      scope,
      content: sessionContentFrom(content),
      summary: sessionSummaryFrom(content.split('\n')[0] ?? content.slice(0, 200)),
      createdAt: parseSessionDate(id),
      status: 'trashed',
    });
  }

  private async ensureMeta(session: Session): Promise<void> {
    var metaPath = scopeMetaPath(this.home, session.scope.type, session.scope.hash);
    try {
      await stat(metaPath);
    } catch {
      var created = session.createdAt.toISOString().split('T')[0];
      var meta = `# ${session.scope.type}\n\n- Hash: ${session.scope.hash}\n- Created: ${created}\n`;
      await writeFileAtomically(metaPath, meta);
    }
  }
}

function parseSessionDate(id: SessionId): Date {
  var timestamp = id.split('-').slice(0, 4).join('-');
  var parts = timestamp.split('-');
  var year = Number(parts[0]);
  var month = Number(parts[1]) - 1;
  var day = Number(parts[2]);
  var timePart = parts[3] ?? '0000';
  var hours = Number(timePart.slice(0, 2));
  var minutes = Number(timePart.slice(2, 4));
  return new Date(year, month, day, hours, minutes);
}
