# Continuum — Documento de Design (v2)

> Planejamento arquitetural para evolução após a v1. Este documento **não descreve o que já está implementado** — para o estado atual, ver [DESIGN.md](./DESIGN.md).
>
> Objetivo: partir do modelo de retrato cumulativo manual (v1) e evoluir para captura mais fiel, semi-automática e reutilização de conhecimento entre projetos — sem quebrar os princípios da v1 (arquivos como fonte de verdade, índice derivado, núcleo desacoplado do transporte).

## 1. Motivação

A v1 resolve retomar trabalho via `continuum_save` + `continuum_load`, mas com limitações:

| Lacuna na v1 | Impacto |
|---|---|
| Sem mensagens individuais do chat | Perda de fidelidade quando a síntese do agente é incompleta |
| Captura 100% manual | Contexto perdido se o usuário não pede save antes de fechar |
| Sem vínculo chat ↔ sessão | Impossível auditar ou replayar a conversa que originou um snapshot |
| Blob markdown único | Busca e distill limitadas — tudo depende do FTS sobre texto livre |
| `knowledge/` não implementado | Decisões cross-project exigem busca manual em múltiplos projetos |

A v2 introduz **camadas de persistência** com políticas distintas de retenção, sync e destilação — mantendo `sessions/` como ponto central para retomar trabalho.

## 2. Princípios (herdados da v1 + novos)

### 2.1 Mantidos da v1

- **Arquivos markdown como fonte de verdade** — SQLite continua índice derivado, nunca autoridade.
- **Escrita atômica** (temp + rename) e lock de diretório para concorrência.
- **Núcleo desacoplado do transporte** — MCP stdio, CLI e (futuro) HTTP compartilham use cases.
- **Sync git opcional** em `$CONTINUUM_HOME`, independente dos repositórios dos projetos.
- **Avisos padronizados** (`Aviso:`) para sync, truncamento, escopo e segurança.
- **Ordenação de sessão por id** (timestamp no nome), nunca por `mtime`.

### 2.2 Novos na v2

- **Separação captura bruta / estado de trabalho / conhecimento** — cada camada com retenção e sync próprios.
- **Opt-in para captura automática** — nenhum dado de chat é gravado sem configuração explícita do usuário.
- **Scan de segredos antes de persistir** — estender `SecretScanner` a transcripts, não só snapshots.
- **Transcripts fora do sync por padrão** — dados brutos ficam locais; só destilações entram no git.
- **Compatibilidade retroativa** — sessões v1 sem `conversationId` continuam válidas; ingestão e hooks são aditivos.

## 3. Modelo em camadas

```text
Camada 1 — Transcript (captura bruta)
  Turnos do chat, metadados, tool calls opcionais
  Retenção: local por padrão; pruning após distill
  Sync git: desabilitado por padrão (.gitignore)

Camada 2 — Session (estado de trabalho) — já existe na v1, evolui
  Retrato cumulativo para retomar trabalho (continuum_load)
  Sync git: habilitado (comportamento atual)

Camada 3 — Knowledge (conhecimento reutilizável) — novo
  Decisões, padrões, ADRs curtos, independentes de uma sessão
  Sync git: habilitado
  Descoberta: continuum_list --all-projects --knowledge
```

### 3.1 Fluxo de dados

```text
Chat (Cursor / Claude Code / …)
        │
        ├─[manual] continuum_save ──────────────────► Session (.md)
        │
        ├─[hook sessionEnd] continuum_capture ──────► Transcript (.jsonl)
        │                                              │
        ├─[ingest] agent-transcripts/ (Cursor) ───────►│
        │                                              │
        │                              distill (job)   ▼
        │                                    Session (.md)
        │                                              │
        │                         extract-knowledge    ▼
        │                                    Knowledge (.md)
        │
        └─ index.sqlite (derivado, FTS5 unificado)
```

## 4. Armazenamento v2

### 4.1 Estrutura de diretórios (extensão da v1)

```text
$CONTINUUM_HOME/
├── index.sqlite                    # índice derivado — NUNCA fonte de verdade
├── projects/<slug>-<hash>/
│   ├── meta.md
│   ├── sessions/                   # Camada 2 (v1, evolui)
│   │   └── 2026-08-11-0915.md
│   └── transcripts/                # Camada 1 (novo) — local por padrão
│       └── 2026-08-11-0915-<conv-id>.jsonl
├── workspaces/<slug>-<hash>/
│   ├── meta.md
│   ├── sessions/
│   └── transcripts/
├── knowledge/                      # Camada 3 (novo) — cross-project
│   ├── auth-patterns.md
│   └── auth-decisions.md
├── .trash/                         # estendido para transcripts e knowledge
└── .gitignore                      # transcripts/ ignorado por padrão
```

