import { mkdir } from 'node:fs/promises';
import { LoadSessionUseCase } from './application/load/LoadSessionUseCase.js';
import { ListSessionsUseCase } from './application/list/ListSessionsUseCase.js';
import { RecapUseCase } from './application/recap/RecapUseCase.js';
import { RestoreUseCase } from './application/restore/RestoreUseCase.js';
import { SaveSessionUseCase } from './application/save/SaveSessionUseCase.js';
import { ScopeResolutionService } from './application/ScopeResolutionService.js';
import { StashUseCase } from './application/stash/StashUseCase.js';
import { EnableSyncUseCase } from './application/sync/EnableSyncUseCase.js';
import { SyncStatusUseCase } from './application/sync/SyncStatusUseCase.js';
import { ListTrashUseCase } from './application/trash/ListTrashUseCase.js';
import type { SessionIndex } from './domain/ports/SessionStore.js';
import type { SessionStore } from './domain/ports/SessionStore.js';
import { resolveContinuumHome } from './infrastructure/config/ContinuumHome.js';
import { GitRemoteReader } from './infrastructure/git/GitRemoteReader.js';
import { GitSyncAdapter } from './infrastructure/git/GitSyncAdapter.js';
import { FileSystemSessionStore } from './infrastructure/persistence/filesystem/FileSystemSessionStore.js';
import { PlainTextFallbackIndex } from './infrastructure/persistence/sqlite/PlainTextFallbackIndex.js';
import { SqliteSessionIndex } from './infrastructure/persistence/sqlite/SqliteSessionIndex.js';

export type Container = {
  readonly home: string;
  readonly sessionStore: SessionStore;
  readonly sessionIndex: SessionIndex;
  readonly scopeResolution: ScopeResolutionService;
  readonly saveSession: SaveSessionUseCase;
  readonly loadSession: LoadSessionUseCase;
  readonly recap: RecapUseCase;
  readonly listSessions: ListSessionsUseCase;
  readonly enableSync: EnableSyncUseCase;
  readonly syncStatus: SyncStatusUseCase;
  readonly stash: StashUseCase;
  readonly listTrash: ListTrashUseCase;
  readonly restore: RestoreUseCase;
};

export async function createContainer(home?: string): Promise<Container> {
  var resolvedHome = home ?? resolveContinuumHome();
  await mkdir(resolvedHome, { recursive: true });

  var sessionStore = new FileSystemSessionStore(resolvedHome);
  var sessionIndex = await createSessionIndex(resolvedHome, sessionStore);
  var gitRemoteReader = new GitRemoteReader();
  var gitSync = new GitSyncAdapter(resolvedHome);
  var scopeResolution = new ScopeResolutionService(gitRemoteReader);

  return {
    home: resolvedHome,
    sessionStore,
    sessionIndex,
    scopeResolution,
    saveSession: new SaveSessionUseCase(sessionStore, sessionIndex, gitSync),
    loadSession: new LoadSessionUseCase(sessionStore, gitSync),
    recap: new RecapUseCase(sessionStore, gitSync),
    listSessions: new ListSessionsUseCase(sessionIndex, gitSync),
    enableSync: new EnableSyncUseCase(gitSync),
    syncStatus: new SyncStatusUseCase(gitSync),
    stash: new StashUseCase(sessionStore, sessionIndex, gitSync),
    listTrash: new ListTrashUseCase(sessionIndex, gitSync),
    restore: new RestoreUseCase(sessionStore, sessionIndex, gitSync),
  };
}

async function createSessionIndex(home: string, sessionStore: SessionStore): Promise<SessionIndex> {
  var sqliteIndex = new SqliteSessionIndex(home);
  await sqliteIndex.initialize();

  if (sqliteIndex.isAvailable()) {
    return sqliteIndex;
  }

  var fallback = new PlainTextFallbackIndex();
  var sessions = await sessionStore.listAllSessions();
  await fallback.rebuildFromSessions(sessions);
  return fallback;
}
