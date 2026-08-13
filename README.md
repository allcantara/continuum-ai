# Continuum

Persist and reuse work context across chats, projects, and tools.

Continuum is a **local** MCP server and CLI. It saves cumulative session snapshots as markdown files on this machine, indexed by SQLite for fast search. It works with any MCP-compatible client (Cursor, Claude Code, etc.). Sessions stay under `~/.continuum/` — there is no git remote, no `sync` command, and no sharing across machines.

> **Development status:** Continuum is in active development (v0.1.x). APIs, CLI commands, and Cursor integration may change between releases. Pin a version in production workflows and review [GitHub Releases](https://github.com/allcantara/continuum-ai/releases) before updating.

**npm:** [`continuum-ai`](https://www.npmjs.com/package/continuum-ai)

Architecture and design decisions: [DESIGN.md](./DESIGN.md)

## Requirements

- Node.js >= 24.15 (for built-in `node:sqlite` with FTS5)
- Git (optional): used only to ignore `.continuum.local.json` in this clone (`.git/info/exclude`). The marker file is created on first save even when the folder is not a git repository.
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

In Cursor, MCP tools must receive the **absolute path of the folder this chat is in** via the `roots` parameter — a git project, a random folder, or the user home directory. Git is not required. Cursor does not implement MCP `roots/list`, so Continuum cannot detect the folder automatically.

| Situation | Where sessions are stored |
|-----------|---------------------------|
| `roots` passed (e.g. `/Users/you/dev/my-app` or `/Users/you`) | Under that folder, keyed by `.continuum.local.json` |
| No `roots`, no prior scope in this MCP process | Shared **`sem-projeto`** bucket (only when no folder path is known) |
| No `roots`, but a previous call in the same chat already resolved scope | Reuses the last scope (with a warning) |

The installed slash commands (`/continuum-save`, etc.) instruct the agent to pass `roots`. When calling MCP tools directly, always include:

```json
{ "roots": ["/absolute/path/to/workspace"], "content": "..." }
```

The CLI does **not** need `roots` — it uses the terminal's current directory, which you control by `cd` into the project first.

## How Continuum identifies a project

Continuum does **not** infer identity from git remotes, `package.json`, or `pom.xml`.

On the first **save** in a folder, it creates `.continuum.local.json` in that folder. If the folder is inside a git repository, the file is created at the git root instead. Git is not required — a random folder or your home directory works the same way. The file looks like:

```json
{
  "id": "a3f1c8e2-9b44-4d1a-8f0e-2c7b91d4e5aa",
  "folderName": "my-app"
}
```

- `id` is a UUID generated once. It is the project identity for every scoped operation.
- `folderName` is the directory name, used only as a readable label in lists and on disk (`~/.continuum/projects/<folderName>-<id>/`).

If the folder is a git repository, Continuum also appends `.continuum.local.json` to `.git/info/exclude` (local to this clone, not committed). Git will not list or commit the file.

Without git, Continuum does **not** walk into parent folders. The marker stays in the folder you saved from.

These tools look for that file starting from the open folder up to the git root:

| Tool | Needs the file | Creates it |
|------|----------------|------------|
| `save` | No — creates it on first save | Yes |
| `list`, `load`, `recap`, `stash`, `restore` | Yes | No |
| `trash` | No — lists every trashed item on this machine | No |

If the file is missing, Continuum answers: *No Continuum project file (`.continuum.local.json`) in this folder. Save a session first to start tracking it.*

A copy of the project **without** the file is treated as a new project. Copy the file along with the folder if you want the same identity on this machine.

Sessions never leave this computer. There is no remote sync.

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

If you previously installed Continuum with git sync, you can delete the leftover slash commands `~/.cursor/commands/continuum-sync-status.md` and `continuum-sync-enable.md`. They are no longer installed.

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
| `/continuum-save` | `continuum_save` | Save session snapshot (creates `.continuum.local.json` if needed) |
| `/continuum-load` | `continuum_load` | Load latest session |
| `/continuum-recap` | `continuum_recap` | Load recent session history |
| `/continuum-list` | `continuum_list` | Search/list sessions |
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

In Cursor, pass `roots` with the absolute path of the folder this chat is in on every tool call (git project, random folder, or user home). The installed slash commands already instruct the agent to do this. If `roots` is omitted because no path is known, the session lands in the shared **`sem-projeto`** bucket — see **Cursor: project scope**.

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
| Reuse a decision from another repo | "Search Continuum across all projects for JWT authentication patterns." |
| Discard a test snapshot | "Stash the last Continuum session — it was only a test." |
| Undo a stash | "What is in the Continuum trash?" then "Restore session `<id>`." |

The agent should call the matching tool (`continuum_save`, `continuum_load`, ...) with `roots` set to the folder this chat is in (including the user home). Confirm the session id after a save, stash, or restore.

## CLI usage

The CLI talks to the same store as MCP. It does **not** need `roots`: it uses the terminal's current directory, which you control. Always `cd` into the project (or any folder you want to scope to) first.

```bash
cd ~/dev/my-app
continuum --help
```

### Save and resume

`continuum save` always opens `$EDITOR` (or `$VISUAL`, then `nano`) for the snapshot body. `-m` is only the short summary stored in the search index — not a substitute for the body.

The first save in a folder creates `.continuum.local.json`. Later `load`, `recap`, `list`, `stash`, and `restore` reuse that file.

```bash
continuum save -m "Chose JWT; next is refresh tokens"
continuum load                    # print the latest snapshot for this directory
continuum recap --last 10         # last 10 sessions (default: 5)
```

### Search

```bash
continuum list                    # sessions for the current project
continuum list -q "authentication"
continuum list --all-projects -q "authentication"
```

### Stash and restore

```bash
continuum stash --session 2026-08-11-0915
continuum stash --project         # entire project/workspace
continuum trash                   # all trashed items on this machine
continuum restore 2026-08-11-0915
continuum ui                      # local inspect UI at http://127.0.0.1:3847
```

### Inspect in the browser

`continuum ui` starts a local HTTP server on `127.0.0.1` (not the future remote MCP server). It prints the URL. Open it in a browser, then press Ctrl+C in the terminal to stop. Closing the tab does not stop the process. The page loads Bootstrap 5 from a CDN, so styling needs an internet connection.

```bash
continuum ui
continuum ui --port 4000
continuum ui --open               # also open the default browser
```

The UI lists projects, sessions, and the full `.md` snapshot (read-only). You can stash a session or project, browse trash, restore, and inspect the derived SQLite index. Editing a session file is not available yet (planned for v2).

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
continuum stash --session <id> | --project
continuum trash
continuum restore <id>
continuum restore --project
continuum ui [--port N] [--open]
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
| Accidental test snapshot | "Stash that last session." | `continuum stash --session <id>` |
| Undo a stash | "List Continuum trash, then restore `<id>`." | `continuum trash` then `continuum restore <id>` |
| Browse saved sessions | — | `continuum ui` |

A typical loop:

1. Open a new chat (or a new terminal) in the project.
2. Load (`continuum_load` / `continuum load`) — or recap if you need more than the latest snapshot.
3. Do the work.
4. Save a full snapshot before you close the chat or switch tasks.

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

Pass `roots` on every tool call when the client does not reliably expose the folder this chat is in (see **Cursor: project scope**).

## Storage

Default location: `~/.continuum/` (override with `CONTINUUM_HOME`). Everything stays on this machine.

Markdown files under `sessions/` are the source of truth. `index.sqlite` is a derived search index, rebuilt automatically when it diverges from the files.

Project identity lives in `.continuum.local.json` inside the working folder (see **How Continuum identifies a project**). That file is **not** stored under `~/.continuum/`.

```
~/.continuum/
├── index.sqlite                         # derived index (not source of truth)
├── projects/<folderName>-<uuid>/
│   ├── meta.md                          # slug, uuid, source path, created date
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

Legacy folders named with a 16-character hash (from older versions that used git remotes or paths) are still readable. New saves use the UUID from `.continuum.local.json`.

The latest session for `continuum load` is chosen by **session id** (timestamp in the filename), not file modification time.

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
| `continuum_save` | Save cumulative session snapshot; creates `.continuum.local.json` on first save |
| `continuum_load` | Load latest session for this project |
| `continuum_recap` | Load last N sessions |
| `continuum_list` | Search/list sessions via index |
| `continuum_stash` | Move session or project to trash |
| `continuum_trash` | List trashed items (all projects on this machine) |
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