### 4.2 Formato — Transcript (`.jsonl`)

Um arquivo por conversa. Cada linha é um objeto JSON:

```json
{
  "seq": 1,
  "role": "user",
  "content": "...",
  "timestamp": "2026-08-11T09:15:00.000Z",
  "toolCalls": []
}
```

Metadados no primeiro registro (tipo `meta`):

```json
{
  "type": "meta",
  "conversationId": "uuid ou id do cliente",
  "source": "cursor",
  "scopeHash": "...",
  "startedAt": "2026-08-11T09:15:00.000Z",
  "linkedSessionId": null
}
```

- **Fonte de verdade**: arquivo `.jsonl` no disco.
- **Índice**: SQLite guarda `conversation_id`, `scope_hash`, `started_at`, `message_count`, `status` — não duplica conteúdo na tabela principal; FTS opcional em `transcripts_fts` para busca local.

### 4.3 Formato — Session (evolução do v1)

Mantém o formato atual com extensões opcionais no marcador HTML:

```markdown
<!-- continuum:summary: Resumo curto -->
<!-- continuum:conversation: 2026-08-11-0915-abc123 -->
## Objetivo
## Decisões
## Estado atual
## Próximos passos
## Arquivos tocados
```

- Campos novos são **opcionais** — parsers v1 ignoram linhas desconhecidas.
- Template estruturado (seções fixas) é recomendado mas não obrigatório na v2.0; pode virar validação em v2.1.

### 4.4 Formato — Knowledge (`.md`)

```markdown
<!-- continuum:knowledge:slug: auth-patterns -->
<!-- continuum:summary: Padrões de autenticação adotados -->
<!-- continuum:origin-scope: projects/example-app-abc123 -->
## Contexto
## Decisão
## Quando aplicar
## Quando não aplicar
```

- Slug único global em `knowledge/`.
- `origin-scope` opcional — rastreia de qual projeto a decisão veio.

### 4.5 Índice SQLite (extensão)

Novas tabelas (índice derivado, reconstruível):

| Tabela | Campos principais |
|---|---|
| `conversations` | `id`, `scope_hash`, `source`, `started_at`, `message_count`, `status` |
| `transcripts_fts` | FTS5 sobre conteúdo (opcional, só se FTS disponível) |
| `knowledge` | `slug`, `summary`, `origin_scope_hash`, `created_at`, `status` |
| `sessions` (alter) | adicionar `conversation_id` nullable |

Reconciliação estendida: `IndexReconciliationService` varre `transcripts/` e `knowledge/` além de `sessions/`.

## 5. Domínio (novos agregados e ports)

### 5.1 Novos agregados

```text
domain/conversation/
  Conversation.ts       # id, scope, source, startedAt, linkedSessionId?
  Message.ts            # role, content, timestamp, toolCalls?
  ConversationId.ts

domain/knowledge/
  KnowledgeEntry.ts     # slug, summary, content, originScope?
  KnowledgeSlug.ts

domain/session/
  Session.ts            # + conversationId? (opcional)
```

### 5.2 Novas ports

```text
domain/ports/
  TranscriptStore.ts    # save, load, list por scope
  KnowledgeStore.ts     # save, load, list global
```

Implementações em `infrastructure/`:

```text
infrastructure/
  cursor/
    CursorTranscriptAdapter.ts   # lê ~/.cursor/.../agent-transcripts/*.jsonl
  persistence/filesystem/
    FileSystemTranscriptStore.ts
    FileSystemKnowledgeStore.ts
  hooks/
    HookRunner.ts                # invoca continuum capture em eventos do cliente
```

### 5.3 Novos use cases

| Use case | Responsabilidade |
|---|---|
| `CaptureConversationUseCase` | Grava transcript bruto; scan de segredos; atualiza índice |
| `IngestTranscriptUseCase` | Importa JSONL externo (Cursor agent-transcripts) → `transcripts/` |
| `DistillToSessionUseCase` | Transcript(s) → novo snapshot Session |
| `ExtractKnowledgeUseCase` | Session(s) → entrada em `knowledge/` |
| `MaintainUseCase` | Orquestra prune, consolidate, reindex |

## 6. Ferramentas MCP e CLI (v2)

### 6.1 Ferramentas novas

