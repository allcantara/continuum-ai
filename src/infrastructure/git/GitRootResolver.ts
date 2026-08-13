import { readFile, stat } from 'node:fs/promises';
import { dirname, join, parse, resolve } from 'node:path';

export async function findGitRoot(startPath: string): Promise<string | null> {
  var current = resolve(startPath);
  var root = parse(current).root;

  while (true) {
    if (await hasGitMetadata(current)) {
      return current;
    }
    if (current === root) {
      return null;
    }
    var parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

async function hasGitMetadata(absolutePath: string): Promise<boolean> {
  return (await resolveGitDir(absolutePath)) !== null;
}

export async function resolveGitDir(absolutePath: string): Promise<string | null> {
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
