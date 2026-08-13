import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveGitDir } from './GitRootResolver.js';

const EXCLUDE_ENTRY = '.continuum.local.json';
const EXCLUDE_COMMENT = '# continuum-ai';

export async function excludeFromLocalGit(gitRoot: string, relativePath: string = EXCLUDE_ENTRY): Promise<void> {
  var gitDir = await resolveGitDir(gitRoot);
  if (!gitDir) {
    return;
  }

  var infoDir = join(gitDir, 'info');
  var excludePath = join(infoDir, 'exclude');
  await mkdir(infoDir, { recursive: true });

  var existing = '';
  try {
    existing = await readFile(excludePath, 'utf-8');
  } catch {
    existing = '';
  }

  var lines = existing.split(/\r?\n/).map((line) => line.trim());
  if (lines.includes(relativePath)) {
    return;
  }

  var prefix = existing.length > 0 && !existing.endsWith('\n') ? '\n' : '';
  await appendFile(excludePath, `${prefix}${EXCLUDE_COMMENT}\n${relativePath}\n`, 'utf-8');
}