| Ferramenta | Função | Observações |
|---|---|---|
| `continuum_capture` | Grava transcript da conversa atual ou importada | Opt-in; requer `roots` ou escopo em cache |
| `continuum_distill` | Gera Session a partir de transcript(s) | Pode usar agente externo ou template heurístico |
| `continuum_knowledge_save` | Cria/atualiza entrada em `knowledge/` | Slug global |
| `continuum_knowledge_list` | Lista/busca conhecimento cross-project | FTS5 em `knowledge/` |
| `continuum_maintain` | Jobs: prune, consolidate, reindex | CLI-first; MCP opcional |

### 6.2 Evolução das ferramentas v1

| Ferramenta | Mudança v2 |
|---|---|
| `continuum_save` | Aceita `conversationId` opcional; sugere template estruturado |
| `continuum_load` | Pode incluir link ao transcript vinculado (metadado, não conteúdo) |
| `continuum_list` | Filtros `--transcripts`, `--knowledge`, `--all-projects` unificado |
| `continuum_recap` | Opção de incluir knowledge entries relacionadas ao escopo |

### 6.2 CLI equivalente (extensão)

```bash
continuum capture [--auto]              # grava transcript (hook ou manual)
continuum ingest-transcript <path>      # importa JSONL externo
continuum distill [--conversation <id>] # transcript → session
continuum knowledge save <slug> [-m "..."]
continuum knowledge list [--query "..."]
continuum maintain prune-transcripts [--older-than 30d]
continuum maintain consolidate [--last N]
continuum maintain reindex
```

## 7. Captura automática (hooks)

### 7.1 Cursor

Configuração em hooks do projeto ou global:

```json
{
  "hooks": {
    "sessionEnd": [
      { "command": "continuum capture --auto" }
    ]
  }
}
```

- `--auto` usa escopo em cache do processo MCP ou `CONTINUUM_LAST_SCOPE`.
- Falha silenciosa com log local — nunca bloqueia fechamento do chat.
- Requer `continuum capture.enabled=true` em config (opt-in global).

### 7.2 Ingestão read-only (alternativa sem hook)

`continuum ingest-transcript` lê arquivos em:

```text
~/.cursor/projects/<workspace>/agent-transcripts/*.jsonl
```

- Cursor-first na v2.0; adapters para outros clientes em v2.x.
- Não depende de hook — útil quando `sessionEnd` não dispara.

### 7.3 Política de retenção

| Camada | Padrão | Configurável |
|---|---|---|
| Transcript | Manter 30 dias após distill | `CONTINUUM_TRANSCRIPT_RETENTION_DAYS` |
| Session | Indefinido (como v1) | — |
| Knowledge | Indefinido | — |

`continuum maintain prune-transcripts` remove JSONL antigos **somente** se existir Session vinculada ou flag `--force`.

## 8. Sincronização git (v2)

| Caminho | Sync padrão | Motivo |
|---|---|---|
| `projects/*/sessions/` | Sim | Retomar trabalho cross-machine |
| `knowledge/` | Sim | Reuso cross-project |
| `projects/*/transcripts/` | **Não** | Volume, privacidade, dados sensíveis |
| `index.sqlite` | Não (como v1) | Derivado |

`continuum_sync enable` atualiza `.gitignore` para incluir `**/transcripts/` quando sync é habilitado.

Usuário pode optar por sync de transcripts com aviso explícito de risco:

```bash
continuum sync enable --include-transcripts   # exige confirmação interativa
```

## 9. Segurança e privacidade

1. **SecretScanner** roda em `capture`, `ingest` e `save` — bloqueia ou avisa antes de gravar.
2. **Captura automática** desabilitada por padrão; habilitar exige config explícita.
3. **Transcripts fora do sync** por padrão.
4. **Redaction opcional** (`CONTINUUM_REDACT_PATTERNS`) — CPF, tokens, emails em transcript antes de persistir.
5. **Audit log local** (`~/.continuum/audit.log`) — quem capturou, quando, qual escopo (sem conteúdo).

## 10. Fases de implementação

### Fase 1 — Fundação (v2.0)

**Objetivo:** domínio e ingestão read-only, sem mudar fluxo manual do usuário.

- [ ] Agregados `Conversation`, `Message`, ports `TranscriptStore`
- [ ] `Session.conversationId` opcional
- [ ] `FileSystemTranscriptStore` + tabelas SQLite
- [ ] `IngestTranscriptUseCase` + `CursorTranscriptAdapter`
- [ ] CLI `continuum ingest-transcript`
- [ ] `continuum_list` mostra "tem transcript vinculado"
- [ ] Testes de reconciliação estendida

**Critério de aceite:** importar um `agent-transcripts/*.jsonl` e listar por escopo sem quebrar sessões v1.

### Fase 2 — Captura semi-automática (v2.1)

