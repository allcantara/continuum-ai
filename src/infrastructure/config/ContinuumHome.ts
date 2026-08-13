import { homedir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_HOME = join(homedir(), '.continuum');

export function resolveContinuumHome(): string {
  return process.env.CONTINUUM_HOME ?? DEFAULT_HOME;
}

export function projectsDir(home: string): string {
  return join(home, 'projects');
}

export function workspacesDir(home: string): string {
  return join(home, 'workspaces');
}

export function trashDir(home: string): string {
  return join(home, '.trash');
}

export function indexPath(home: string): string {
  return join(home, 'index.sqlite');
}

export function scopeSessionsDir(home: string, scopeType: 'project' | 'workspace', scopeDirName: string): string {
  var base = scopeType === 'project' ? projectsDir(home) : workspacesDir(home);
  return join(base, scopeDirName, 'sessions');
}

export function scopeMetaPath(home: string, scopeType: 'project' | 'workspace', scopeDirName: string): string {
  var base = scopeType === 'project' ? projectsDir(home) : workspacesDir(home);
  return join(base, scopeDirName, 'meta.md');
}
