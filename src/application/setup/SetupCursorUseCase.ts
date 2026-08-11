import type { Result } from '../Result.js';
import { ok } from '../Result.js';
import { installContinuumCursorCommands } from '../../infrastructure/cursor/CursorCommandInstaller.js';
import { writeContinuumCursorMcpConfig } from '../../infrastructure/cursor/CursorMcpConfigWriter.js';
import { resolveBundledMcpServerPath } from '../../infrastructure/cursor/resolveMcpServerPath.js';

export type SetupCursorOptions = {
  readonly installSlashCommands?: boolean | undefined;
};

export type SetupCursorResult = {
  readonly mcpConfigPath: string;
  readonly mcpServerPath: string;
  readonly mcpUpdated: boolean;
  readonly commandsDir?: string | undefined;
  readonly commandsInstalled: string[];
  readonly commandsSkipped: string[];
};

export async function setupCursor(
  options: SetupCursorOptions = {},
): Promise<Result<SetupCursorResult>> {
  var installSlashCommands = options.installSlashCommands ?? true;
  var mcpServerPath = resolveBundledMcpServerPath();

  var mcpResult = await writeContinuumCursorMcpConfig(mcpServerPath);
  if (!mcpResult.ok) {
    return mcpResult;
  }

  var commandsInstalled: string[] = [];
  var commandsSkipped: string[] = [];
  var commandsDir: string | undefined;

  if (installSlashCommands) {
    var commandResult = await installContinuumCursorCommands();
    commandsDir = commandResult.commandsDir;
    commandsInstalled = commandResult.installed;
    commandsSkipped = commandResult.skipped;
  }

  return ok({
    mcpConfigPath: mcpResult.value.configPath,
    mcpServerPath,
    mcpUpdated: mcpResult.value.updated,
    commandsDir,
    commandsInstalled,
    commandsSkipped,
  });
}