- [ ] `CaptureConversationUseCase` + `continuum_capture`
- [ ] Hook Cursor `sessionEnd` + config opt-in
- [ ] SecretScanner em capture
- [ ] `.gitignore` transcripts por padrão

**Critério de aceite:** fechar chat com hook ativo grava JSONL local; sync não inclui transcripts.

### Fase 3 — Distillation (v2.2)

- [ ] `DistillToSessionUseCase` + `continuum_distill`
- [ ] Template estruturado recomendado no snapshot
- [ ] `continuum_maintain consolidate` e `prune-transcripts`

**Critério de aceite:** transcript importado → distill → `continuum_load` retoma trabalho.

### Fase 4 — Knowledge layer (v2.3)

- [ ] `KnowledgeEntry`, `KnowledgeStore`, `knowledge/`
- [ ] `continuum_knowledge_save` / `continuum_knowledge_list`
- [ ] `ExtractKnowledgeUseCase` (manual ou via maintain)
- [ ] FTS unificado sessions + knowledge em `continuum_list --all-projects`

**Critério de aceite:** decisão salva em knowledge aparece em busca cross-project.

### Fase 5 — Polish (v2.4+)

- [ ] Redaction configurável
- [ ] Adapters para Claude Code transcripts (se path documentado)
- [ ] `continuum_maintain reindex` unificado
- [ ] Documentação e slash commands Cursor para novas tools

## 11. Fora do escopo da v2

Mantidos no roadmap de longo prazo (ver DESIGN.md seção 9):

- Modo remoto HTTP (`continuum serve --http`) — núcleo já desacoplado; implementação posterior. Distinto de `continuum ui` (inspeção local já na v1).
- Embeddings / busca semântica.
- Backups binários dedicados.
- Expiração automática da lixeira (agendador SO).
- Migração do núcleo para Rust (ai-memory).

A inspeção local (`continuum ui`) já existe na v1: projetos → sessões → `.md` somente leitura, stash/lixeira/restore, índice SQLite como vitrine.

## 11.1 UI — edição de sessão (decidir antes de implementar)

A v1 **não** edita o arquivo `.md`. Cada `save` da CLI/MCP continua criando um arquivo novo. Na v2 da UI, escolher **uma** destas opções:

| Opção | Efeito |
|---|---|
| Sobrescrever aquele arquivo | Correção pontual; o id permanece; o índice é atualizado |
| Sempre criar sessão nova | Preserva o histórico; a lista cresce a cada edição |
| Os dois | “Salvar” sobrescreve; “Salvar como nova” cria outro arquivo |

Regras que qualquer opção deve respeitar:

- Markdown continua sendo a fonte da verdade; o SQLite só é atualizado depois do arquivo (via `upsert` / reconcile). Não editar linhas do índice direto.
- O `save` da CLI e do MCP não muda: continua imutável (arquivo novo).
- Sem exclusão permanente nesta fatia — stash/lixeira já cobrem a UI.

## 12. Decisões em aberto (resolver antes de Fase 1)

| # | Decisão | Opções | Recomendação |
|---|---|---|---|
| 1 | Fidelidade do transcript | Completo vs. últimos N turnos | Completo local; prune após distill |
| 2 | Sync de transcripts | Nunca / opt-in explícito | Opt-in com aviso (seção 8) |
| 3 | Cliente prioritário | Cursor-only vs. multi-cliente | Cursor-first; adapter pattern |
| 4 | Distill automático | Job local vs. agente no save | Job local (`maintain`); agente opcional em `distill` |
| 5 | ID de conversa | UUID vs. timestamp+hash | UUID do cliente quando disponível; fallback timestamp-scope |
| 6 | Edição de sessão na UI | Sobrescrever / nova / os dois | Em aberto — ver seção 11.1 |

## 13. Compatibilidade com v1

- Sessões existentes em `sessions/` permanecem válidas sem `conversationId`.
- Ferramentas v1 (`save`, `load`, `recap`, `list`, `sync`, `stash`, `trash`, `restore`) mantêm comportamento; extensões são aditivas.
- `index.sqlite` v1 é migrado com `ALTER TABLE` ou rebuild na primeira boot v2.
- CLI v1 continua funcionando; subcomandos novos são adicionais.

## 14. Referências

- [DESIGN.md](./DESIGN.md) — v1, fonte da verdade do estado atual
- Comparativo ai-memory (Rust): hooks, fila mpsc, jobs de manutenção — ideias incorporadas nas Fases 2–3
- Cursor agent-transcripts: `~/.cursor/projects/<workspace>/agent-transcripts/*.jsonl`
- Cursor hooks: `sessionEnd` para captura ao fechar chat
