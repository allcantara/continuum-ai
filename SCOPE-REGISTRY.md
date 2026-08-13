# Continuum — Registro de escopos (Scope Registry)

> Complementa [DESIGN.md](./DESIGN.md). Resolve o descompasso entre MCP e CLI ao resolver o mesmo projeto com hashes diferentes.

## Problema

MCP e CLI usam o mesmo `ScopeResolutionService`, mas com **entradas diferentes**:

| Origem | Entrada típica | Risco |
|---|---|---|
| MCP | `roots` = raiz do workspace (agente) | Cache de processo pode mascarar escopo errado |
| CLI | `process.cwd()` — pode ser subpasta do repo | Hash diferente se o fallback é por caminho |

Quando o remoto git não é legível, o hash vem do **caminho literal**. `/repo` e `/repo/packages/api` produzem hashes distintos — o CLI não encontra sessões salvas pelo MCP.

## Solução

Tabela derivada no mesmo `index.sqlite` (reconstruível, como `sessions`):

```sql
CREATE TABLE scopes (
  scope_id   TEXT PRIMARY KEY,    -- UUID estável
  scope_hash TEXT NOT NULL UNIQUE, -- hash usado em disco (compat v1)
  scope_type TEXT NOT NULL,        -- project | workspace
  slug       TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE scope_aliases (
  alias      TEXT PRIMARY KEY,    -- remoto normalizado ou caminho absoluto
  scope_id   TEXT NOT NULL,
  alias_kind TEXT NOT NULL DEFAULT 'path'  -- remote | git_root | path
);
```

### Fluxo de resolução

1. Normalizar entrada: subir até a **raiz git** (`findGitRoot`).
2. Resolver identidade (remoto git ou hash do caminho na raiz).
3. Montar **aliases** (remoto, git root, cwd e ancestrais do caminho).
4. Consultar `scope_aliases` → obter `scope_hash` canônico.
5. Se não encontrar: `findByPathHint` (disco) como fallback v1.
6. Registrar aliases no registry (enriquece consultas futuras).

### Por que UUID + scope_hash?

- **`scope_hash`** mantém compatibilidade com pastas `projects/<slug>-<hash>/` e tabela `sessions`.
- **`scope_id` (UUID)** é a chave estável interna para aliases e evoluções futuras (v2 transcripts, knowledge).
- Não exige renomear diretórios existentes.

## Complementos implementados

1. **`GitRootResolver`** — sobe diretórios até encontrar `.git` (como `git` faz).
2. **`GitRemoteReader`** — resolve identidade na raiz do repo, não no cwd bruto.
3. **`ScopeRegistryBootstrap`** — na primeira execução, importa escopos de sessões já salvas.

## Prioridade na busca por alias

Quando vários aliases casam, preferência: `remote` > `git_root` > `path`.

## Limitações conhecidas

- Workspace multi-root: registry foca em projeto; workspace continua por hash composto.
- Alias collision (dois projetos, mesmo caminho em máquinas diferentes): primeiro registrado vence; sync git pode expor isso — documentar.
- Registry é derivado: bootstrap + `persistAliases` na resolução reconstruem estado; fonte de verdade continua sendo `meta.md` + estrutura de pastas.

## Evolução (v2)

- `sessions.conversation_id` ligado a `scopes.scope_id` (ver [DESIGN-v2.md](./DESIGN-v2.md)).
- `continuum scope link` para associar manualmente aliases conflitantes.
