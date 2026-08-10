import { rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

export async function writeFileAtomically(targetPath: string, content: string): Promise<void> {
  var dir = targetPath.substring(0, targetPath.lastIndexOf('/'));
  var tempName = `.tmp-${randomBytes(8).toString('hex')}`;
  var tempPath = join(dir, tempName);

  await writeFile(tempPath, content, 'utf-8');
  await rename(tempPath, targetPath);
}
