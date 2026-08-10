# Continuum — Documento de Design (v1)

> Este documento consolida todas as decisões de arquitetura tomadas antes de iniciar a implementação. Serve como fonte da verdade para o início do desenvolvimento, independente do histórico da conversa que o originou.

## 1. Objetivo

Persistir e reaproveitar o contexto de trabalho entre:
- Chats diferentes do **mesmo projeto** (retomar exatamente de onde parou).
- **Projetos diferentes** (reaproveitar decisões/conhecimento).
- **Ferramentas diferentes** (Cursor, Claude Code, ou qualquer cliente MCP), já que o armazenamento e o servidor são independentes de qualquer IDE específica.
- **Máquinas diferentes** (via sincronização git opcional).

## 2. Nome e identidade

- **Nome do produto**: Continuum
- **Pasta de armazenamento padrão**: `~/.continuum/`, configurável via variável de ambiente `CONTINUUM_HOME`
- **Padrão de nomenclatura das ferramentas**: `continuum_<verbo>` (prefixo mantido deliberadamente, mesmo sabendo que o cliente MCP já namespacia por servidor — decisão do usuário por clareza)

## 3. Mecanismo

- Servidor MCP local em **Node.js/TypeScript**.
- Transporte `stdio` na v1. Núcleo (hash, storage, git, índice) **desacoplado do transporte**, para permitir evoluir para modo remoto/HTTP hospedado no futuro sem reescrever a lógica.
- **CLI própria**, reaproveitando o mesmo núcleo (casca fina de parsing de argumentos por cima das mesmas funções que o servidor MCP chama). Incluída já na v1.
- Sem Agent Skill separada — as descrições das próprias ferramentas MCP orientam o agente sobre quando/como usá-las. Acionamento sempre manual (pedido explícito em linguagem natural ou comando de CLI), sem captura automática via hooks na v1.

### 3.1 Como o uso funciona na prática

**Na v1 (stdio) não existe servidor escutando em `localhost:porta`.** Não há processo contínuo para "apontar":

- **Via MCP**: o cliente (Cursor, Claude Code) é configurado com um **comando** a executar (ex.: `node /caminho/continuum/dist/server.js`), não uma URL. O próprio cliente sobe esse processo quando precisa e conversa com ele por `stdin`/`stdout` (pipes diretos entre processos, sem rede). Ao fechar o chat/IDE, o processo termina.
- **Via CLI**: o comando `continuum` executa a lógica diretamente (lê/escreve arquivos e o SQLite no processo do próprio comando) e termina — não conversa com nenhum servidor.
- **Cross-machine na v1**: não é "apontar para um servidor", é manter **cópias locais sincronizadas** via git (seção 6) — cada máquina roda tudo localmente e sincroniza os arquivos.

**No modo remoto (roadmap, seção 9)**, a lógica muda para o modelo que normalmente se espera de um "servidor":

- Um processo persistente sobe com `continuum serve --http --port 3000` (local, em casa, ou num VPS).
- O MCP passa a ser configurado com uma **URL** (`http://localhost:3000/mcp` para testar local, ou `https://meu-servidor.exemplo.com/mcp` remoto) em vez de um comando.
- A CLI também poderia apontar para essa URL via variável de ambiente (ex.: `CONTINUUM_SERVER_URL`), virando um cliente HTTP fino em vez de operar nos arquivos diretamente.
- Trocar entre local e remoto nesse modo é só mudar a URL — por isso o núcleo já foi desenhado desacoplado do transporte desde a v1.

| | v1 (agora) | v2+ (futuro, roadmap) |
|---|---|---|
| Como o MCP se conecta | Comando local, via stdio | URL (local ou remota), via HTTP |
| Como a CLI funciona | Executa tudo localmente, sozinha | Pode virar cliente HTTP, apontando para uma URL |
| Cross-machine | Via git sync (cópias sincronizadas) | Via servidor único compartilhado (sem sync, é a mesma fonte) |

## 4. Armazenamento

### 4.1 Estrutura de diretórios

```
$CONTINUUM_HOME/                    (padrão: ~/.continuum/)
├── index.sqlite                    # índice derivado — NUNCA é fonte de verdade
├── projects/<hash>/
│   ├── meta.md                     # nome legível, caminho/remoto, data de criação
│   └── sessions/
│       ├── 2026-08-10-1430.md      # nunca sobrescrito; cresce a cada save
│       └── 2026-08-11-0915.md
├── workspaces/<hash>/
│   ├── meta.md                     # lista os hashes de projeto que compõem o workspace
│   └── sessions/
└── .trash/
    ├── projects/<hash>-<timestamp-exclusao>/...
    └── sessions/<hash>/<timestamp>-<timestamp-exclusao>.md
```

