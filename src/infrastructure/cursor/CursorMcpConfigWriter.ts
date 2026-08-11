import { access, mkdir, readFile } from 'node:fs/promises';
import type { Result } from '../../application/Result.js';
import { ok } from '../../application/Result.js';
import { writeFileAtomically } from '../persistence/filesystem/AtomicFileWriter.js';
import { resolveCursorHome, resolveCursorMcpConfigPath } from './CursorPaths.js';
import { mergeContinuumMcpServer, parseCursorMcpConfig, type CursorMcpConfig } from './CursorMcpConfig.js';

export type CursorMcpWriteResult = {
  readonly configPath: string;
  readonly updated: boolean;
};

export async function writeContinuumCursorMcpConfig(
  serverPath: string,
): Promise<Result<CursorMcpWriteResult>> {
  var configPath = resolveCursorMcpConfigPath();
  await mkdir(resolveCursorHome(), { recursive: true });

  var config: CursorMcpConfig = {};
  if (await fileExists(configPath)) {
    var raw = await readFile(configPath, 'utf-8');
    var parsed = parseCursorMcpConfig(raw);
    if (!parsed.ok) {
      return parsed;
    }
    config = parsed.value;
  }

  var merged = mergeContinuumMcpServer(config, serverPath);
  if (!merged.updated && await fileExists(configPath)) {
    return ok({ configPath, updated: false });
  }

  var content = `${JSON.stringify(merged.config, null, 4)}\n`;
  await writeFileAtomically(configPath, content);
  return ok({ configPath, updated: merged.updated });
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
