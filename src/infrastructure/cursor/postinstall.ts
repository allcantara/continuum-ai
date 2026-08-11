import { setupCursor } from '../../application/setup/SetupCursorUseCase.js';
import { isNpmGlobalInstall } from '../npm/isNpmGlobalInstall.js';

async function main(): Promise<void> {
  if (!isNpmGlobalInstall()) {
    return;
  }

  var result = await setupCursor();
  if (!result.ok) {
    console.warn(`Continuum: Cursor setup skipped — ${result.reason}`);
    console.warn('Run `continuum setup cursor` after fixing ~/.cursor/mcp.json');
    return;
  }

  if (result.value.mcpUpdated) {
    console.log(`Continuum: configured Cursor MCP at ${result.value.mcpConfigPath}`);
  } else {
    console.log(`Continuum: Cursor MCP already configured at ${result.value.mcpConfigPath}`);
  }

  if (result.value.commandsInstalled.length > 0) {
    console.log(`Continuum: installed slash commands: ${result.value.commandsInstalled.join(', ')}`);
  }

  console.log('Continuum: reload Cursor (Settings → MCP) to activate.');
}

main().catch((error: unknown) => {
  console.warn('Continuum: Cursor setup failed:', error);
});
