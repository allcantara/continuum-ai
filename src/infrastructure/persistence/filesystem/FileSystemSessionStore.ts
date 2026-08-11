import { mkdir, readdir, readFile, rename, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { SessionStore } from '../../../domain/ports/SessionStore.js';
import type { ProjectHash } from '../../../domain/scope/ProjectHash.js';
import {
  UNSCOPED_PROJECT_HASH,
  isUnscoped,
  projectScope,
  scopeFolderName,
  workspaceScope,
} from '../../../domain/scope/Scope.js';
import type { Scope } from '../../../domain/scope/Scope.js';
import type { WorkspaceHash } from '../../../domain/scope/WorkspaceHash.js';
import { createSession } from '../../../domain/session/Session.js';
import { compareSessionIdsAscending, sessionFilename, sessionIdFrom } from '../../../domain/session/SessionId.js';
import { parseSessionFile, serializeSessionFile } from '../../../domain/session/SessionFile.js';
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
    var dirName = await this.resolveScopeDirName(session.scope);
    var sessionsDir = scopeSessionsDir(this.home, session.scope.type, dirName);
    await mkdir(sessionsDir, { recursive: true });
    await this.ensureMeta(session, dirName);

    var lock = DirectoryLock.forDirectory(sessionsDir);
    await lock.withLock(async () => {
      var filePath = join(sessionsDir, sessionFilename(session.id));
      await writeFileAtomically(filePath, serializeSessionFile(session.summary, session.content));
    });
  }

  async saveWithUniqueTimestamp(
    scope: Scope,
    timestamp: string,
    build: (id: SessionId) => Session,
  ): Promise<Session> {
    var dirName = await this.resolveScopeDirName(scope);
    var sessionsDir = scopeSessionsDir(this.home, scope.type, dirName);
    await mkdir(sessionsDir, { recursive: true });

    var lock = DirectoryLock.forDirectory(sessionsDir);
    return lock.withLock(async () => {
      var id = await this.pickUniqueId(scope, timestamp);
      var session = build(id);
      await this.ensureMeta(session, dirName);
      var filePath = join(sessionsDir, sessionFilename(id));
      await writeFileAtomically(filePath, serializeSessionFile(session.summary, session.content));
      return session;
    });
  }

  async findById(scope: Scope, id: SessionId): Promise<Session | null> {
    var dirName = await this.resolveScopeDirName(scope);
    var sessionsDir = scopeSessionsDir(this.home, scope.type, dirName);
    var filePath = join(sessionsDir, sessionFilename(id));

    try {
      var raw = await readFile(filePath, 'utf-8');
      var parsed = parseSessionFile(raw);
      return createSession({
        id,
        scope,
        content: parsed.content,
        summary: parsed.summary,
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
    var dirName = await this.resolveScopeDirName(scope);
    var sessionsDir = scopeSessionsDir(this.home, scope.type, dirName);

    try {
      var files = await readdir(sessionsDir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }

    var mdFiles = files.filter((f) => f.endsWith('.md'));
    var rankedIds = mdFiles
      .map((file) => sessionIdFrom(file.replace('.md', '')))
      .sort((a, b) => compareSessionIdsAscending(b, a));
    var selectedFiles = rankedIds.slice(0, limit).map((id) => sessionFilename(id));

    var sessions: Session[] = [];
    for (var file of selectedFiles) {
      var id = sessionIdFrom(file.replace('.md', ''));
      var raw = await readFile(join(sessionsDir, file), 'utf-8');
      var parsed = parseSessionFile(raw);
      sessions.push(
        createSession({
          id,
          scope,
          content: parsed.content,
          summary: parsed.summary,
          createdAt: parseSessionDate(id),
          status: 'active',
        }),
      );
    }

    return sessions;
  }

  async moveToTrash(scope: Scope, id: SessionId): Promise<void> {
    var dirName = await this.resolveScopeDirName(scope);
    var sessionsDir = scopeSessionsDir(this.home, scope.type, dirName);
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

    var dirName = await this.resolveScopeDirName(scope);
    var sessionsDir = scopeSessionsDir(this.home, scope.type, dirName);
    await mkdir(sessionsDir, { recursive: true });
    await rename(join(trashSessionsDir, match), join(sessionsDir, sessionFilename(id)));
  }

  async moveScopeToTrash(scope: Scope): Promise<void> {
    var dirName = await this.resolveScopeDirName(scope);
    var scopeDir = scope.type === 'project'
      ? join(projectsDir(this.home), dirName)
      : join(workspacesDir(this.home), dirName);

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

  async restoreScopeFromTrash(scope: Scope): Promise<readonly SessionId[]> {
    var trashScopeBase = scope.type === 'project'
      ? join(trashDir(this.home), 'projects')
      : join(trashDir(this.home), 'workspaces');

    var matches: string[];
    try {
      var entries = await readdir(trashScopeBase);
      matches = entries.filter((entry) => entry.startsWith(`${scope.hash}-`));
    } catch {
      throw new Error(`Scope not found in trash: ${scope.hash}`);
    }

    if (matches.length === 0) {
      throw new Error(`Scope not found in trash: ${scope.hash}`);
    }

    var latestTrashDir = matches.sort().reverse()[0]!;
    var sourcePath = join(trashScopeBase, latestTrashDir);
    var targetDirName = await this.resolveScopeDirName(scope);
    var targetBase = scope.type === 'project' ? projectsDir(this.home) : workspacesDir(this.home);
    var targetPath = join(targetBase, targetDirName);

    if (await pathExists(targetPath)) {
      throw new Error(`Cannot restore scope: target directory already exists (${targetDirName})`);
    }

    await mkdir(targetBase, { recursive: true });
    await rename(sourcePath, targetPath);

    var sessionsDir = join(targetPath, 'sessions');
    try {
      var sessionFiles = await readdir(sessionsDir);
      return sessionFiles
        .filter((file) => file.endsWith('.md'))
        .map((file) => sessionIdFrom(file.replace('.md', '')));
    } catch {
      return [];
    }
  }

  async listAllSessions(): Promise<readonly Session[]> {
    var allSessions: Session[] = [];

    for (var scopeType of ['project', 'workspace'] as const) {
      var baseDir = scopeType === 'project' ? projectsDir(this.home) : workspacesDir(this.home);

      try {
        var dirNames = await readdir(baseDir);
      } catch {
        continue;
      }

      for (var dirName of dirNames) {
        var { hash, slug } = parseScopeDirName(dirName);
        var scope: Scope = scopeType === 'project'
          ? projectScope(hash as ProjectHash, slug)
          : workspaceScope(hash as WorkspaceHash, [], slug);

        var sessions = await this.findRecent(scope, Number.MAX_SAFE_INTEGER);
        allSessions.push(...sessions);
      }
    }

    allSessions.push(...await this.listTrashedSessions());
    return allSessions;
  }

  async countAllSessions(): Promise<number> {
    var count = 0;

    for (var scopeType of ['project', 'workspace'] as const) {
      var baseDir = scopeType === 'project' ? projectsDir(this.home) : workspacesDir(this.home);
      count += await this.countMarkdownFilesInTree(baseDir, 'sessions');
    }

    count += await this.countMarkdownFilesInTree(join(trashDir(this.home), 'sessions'), undefined);
    count += await this.countMarkdownFilesInTree(join(trashDir(this.home), 'projects'), 'sessions');
    count += await this.countMarkdownFilesInTree(join(trashDir(this.home), 'workspaces'), 'sessions');

    return count;
  }

  private async listTrashedSessions(): Promise<readonly Session[]> {
    var trashedSessions: Session[] = [];
    var trashSessionsRoot = join(trashDir(this.home), 'sessions');

    try {
      var scopeHashes = await readdir(trashSessionsRoot);
      for (var scopeHash of scopeHashes) {
        var trashScopeDir = join(trashSessionsRoot, scopeHash);
        var scope = projectScope(scopeHash as ProjectHash);
        trashedSessions.push(...await this.readTrashedSessionFiles(trashScopeDir, scope));
      }
    } catch {
      // no individual trashed sessions
    }

    for (var scopeType of ['project', 'workspace'] as const) {
      var trashScopeBase = scopeType === 'project'
        ? join(trashDir(this.home), 'projects')
        : join(trashDir(this.home), 'workspaces');

      try {
        var trashDirs = await readdir(trashScopeBase);
      } catch {
        continue;
      }

      for (var trashDirName of trashDirs) {
        var parsed = parseTrashedScopeDirName(trashDirName);
        var trashedScope: Scope = scopeType === 'project'
          ? projectScope(parsed.hash as ProjectHash, parsed.slug)
          : workspaceScope(parsed.hash as WorkspaceHash, [], parsed.slug);
        trashedSessions.push(
          ...await this.readTrashedSessionFiles(join(trashScopeBase, trashDirName, 'sessions'), trashedScope),
        );
      }
    }

    return trashedSessions;
  }

  private async readTrashedSessionFiles(sessionsDir: string, scope: Scope): Promise<readonly Session[]> {
    try {
      var files = await readdir(sessionsDir);
    } catch {
      return [];
    }

    var sessions: Session[] = [];
    for (var file of files.filter((entry) => entry.endsWith('.md'))) {
      var id = parseTrashedSessionId(file);
      var raw = await readFile(join(sessionsDir, file), 'utf-8');
      var parsed = parseSessionFile(raw);
      sessions.push(
        createSession({
          id,
          scope,
          content: parsed.content,
          summary: parsed.summary,
          createdAt: parseSessionDate(id),
          status: 'trashed',
        }),
      );
    }

    return sessions;
  }

  private async countMarkdownFilesInTree(baseDir: string, nestedDirName: string | undefined): Promise<number> {
    try {
      var entries = await readdir(baseDir, { withFileTypes: true });
    } catch {
      return 0;
    }

    var count = 0;
    for (var entry of entries) {
      if (nestedDirName === undefined) {
        // Flat trees (e.g. trashed individual sessions) have no meta.md siblings, so any
        // .md file found anywhere is an actual session file.
        if (entry.isFile() && entry.name.endsWith('.md')) {
          count += 1;
        } else if (entry.isDirectory()) {
          count += await this.countMarkdownFilesInTree(join(baseDir, entry.name), undefined);
        }
        continue;
      }

      if (!entry.isDirectory()) {
        // Scope directories hold a meta.md alongside their sessions/ folder — it must not
        // be counted as a session.
        continue;
      }

      if (entry.name === nestedDirName) {
        var nestedFiles = await readdir(join(baseDir, entry.name));
        count += nestedFiles.filter((file) => file.endsWith('.md')).length;
      } else {
        count += await this.countMarkdownFilesInTree(join(baseDir, entry.name), nestedDirName);
      }
    }

    return count;
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

    var raw = await readFile(join(trashSessionsDir, match), 'utf-8');
    var parsed = parseSessionFile(raw);
    return createSession({
      id,
      scope,
      content: parsed.content,
      summary: parsed.summary,
      createdAt: parseSessionDate(id),
      status: 'trashed',
    });
  }

  private async pickUniqueId(scope: Scope, timestamp: string): Promise<SessionId> {
    var baseId = sessionIdFrom(timestamp);
    if (!(await this.findById(scope, baseId))) {
      return baseId;
    }

    for (var suffix = 1; suffix < 100; suffix++) {
      var candidate = sessionIdFrom(timestamp, suffix);
      if (!(await this.findById(scope, candidate))) {
        return candidate;
      }
    }

    throw new Error('Unable to generate unique session id');
  }

  /**
   * Resolves the on-disk directory name for a scope: the human-readable `<slug>-<hash>`
   * name when a slug is known, unless a legacy `<hash>`-only directory from before this
   * naming scheme already exists on disk for the same scope — in that case, keep using it
   * so existing sessions stay reachable instead of silently starting a second, empty folder.
   */
  private async resolveScopeDirName(scope: Scope): Promise<string> {
    var preferred = scopeFolderName(scope);
    if (preferred === scope.hash) {
      return preferred;
    }

    var base = scope.type === 'project' ? projectsDir(this.home) : workspacesDir(this.home);
    var legacyExists = await pathExists(join(base, scope.hash));
    return legacyExists ? scope.hash : preferred;
  }

  private async ensureMeta(session: Session, dirName: string): Promise<void> {
    var metaPath = scopeMetaPath(this.home, session.scope.type, dirName);
    try {
      await stat(metaPath);
    } catch {
      var created = session.createdAt.toISOString().split('T')[0];
      var scope = session.scope;
      var meta = [
        `# ${scope.type}`,
        '',
        `- Hash: ${scope.hash}`,
        `- Slug: ${scope.slug || '(desconhecido)'}`,
        `- Source: ${describeSourceHint(scope)}`,
        `- Created: ${created}`,
        '',
      ].join('\n');
      await writeFileAtomically(metaPath, meta);
    }
  }
}

function describeSourceHint(scope: Scope): string {
  if (isUnscoped(scope)) {
    return '(sem projeto — nenhuma raiz de workspace informada)';
  }
  if (scope.type === 'project') {
    return scope.sourceHint ?? '(desconhecido)';
  }
  return `workspace multi-root (${scope.projectHashes.length} projeto(s))`;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

const scopeDirNamePattern = new RegExp(`^(?:(.+)-)?([0-9a-f]{16}|${UNSCOPED_PROJECT_HASH})$`);

function parseScopeDirName(dirName: string): { hash: string; slug: string } {
  var match = scopeDirNamePattern.exec(dirName);
  if (!match) {
    return { hash: dirName, slug: '' };
  }
  return { hash: match[2]!, slug: match[1] ?? '' };
}

function parseTrashedScopeDirName(dirName: string): { hash: string; slug: string } {
  var match = /^(.+)-(\d{10,})$/.exec(dirName);
  if (!match) {
    return parseScopeDirName(dirName);
  }

  return parseScopeDirName(match[1]!);
}

function parseTrashedSessionId(filename: string): SessionId {
  var baseName = filename.replace(/\.md$/, '');
  var trashSuffixMatch = /^(.+)-(\d{10,})$/.exec(baseName);
  var idPart = trashSuffixMatch ? trashSuffixMatch[1]! : baseName;
  return sessionIdFrom(idPart);
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
