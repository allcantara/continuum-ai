#!/usr/bin/env node

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { Command } from 'commander';
import { createContainer } from '../../container.js';
import { setupCursor } from '../../application/setup/SetupCursorUseCase.js';
import { PACKAGE_VERSION } from '../../infrastructure/config/packageVersion.js';
import {
  handleList,
  handleLoad,
  handleRecap,
  handleRestore,
  handleSave,
  handleStash,
  handleTrash,
} from '../mcp/tools/handlers.js';

function openEditor(): string {
  var editor = process.env.EDITOR ?? process.env.VISUAL ?? 'nano';
  var tmpFile = `/tmp/continuum-${Date.now()}.md`;
  execSync(`${editor} "${tmpFile}"`, { stdio: 'inherit' });
  return readFileSync(tmpFile, 'utf-8');
}

function resolveCliRoots(roots?: string[]): string[] | undefined {
  return roots && roots.length > 0 ? roots : undefined;
}

async function main(): Promise<void> {
  var container = await createContainer();
  var program = new Command();

  program
    .name('continuum')
    .description('Persist and reuse work context across chats, projects, and tools')
    .version(PACKAGE_VERSION);

  program
    .command('save')
    .description('Save current session context')
    .option('-m, --message <summary>', 'Short summary')
    .option('--roots <path...>', 'Absolute workspace path(s); defaults to the current directory')
    .action(async (options: { message?: string; roots?: string[] }) => {
      var content = openEditor();
      var text = await handleSave(
        container,
        { content, summary: options.message, roots: resolveCliRoots(options.roots) },
        'cli',
      );
      console.log(text);
    });

  program
    .command('load')
    .description('Load the most recent session')
    .option('--roots <path...>', 'Absolute workspace path(s); defaults to the current directory')
    .action(async (options: { roots?: string[] }) => {
      var text = await handleLoad(container, { roots: resolveCliRoots(options.roots) }, 'cli');
      console.log(text);
    });

  program
    .command('recap')
    .description('Load last N sessions')
    .option('--last <n>', 'Number of sessions', '5')
    .option('--roots <path...>', 'Absolute workspace path(s); defaults to the current directory')
    .action(async (options: { last: string; roots?: string[] }) => {
      var text = await handleRecap(
        container,
        { last: Number(options.last), roots: resolveCliRoots(options.roots) },
        'cli',
      );
      console.log(text);
    });

  program
    .command('list')
    .description('Search and list sessions')
    .option('-q, --query <search>', 'Search query')
    .option('--all-projects', 'Search across all projects')
    .option('--roots <path...>', 'Absolute workspace path(s); defaults to the current directory')
    .action(async (options: { query?: string; allProjects?: boolean; roots?: string[] }) => {
      var text = await handleList(
        container,
        {
          query: options.query,
          all_projects: options.allProjects,
          roots: resolveCliRoots(options.roots),
        },
        'cli',
      );
      console.log(text);
    });

  program
    .command('stash')
    .description('Move session or project to trash')
    .option('--session <id>', 'Session ID to stash')
    .option('--project', 'Stash entire project/workspace')
    .option('--roots <path...>', 'Absolute workspace path(s); defaults to the current directory')
    .action(async (options: { session?: string; project?: boolean; roots?: string[] }) => {
      var text = await handleStash(
        container,
        {
          session_id: options.session,
          project: options.project,
          roots: resolveCliRoots(options.roots),
        },
        'cli',
      );
      console.log(text);
    });

  program
    .command('trash')
    .description('List trashed items')
    .action(async () => {
      var text = await handleTrash(container);
      console.log(text);
    });

  program
    .command('restore')
    .description('Restore session or project from trash')
    .argument('[id]', 'Session ID to restore')
    .option('--project', 'Restore entire project/workspace')
    .option('--roots <path...>', 'Absolute workspace path(s); defaults to the current directory')
    .action(async (id: string | undefined, options: { project?: boolean; roots?: string[] }) => {
      var text = await handleRestore(
        container,
        {
          session_id: id,
          project: options.project,
          roots: resolveCliRoots(options.roots),
        },
        'cli',
      );
      console.log(text);
    });

  var setupCmd = program.command('setup').description('Configure integrations');

  setupCmd
    .command('cursor')
    .description('Configure Cursor MCP and slash commands (~/.cursor)')
    .option('--no-commands', 'Skip installing /continuum-* slash commands')
    .action(async (options: { commands: boolean }) => {
      var result = await setupCursor({ installSlashCommands: options.commands });
      if (!result.ok) {
        console.error(`Error: ${result.reason}`);
        process.exit(1);
      }

      var setup = result.value;
      if (setup.mcpUpdated) {
        console.log(`Configured Cursor MCP at ${setup.mcpConfigPath}`);
      } else {
        console.log(`Cursor MCP already up to date at ${setup.mcpConfigPath}`);
      }
      console.log(`MCP server: ${setup.mcpServerPath}`);

      if (options.commands) {
        if (setup.commandsInstalled.length > 0) {
          console.log(`Installed slash commands: ${setup.commandsInstalled.join(', ')}`);
        }
        if (setup.commandsSkipped.length > 0) {
          console.log(`Skipped existing custom commands: ${setup.commandsSkipped.join(', ')}`);
        }
      }

      console.log('Reload Cursor (Settings → MCP) to activate.');
    });

  await program.parseAsync(process.argv);
}

main().catch((error) => {
  console.error('Continuum CLI failed:', error);
  process.exit(1);
});
