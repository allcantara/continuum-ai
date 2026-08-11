# Continuum

Persist and reuse work context across chats, projects, and tools.

Continuum is a local MCP server and CLI that saves cumulative session snapshots as markdown files, indexed by SQLite for fast search. It works with any MCP-compatible client (Cursor, Claude Code, etc.) and syncs across machines via optional git.

> **Development status:** Continuum is in active development (v0.1.x). APIs, CLI commands, and Cursor integration may change between releases. Pin a version in production workflows and check the changelog before updating.

**npm:** [`continuum-ai`](https://www.npmjs.com/package/continuum-ai)

## Requirements

- Node.js >= 24.15 (for built-in `node:sqlite` with FTS5)
- Git (optional, for cross-machine sync)
- [Cursor](https://cursor.com) (optional, for automatic IDE setup)

## Quick start (Cursor)

```bash
npm install -g continuum-ai
```

This global install automatically:

1. Registers the `continuum` MCP server in `~/.cursor/mcp.json`
2. Installs slash commands in `~/.cursor/commands/` (one per MCP tool — see table below)

Then in Cursor:

1. Open **Agent** chat (MCP tools do not run in Ask mode)
2. **Settings → MCP → Reload** on the `continuum` server
3. Type `/continuum-save` (or any `/continuum-*` command) to use Continuum

Verify the CLI:

```bash
continuum --help    # use --help (two hyphens), not -help
continuum --version
```

## Installation

```bash
npm install -g continuum-ai
```

### Manual / repair setup (Cursor)

Re-run or repair Cursor integration at any time:

```bash
continuum setup cursor
continuum setup cursor --no-commands   # MCP only, skip slash commands
```

Managed files (`continuum-ai-managed: true`) are updated on re-run. Custom command files without that marker are never overwritten.

### From source

```bash
git clone git@github.com:allcantara/continuum-ai.git
cd continuum-ai
npm install
npm run build
continuum setup cursor   # optional: configure local Cursor integration
```

## Updating

```bash
npm update -g continuum-ai
continuum --version
```

`npm update -g` re-runs the Cursor setup hook: refreshes `~/.cursor/mcp.json` and updates managed slash commands. Reload MCP in Cursor after updating (**Settings → MCP → Reload** on `continuum`).

## Cursor slash commands

After global install or `continuum setup cursor`, type `/` in **Agent** chat:

| Command | MCP tool | Action |
|---------|----------|--------|
| `/continuum-save` | `continuum_save` | Save session snapshot |
| `/continuum-load` | `continuum_load` | Load latest session |
| `/continuum-recap` | `continuum_recap` | Load recent session history |
| `/continuum-list` | `continuum_list` | Search/list sessions |
| `/continuum-sync-status` | `continuum_sync` | Show git sync status |
| `/continuum-sync-enable` | `continuum_sync` | Enable git sync (needs remote URL) |
| `/continuum-stash` | `continuum_stash` | Move session or project to trash |
| `/continuum-trash` | `continuum_trash` | List trashed items |
| `/continuum-restore` | `continuum_restore` | Restore session from trash |

Slash commands are **Cursor-only** (v1). Other IDEs can use the MCP tools directly.

## CLI usage

```bash
continuum --help                # global help
continuum -h                    # short form
continuum help <command>        # help for a subcommand
continuum <command> --help      # same, per subcommand

continuum save [-m "summary"]     # save current session context
continuum load                    # load latest session
continuum recap [--last N]        # load last N sessions (default: 5)
continuum list [--query "search"] [--all-projects]
continuum sync enable <remote-url>
continuum sync status
continuum stash --session <id> | --project
continuum trash
continuum restore <id>
continuum setup cursor [--no-commands]
```

## MCP configuration (other clients)

Cursor is configured automatically on global install (see **Quick start**). For other MCP clients:

```json
{
  "mcpServers": {
    "continuum": {
      "command": "continuum-mcp"
    }
  }
}
```

For a local checkout without global install:

```json
{
  "mcpServers": {
    "continuum": {
      "command": "node",
      "args": ["/path/to/continuum-ai/dist/presentation/mcp/server.js"]
    }
  }
}
```

## Storage

Default location: `~/.continuum/` (override with `CONTINUUM_HOME`).

```
~/.continuum/
├── index.sqlite
├── projects/<hash>/sessions/*.md
├── workspaces/<hash>/sessions/*.md
└── .trash/
```

## Tools (MCP)

| Tool | Description |
|------|-------------|
| `continuum_save` | Save cumulative session snapshot |
| `continuum_load` | Load latest session |
| `continuum_recap` | Load last N sessions |
| `continuum_list` | Search/list sessions via index |
| `continuum_sync` | Enable/configure git sync |
| `continuum_stash` | Move session or project to trash |
| `continuum_trash` | List trashed items |
| `continuum_restore` | Restore from trash |

## Development

```bash
npm install
npm test
npm run build
npm run cli -- load
continuum setup cursor   # test Cursor integration locally
```

## License

MIT
