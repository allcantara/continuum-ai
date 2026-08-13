# Continuum

Persist and reuse work context across chats, projects, and tools.

Continuum is a local MCP server and CLI that saves cumulative session snapshots as markdown files, indexed by SQLite for fast search. It works with any MCP-compatible client (Cursor, Claude Code, etc.) and syncs across machines via optional git.

> **Development status:** Continuum is in active development (v0.1.x). APIs, CLI commands, and Cursor integration may change between releases. Pin a version in production workflows and review [GitHub Releases](https://github.com/allcantara/continuum-ai/releases) before updating.

**npm:** [`continuum-ai`](https://www.npmjs.com/package/continuum-ai)

Architecture and design decisions: [DESIGN.md](./DESIGN.md)

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

Natural-language prompts, terminal examples, and use cases: **Using Continuum via MCP**, **CLI usage**, and **Use cases**.

Verify the CLI:

```bash
continuum --help    # use --help (two hyphens), not -help
continuum --version # matches the installed npm package version
```

## Cursor: project scope (`roots`)

In Cursor, MCP tools must receive the **absolute path of the open workspace** via the `roots` parameter. Cursor does not implement MCP `roots/list`, so Continuum cannot detect the open folder automatically.

| Situation | Where sessions are stored |
|-----------|---------------------------|
| `roots` passed (e.g. `/Users/you/dev/my-app`) | Under that project's folder |
| No `roots`, no prior scope in this MCP process | Shared **`sem-projeto`** bucket (all chats without a project) |
| No `roots`, but a previous call in the same chat already resolved scope | Reuses the last scope (with a warning) |

The installed slash commands (`/continuum-save`, etc.) instruct the agent to pass `roots`. When calling MCP tools directly, always include:

```json
{ "roots": ["/absolute/path/to/workspace"], "content": "..." }
```

The CLI does **not** need `roots` — it uses the terminal's current directory, which you control by `cd` into the project first.

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

Slash commands are **Cursor-only** (v1). Other IDEs can use the MCP tools directly (see **Using Continuum via MCP**).

## Using Continuum via MCP

The MCP server is not a long-running HTTP process and has no URL to configure. The client (Cursor, Claude Code, or any MCP-compatible IDE) starts `continuum-mcp` over stdio and talks to it through stdin/stdout.

MCP and CLI share the same files under `~/.continuum/`. You can save in chat and inspect the snapshot later with `continuum load` in the terminal (or the other way around).

In Cursor, use **Agent** chat. MCP tools do not run in Ask mode.

### Three ways to call it

| How | When to use it |
|-----|----------------|
| Slash command (`/continuum-save`, ...) | Cursor, after global install or `continuum setup cursor` |
| Natural language | Any MCP client — the agent maps your request to a tool |
| Direct tool call | The agent invokes `continuum_save` (and the others) with arguments |

In Cursor, pass `roots` with the absolute workspace path on every tool call. The installed slash commands already instruct the agent to do this. If `roots` is omitted, the session lands in the shared **`sem-projeto`** bucket instead of this project — see **Cursor: project scope**.

### What a good snapshot contains

Each `continuum_save` writes a **full picture** of the current work, not a delta of the last few messages. That is why `continuum_load` is enough to resume in a new chat: you do not need to replay older sessions unless you want history (`continuum_recap`).

Include:

- What you were doing and why
- Decisions already made (and the reason, when it is not obvious)
- Current state (done vs blocked)
- Next steps
- Relevant files or areas — not the full source

Do not put secrets (tokens, passwords, keys). Continuum warns on likely secrets but still writes the file.

### Example prompts

These work in any MCP client. In Cursor you can type the same ideas or use the matching `/continuum-*` command.

| You want to... | Say something like |
|----------------|--------------------|
| Close the day without losing context | "Save this session in Continuum before I close." |
| Start a new chat on the same project | "Load the last Continuum session for this project and continue from there." |
| Return to a project that sat idle | "Give me a recap of the last 10 Continuum sessions here." |
| Reuse a decision from another repo | "Search Continuum across all projects for SIAPE authentication." |
| Sync to another machine | "Enable Continuum git sync with `git@github.com:me/continuum-memory.git`." |
| Discard a test snapshot | "Stash the last Continuum session — it was only a test." |
| Undo a stash | "What is in the Continuum trash?" then "Restore session `<id>`." |

The agent should call the matching tool (`continuum_save`, `continuum_load`, ...) with `roots` set to the open workspace. Confirm the session id after a save, stash, or restore.

## CLI usage

The CLI talks to the same store as MCP. It does **not** need `roots`: it uses the terminal's current directory, which you control. Always `cd` into the project (or any folder you want to scope to) first.

```bash
cd ~/dev/my-app
continuum --help
```

### Save and resume

`continuum save` always opens `$EDITOR` (or `$VISUAL`, then `nano`) for the snapshot body. `-m` is only the short summary stored in the search index — not a substitute for the body.

```bash
continuum save -m "Chose JWT; next is refresh tokens"
continuum load                    # print the latest snapshot for this directory
continuum recap --last 10         # last 10 sessions (default: 5)
```

### Search

```bash
continuum list                    # sessions for the current project
continuum list -q "authentication"
continuum list --all-projects -q "SIAPE"
```

### Sync, stash, restore

```bash
continuum sync enable git@github.com:me/continuum-memory.git
continuum sync status

continuum stash --session 2026-08-11-0915
continuum stash --project         # entire project/workspace
continuum trash
continuum restore 2026-08-11-0915
```

### Command reference

```bash
continuum --help                # global help
continuum -h                    # short form
continuum help <command>        # help for a subcommand
continuum <command> --help      # same, per subcommand

continuum save [-m "summary"]     # save current session context (opens editor)
continuum load                    # load latest session
continuum recap [--last N]        # load last N sessions (default: 5)
continuum list [-q "search"] [--all-projects]
continuum sync enable <remote-url>
continuum sync status
continuum stash --session <id> | --project
continuum trash
continuum restore <id>
continuum restore --project
continuum setup cursor [--no-commands]
```

## Use cases

MCP and CLI are interchangeable for the same job. Prefer MCP when you want the agent to write or apply the snapshot inside the chat. Prefer the CLI when you want to inspect, search, or edit without opening a conversation.

| Situation | MCP | CLI |
|-----------|-----|-----|
| End of the day | "Save this session in Continuum." | `continuum save -m "..."` |
| New chat, same project | "Load the last session and continue." | `continuum load` |
| Project idle for months | "Recap the last 10 sessions." | `continuum recap --last 10` |
| "Did we already solve this elsewhere?" | "Search Continuum across all projects for ..." | `continuum list --all-projects -q "..."` |
| Second laptop | "Enable Continuum git sync with `<remote>`." | `continuum sync enable <remote>` |
| Accidental test snapshot | "Stash that last session." | `continuum stash --session <id>` |
| Undo a stash | "List Continuum trash, then restore `<id>`." | `continuum trash` then `continuum restore <id>` |

A typical loop:

1. Open a new chat (or a new terminal) in the project.
2. Load (`continuum_load` / `continuum load`) — or recap if you need more than the latest snapshot.
3. Do the work.
4. Save a full snapshot before you close the chat, switch tasks, or switch machines.
5. If git sync is enabled, save still writes locally first; push is best-effort and will not fail the save.

Sessions are markdown files under `~/.continuum/projects/.../sessions/`. You can open them in any editor.

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

Pass `roots` on every tool call when the client does not reliably expose the open workspace (see **Cursor: project scope**).

## Storage

Default location: `~/.continuum/` (override with `CONTINUUM_HOME`).

Markdown files under `sessions/` are the source of truth. `index.sqlite` is a derived search index, rebuilt automatically when out of sync.

```
~/.continuum/
├── index.sqlite                         # derived index (not source of truth)
├── sync.json                            # present when git sync is enabled
├── projects/<slug>-<hash>/
│   ├── meta.md                          # slug, hash, git remote or path, created date
│   └── sessions/
│       └── 2026-08-10-1430.md           # cumulative snapshot; never overwritten
├── workspaces/<slug>-<hash>/
│   ├── meta.md
│   └── sessions/
└── .trash/
    ├── projects/<hash>-<deleted-at>/...
    ├── workspaces/<hash>-<deleted-at>/...
    └── sessions/<scope-hash>/...
```

Legacy folders named only `<hash>` (without slug) are still supported — Continuum keeps using them instead of creating a duplicate.

Project identity prefers the normalized git remote URL; when no remote is available, it falls back to the absolute path and reuses a matching project already on disk (via `meta.md`).

The latest session for `continuum load` is chosen by **session id** (timestamp in the filename), not file modification time — so git checkout or sync does not return the wrong session.

## Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `CONTINUUM_HOME` | `~/.continuum` | Data directory |
| `CONTINUUM_MAX_LOAD_CHARS` | `40000` | Max characters returned by `continuum_load` |
| `CONTINUUM_MAX_RECAP_CHARS` | `60000` | Max total characters returned by `continuum_recap` |

## Tools (MCP)

All scope-aware tools accept optional `roots: string[]` (absolute workspace paths). See **Cursor: project scope** and **Using Continuum via MCP**.

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

Releases are published to npm automatically via GitHub Actions when `package.json` version changes on `master` (Trusted Publishing / OIDC — no long-lived npm token in the repo).

Configure the trusted publisher once at [continuum-ai package access](https://www.npmjs.com/package/continuum-ai/access):

- Organization or user: `allcantara`
- Repository: `continuum-ai`
- Workflow filename: `npm-publish.yml` (filename only, including `.yml`)
- Environment name: leave empty
- Allowed actions: `npm publish`

## License

MIT
