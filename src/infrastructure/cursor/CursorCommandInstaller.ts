import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveCursorCommandsDir } from './CursorPaths.js';

const MANAGED_MARKER = 'continuum-ai-managed: true';

type SlashCommandTemplate = {
  readonly fileName: string;
  readonly content: string;
};

const ROOTS_COMMAND_HINT = `Always pass \`roots\` with the absolute path of the folder this chat is in (git project, random folder, or user home). Git is not required. Cursor does not send this automatically. Omit only when no folder path is known at all — then the shared "sem-projeto" bucket is used.`;

const SLASH_COMMANDS: SlashCommandTemplate[] = [
  {
    fileName: 'continuum-save.md',
    content: `---
description: Save a cumulative session snapshot in Continuum
${MANAGED_MARKER}
---

Save the current work session using the MCP tool \`continuum_save\`.

- \`roots\`: ${ROOTS_COMMAND_HINT}
- \`content\`: full cumulative markdown snapshot (decisions, state, next steps)
- \`summary\`: optional short summary (1–2 lines)

Confirm the saved session id to the user.
`,
  },
  {
    fileName: 'continuum-load.md',
    content: `---
description: Load the latest Continuum session for this project
${MANAGED_MARKER}
---

Load the most recent session for the current scope using the MCP tool \`continuum_load\`.

- \`roots\`: ${ROOTS_COMMAND_HINT}

Present the loaded context clearly and note the session id if available.
`,
  },
  {
    fileName: 'continuum-recap.md',
    content: `---
description: Load recent Continuum session history (default last 5)
${MANAGED_MARKER}
---

Load recent session history using the MCP tool \`continuum_recap\` (default \`last: 5\` unless the user specifies another number).

- \`roots\`: ${ROOTS_COMMAND_HINT}

Summarize what changed across sessions and highlight open items.
`,
  },
  {
    fileName: 'continuum-list.md',
    content: `---
description: Search and list Continuum sessions for the current scope
${MANAGED_MARKER}
---

List sessions using the MCP tool \`continuum_list\`.

- \`roots\`: ${ROOTS_COMMAND_HINT}
- Use \`query\` when the user wants to search by keyword.
- Use \`all_projects: true\` only when the user explicitly asks to search across all projects. If the scoped list is empty, try \`all_projects: true\` before concluding there are no sessions.

Present results as a readable list with session id, scope, and summary.
`,
  },
  {
    fileName: 'continuum-stash.md',
    content: `---
description: Move a Continuum session or project to trash
${MANAGED_MARKER}
---

Move items to trash using the MCP tool \`continuum_stash\`.

- \`roots\`: ${ROOTS_COMMAND_HINT}
- \`session_id\`: stash one session (ask the user or use an id from prior \`continuum_list\` / \`continuum_trash\` output)
- \`project: true\`: stash the entire current project/workspace (only when the user explicitly requests it)

Confirm what was stashed.
`,
  },
  {
    fileName: 'continuum-trash.md',
    content: `---
description: List items in the Continuum trash
${MANAGED_MARKER}
---

List trashed sessions using the MCP tool \`continuum_trash\`.

Present session id, scope, and summary for each item. If trash is empty, say so clearly.
`,
  },
  {
    fileName: 'continuum-restore.md',
    content: `---
description: Restore a Continuum session from trash
${MANAGED_MARKER}
---

Restore a session using the MCP tool \`continuum_restore\`.

- \`roots\`: ${ROOTS_COMMAND_HINT}
- \`session_id\` is required — use the id from the user's message or from \`continuum_trash\` / \`continuum_list\` output.

Confirm the restored session id to the user.
`,
  },
];

export type CursorCommandInstallResult = {
  readonly commandsDir: string;
  readonly installed: string[];
  readonly skipped: string[];
};

export async function installContinuumCursorCommands(): Promise<CursorCommandInstallResult> {
  var commandsDir = resolveCursorCommandsDir();
  await mkdir(commandsDir, { recursive: true });

  var installed: string[] = [];
  var skipped: string[] = [];

  for (var template of SLASH_COMMANDS) {
    var targetPath = join(commandsDir, template.fileName);
    if (await shouldSkipCommandInstall(targetPath)) {
      skipped.push(template.fileName);
      continue;
    }
    await writeFile(targetPath, template.content, 'utf-8');
    installed.push(template.fileName);
  }

  return { commandsDir, installed, skipped };
}

async function shouldSkipCommandInstall(path: string): Promise<boolean> {
  if (!(await fileExists(path))) {
    return false;
  }
  var existing = await readFile(path, 'utf-8');
  return !existing.includes(MANAGED_MARKER);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
