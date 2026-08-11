#!/usr/bin/env node

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { Command } from 'commander';
import { createContainer } from '../../container.js';
import {
  handleList,
  handleLoad,
  handleRecap,
  handleRestore,
  handleSave,
  handleStash,
  handleSync,
  handleTrash,
} from '../mcp/tools/handlers.js';

function openEditor(): string {
  var editor = process.env.EDITOR ?? process.env.VISUAL ?? 'nano';
  var tmpFile = `/tmp/continuum-${Date.now()}.md`;
  execSync(`${editor} "${tmpFile}"`, { stdio: 'inherit' });
  return readFileSync(tmpFile, 'utf-8');
}

async function main(): Promise<void> {
  var container = await createContainer();
  var program = new Command();

  program
    .name('continuum')
    .description('Persist and reuse work context across chats, projects, and tools')
    .version('0.1.0');

  program
    .command('save')
    .description('Save current session context')
    .option('-m, --message <summary>', 'Short summary')
    .action(async (options: { message?: string }) => {
      var content = openEditor();
      var text = await handleSave(container, { content, summary: options.message });
      console.log(text);
    });

  program
    .command('load')
    .description('Load the most recent session')
    .action(async () => {
      var text = await handleLoad(container, {});
      console.log(text);
    });

  program
    .command('recap')
    .description('Load last N sessions')
    .option('--last <n>', 'Number of sessions', '5')
    .action(async (options: { last: string }) => {
      var text = await handleRecap(container, { last: Number(options.last) });
      console.log(text);
    });

  program
    .command('list')
    .description('Search and list sessions')
    .option('-q, --query <search>', 'Search query')
    .option('--all-projects', 'Search across all projects')
    .action(async (options: { query?: string; allProjects?: boolean }) => {
      var text = await handleList(container, {
        query: options.query,
        all_projects: options.allProjects,
      });
      console.log(text);
    });

  var syncCmd = program.command('sync').description('Git sync management');

  syncCmd
    .command('enable')
    .description('Enable git sync with a remote URL')
    .argument('<remote-url>', 'Git remote URL')
    .action(async (remoteUrl: string) => {
      var text = await handleSync(container, { action: 'enable', remote_url: remoteUrl });
      console.log(text);
    });

  syncCmd
    .command('status')
    .description('Show sync status')
    .action(async () => {
      var text = await handleSync(container, { action: 'status' });
      console.log(text);
    });

  program
    .command('stash')
    .description('Move session or project to trash')
    .option('--session <id>', 'Session ID to stash')
    .option('--project', 'Stash entire project/workspace')
    .action(async (options: { session?: string; project?: boolean }) => {
      var text = await handleStash(container, {
        session_id: options.session,
        project: options.project,
      });
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
    .description('Restore session from trash')
    .argument('<id>', 'Session ID to restore')
    .action(async (id: string) => {
      var text = await handleRestore(container, { session_id: id });
      console.log(text);
    });

  await program.parseAsync(process.argv);
}

main().catch((error) => {
  console.error('Continuum CLI failed:', error);
  process.exit(1);
});
