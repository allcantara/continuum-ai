# Continuum

Persist and reuse work context across chats, projects, and tools.

Continuum is a local MCP server and CLI that saves cumulative session snapshots as markdown files, indexed by SQLite for fast search. It works with any MCP-compatible client (Cursor, Claude Code, etc.) and syncs across machines via optional git.

## Requirements

- Node.js >= 24.15 (for built-in `node:sqlite` with FTS5)
- Git (optional, for cross-machine sync)

## Installation

```bash
npm install -g continuum-ai
```

Or run from source:

```bash
git clone git@github.com:allcantara/continuum-ai.git
cd continuum-ai
npm install
npm run build
```

## MCP Configuration

After a global install, add to your MCP client config:

```json
{
  "mcpServers": {
    "continuum": {
      "command": "continuum-mcp"
    }
  }
}
```

For a local checkout, use `node` with the path to the built server:

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

## CLI Usage

```bash
continuum save [-m "summary"]     # save current session context
continuum load                    # load latest session
continuum recap [--last N]        # load last N sessions (default: 5)
continuum list [--query "search"] [--all-projects]
continuum sync enable <remote-url>
continuum sync status
continuum stash --session <id> | --project
continuum trash
continuum restore <id>
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
```

## License

MIT