### 4.2 Identidade (hash)

- **Projeto**: hash do remoto git normalizado (ignora diferença `ssh://` vs `https://`, sufixo `.git`), com fallback para o caminho absoluto se não houver remoto.
- **Workspace** (multi-root): hash pela **composição** dos hashes dos projetos que o formam, obtidos via a primitiva `roots` do protocolo MCP (o cliente expõe quais pastas estão abertas). Essa abordagem sobrevive a mover/renomear o arquivo `.code-workspace` e funciona mesmo em sessões "Untitled" ainda não salvas em disco.

### 4.3 Sessões são cumulativas, não incrementais

Cada `continuum_save` deve gravar um **retrato completo do estado atual** (o que estava sendo feito, decisões, estado atual, próximos passos, arquivos relevantes) — não apenas o delta da sessão de chat corrente. Isso garante que ler somente a sessão mais recente (`continuum_load`) seja suficiente para retomar o trabalho, sem precisar reconstruir uma cadeia de deltas.

O "estado atual" de um projeto/workspace **não é um arquivo físico separado** — é sempre a sessão com o timestamp mais recente dentro de `sessions/`.

### 4.4 Índice derivado (SQLite)

- Usa o módulo nativo **`node:sqlite`** (embutido no Node.js, sem dependência externa compilada) com **FTS5** para busca full-text.
- Requer Node.js recente (idealmente ≥24.15/25.7/26 para FTS5 garantido via release candidate). Ao iniciar, o servidor testa se FTS5 está disponível; se não estiver, cai automaticamente para busca simples por texto nos arquivos (sem quebrar funcionalidade, só perde o ranking mais esperto).
- **Nunca é fonte de verdade** — é reconstruível a qualquer momento varrendo os arquivos `.md` existentes. Se `index.sqlite` não existir ou estiver corrompido, o servidor reconstrói automaticamente, sem necessidade de ferramenta manual de reindexação.
- Guarda metadados enxutos por sessão: hash do projeto/workspace, timestamp, um resumo curto (1-2 linhas) extraído no momento do `save`, e um campo de **status** (`ativo` | `lixeira`) — usado tanto por `continuum_list` quanto por `continuum_trash`, sem precisar de dois caminhos de código diferentes.

### 4.5 Padrão de leitura (mantém as respostas enxutas)

- **`continuum_list` / `continuum_trash` / busca**: consultam **apenas o índice SQLite** — nunca abrem os arquivos `.md` inteiros. Respostas curtas mesmo com centenas de sessões.
- **`continuum_load` / `continuum_recap`**: leem o(s) arquivo(s) `.md` completo(s) — porque essa é a função deles (devolver o contexto de trabalho para retomar).

## 5. Ferramentas (8)

| Ferramenta | Função | Observações |
|---|---|---|
| `continuum_save` | Salva o contexto da sessão atual | Grava o `.md` (escrita atômica: temp + rename) e depois insere/atualiza a linha correspondente no índice. Resumo deve ser cumulativo (ver 4.3). |
| `continuum_load` | Carrega só a sessão mais recente | Lê o arquivo `.md` mais recente de `sessions/` do escopo atual (projeto ou workspace, resolvido automaticamente). |
| `continuum_recap` | Carrega as últimas N sessões (histórico mais profundo) | Padrão: **5 sessões**, configurável via parâmetro. Nome provisório — pode ser revisitado. |
| `continuum_list` | Lista/busca sessões | Consulta o índice SQLite (FTS5 quando disponível, fallback por texto simples). Pode buscar dentro de um projeto ou entre todos. |
| `continuum_sync` | Liga/desliga/configura sincronização via git | Ver seção 6. |
| `continuum_stash` | Move sessão específica ou projeto/workspace inteiro para a lixeira | Reversível: move o arquivo físico para `.trash/` e atualiza o status no índice para `lixeira` (não remove a linha). |
| `continuum_trash` | Lista o que está na lixeira | Consulta o índice filtrando `status = lixeira` — mesmo padrão enxuto do `list`. |
| `continuum_restore` | Restaura algo da lixeira, por hash/id | Move o arquivo de volta ao local original e atualiza o status para `ativo`. Fluxo esperado: primeiro `continuum_trash` para descobrir o id, depois `continuum_restore` com esse id. |

### 5.1 CLI equivalente

```bash
continuum save [-m "resumo"]        # sem -m, abre $EDITOR
continuum load
continuum recap [--last N]
continuum list [--query "busca"] [--all-projects]
continuum sync enable <remote-url>
continuum sync status
continuum stash --session <id> | --project
continuum trash
continuum restore <id>
```

## 6. Sincronização via git (opcional, configurável a qualquer momento)

- A pasta `$CONTINUUM_HOME` é seu **próprio repositório git**, independente dos repositórios dos projetos monitorados.
- `continuum_sync enable <remote-url>` liga a sincronização a qualquer momento (inicializa/clona conforme necessário).
- `continuum_save`: grava local primeiro (nunca falha por rede), depois tenta `commit` + `push` (best-effort — se falhar, avisa mas não bloqueia o save local).
- `continuum_load` / `continuum_list` / `continuum_trash`: fazem `pull` antes de ler, se sync estiver ligado.
- `continuum_stash`: sincroniza a movimentação para a lixeira automaticamente (para não "ressuscitar" o dado em outra máquina que ainda não sabe da exclusão).
- Usa as credenciais git já configuradas na máquina (SSH key / credential helper) — nada de credencial nova para gerenciar.

## 7. Lixeira

- `continuum_stash` move para `.trash/`, nunca apaga de verdade.
- **Sem expiração automática na v1** (removido do escopo — descartamos tanto o agendador do SO quanto a varredura preguiçosa de 30 dias por complexidade/preferência do usuário). Os itens ficam na lixeira indefinidamente até restauração ou remoção manual pelo próprio usuário no sistema de arquivos.
- Possível melhoria futura (não na v1): expiração automática configurável.

## 8. Robustez de implementação

1. **Escrita atômica**: grava em arquivo temporário e renomeia (operação atômica no sistema de arquivos) — protege contra corrupção mesmo com múltiplos processos `stdio` escrevendo ao mesmo tempo (cada cliente MCP pode spawnar seu próprio processo do servidor). Lock de arquivo simples para operações que tocam mais de um arquivo junto (ex.: sessão + índice).
2. **Camada de resolução de escopo separada**: uma função única, chamada por todas as ferramentas antes de qualquer leitura/escrita, responsável por decidir projeto vs. workspace e calcular o hash correspondente. Centraliza a lógica e já deixa pronto o ponto de entrada para autenticação, quando/se existir modo remoto.

## 9. Fora do escopo da v1 (roadmap)

- Camada `knowledge/` — conhecimento reaproveitável entre projetos, organizado por projeto de origem, com índice de descoberta cross-project.
- Captura automática via hooks de ciclo de vida (hoje é só manual).
- Modo remoto hospedado (HTTP) — arquitetura já preparada (núcleo desacoplado do transporte), implementação fica para depois.
- Expiração automática da lixeira (agendador do SO ou varredura preguiçosa).
- Backups binários dedicados, UI web navegável, jobs agendados de manutenção (consolidação, lint, embeddings).

## 10. Referência de comparação

Este design foi comparado com um projeto de referência mais robusto ("ai-memory", em Rust) que usa: hooks de captura automática, servidor único em Rust servindo stdio e HTTP, fila de escrita única (mpsc), camada dedicada de scope/auth/admission, SQLite como índice derivado de uma wiki markdown, jobs agendados de manutenção, e backups dedicados. As ideias de **índice derivado**, **escrita segura contra concorrência** e **camada de resolução de escopo separada** foram incorporadas ao design do Continuum; as demais (hooks automáticos, UI web, jobs agendados, binário Rust) ficaram como possíveis evoluções futuras, para manter a v1 o mais simples possível.

## 11. Casos de uso ilustrativos

| Ferramenta | Cenário | Via MCP | Via CLI |
|---|---|---|---|
| `save` | Encerrando o trabalho do dia | "salva o contexto antes de eu fechar" | `continuum save -m "..."` |
| `load` | Retomando no dia seguinte | "retoma de onde parei" | `continuum load` |
| `recap` | Voltando a um projeto parado há meses | "me dá um apanhado geral de tudo que fizemos aqui" | `continuum recap --last 10` |
| `list` | Buscando se já resolveu algo parecido | "já mexi com autenticação SIAPE em outro projeto?" | `continuum list --query "autenticação" --all-projects` |
| `sync` | Trocando de máquina | "quero sincronizar isso com um repo privado no GitHub" | `continuum sync enable git@github.com:user/memoria.git` |
| `stash` | Sessão de teste salva por engano | "apaga essa última sessão, foi só um teste" | `continuum stash --session <id>` |
| `trash` | Antes de restaurar algo | "o que eu já apaguei desse projeto?" | `continuum trash` |
| `restore` | Recuperando de uma exclusão por engano | "restaura aquela sessão que apaguei ontem" | `continuum restore <id>` |
