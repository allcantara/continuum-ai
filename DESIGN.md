# Continuum — Documento de Design (v1)

> Este documento consolida todas as decisões de arquitetura tomadas antes de iniciar a implementação. Serve como fonte da verdade para o início do desenvolvimento, independente do histórico da conversa que o originou.

## 1. Objetivo

Persistir e reaproveitar o contexto de trabalho entre:
- Chats diferentes do **mesmo projeto** (retomar exatamente de onde parou).
- **Projetos diferentes** (reaproveitar decisões/conhecimento).
- **Ferramentas diferentes** (Cursor, Claude Code, ou qualquer cliente MCP), já que o armazenamento e o servidor são independentes de qualquer IDE específica.

Tudo fica nesta máquina, em `~/.continuum/`. Não há sincronização entre computadores.

## 2. Nome e identidade

- **Nome do produto**: Continuum
- **Pasta de armazenamento padrão**: `~/.continuum/`, configurável via variável de ambiente `CONTINUUM_HOME`
- **Padrão de nomenclatura das ferramentas**: `continuum_<verbo>` (prefixo mantido deliberadamente, mesmo sabendo que o cliente MCP já namespacia por servidor — decisão do usuário por clareza)

## 3. Mecanismo

- Servidor MCP local em **Node.js/TypeScript**.
- Transporte `stdio` na v1. Núcleo (identidade, storage, índice) **desacoplado do transporte**, para permitir evoluir para modo remoto/HTTP hospedado no futuro sem reescrever a lógica.
- **CLI própria**, reaproveitando o mesmo núcleo (casca fina de parsing de argumentos por cima das mesmas funções que o servidor MCP chama). Incluída já na v1. O comando `continuum ui` sobe um HTTP local só de inspeção (`127.0.0.1`) — não é o MCP remoto do roadmap.
- Sem Agent Skill separada — as descrições das próprias ferramentas MCP orientam o agente sobre quando/como usá-las. Acionamento sempre manual (pedido explícito em linguagem natural ou comando de CLI), sem captura automática via hooks na v1.

### 3.1 Como o uso funciona na prática

**Na v1 (stdio) o MCP não escuta em `localhost:porta`.** Não há processo contínuo para "apontar" o cliente MCP:

- **Via MCP**: o cliente (Cursor, Claude Code) é configurado com um **comando** a executar (ex.: `node /caminho/continuum/dist/server.js`), não uma URL. O próprio cliente sobe esse processo quando precisa e conversa com ele por `stdin`/`stdout` (pipes diretos entre processos, sem rede). Ao fechar o chat/IDE, o processo termina.
- **Via CLI**: o comando `continuum` executa a lógica diretamente (lê/escreve arquivos e o SQLite no processo do próprio comando) e termina — não conversa com nenhum servidor. **Exceção:** `continuum ui` deixa um processo HTTP em `127.0.0.1` até Ctrl+C, só para o browser local inspecionar os dados.
- **Uma máquina**: sessões e o arquivo `.continuum.local.json` existem só neste computador. Não há remoto nem comando de sync.

**No modo remoto (roadmap, seção 9)**, a lógica muda para o modelo que normalmente se espera de um "servidor":

- Um processo persistente sobe com `continuum serve --http --port 3000` (local, em casa, ou num VPS).
- O MCP passa a ser configurado com uma **URL** (`http://localhost:3000/mcp` para testar local, ou `https://meu-servidor.exemplo.com/mcp` remoto) em vez de um comando.
- A CLI também poderia apontar para essa URL via variável de ambiente (ex.: `CONTINUUM_SERVER_URL`), virando um cliente HTTP fino em vez de operar nos arquivos diretamente.
- Trocar entre local e remoto nesse modo é só mudar a URL — por isso o núcleo já foi desenhado desacoplado do transporte desde a v1.

| | v1 (agora) | v2+ (futuro, roadmap) |
|---|---|---|
| Como o MCP se conecta | Comando local, via stdio | URL (local ou remota), via HTTP |
| Como a CLI funciona | Executa tudo localmente, sozinha | Pode virar cliente HTTP, apontando para uma URL |
| Entre máquinas | Só nesta máquina (sem sync) | Via servidor único compartilhado |

## 4. Armazenamento

### 4.1 Estrutura de diretórios

```
$CONTINUUM_HOME/                    (padrão: ~/.continuum/)
├── index.sqlite                    # índice derivado — NUNCA é fonte de verdade
├── projects/<slug>-<hash>/
│   ├── meta.md                     # slug, uuid, caminho de origem, data de criação
│   └── sessions/
│       ├── 2026-08-10-1430.md      # nunca sobrescrito; cresce a cada save
│       └── 2026-08-11-0915.md
├── workspaces/<slug>-<hash>/
│   ├── meta.md                     # lista os hashes de projeto que compõem o workspace
│   └── sessions/
└── .trash/
    ├── projects/<hash>-<timestamp-exclusao>/...
    ├── workspaces/<hash>-<timestamp-exclusao>/...
    └── sessions/<hash>/<timestamp>-<timestamp-exclusao>.md
```

`<slug>` is the folder name stored in `.continuum.local.json`. The real identity is the UUID in that file. Legacy folders named with only a 16-character hash are still readable.

### 4.2 Identidade (arquivo local)

- **Projeto**: o arquivo `.continuum.local.json` na pasta aberta. Se essa pasta estiver dentro de um repositório git, o arquivo fica na raiz git. Contém um UUID (`id`) e o nome da pasta (`folderName`). O UUID é gerado no primeiro `save` e não muda se a pasta for renomeada. Git não é obrigatório: pasta aleatória ou pasta do usuário também recebem o arquivo.
- **Git**: quando a pasta é um repositório (ou está dentro de um), o arquivo é acrescentado a `.git/info/exclude` nesta cópia, para não aparecer no `git status` nem ser commitado.
- **Leitura** (`list` / `load` / `recap` / `stash` / `restore`): sobe da pasta aberta até a raiz git procurando o arquivo. Sem git, não sobe para pastas pai. Se o arquivo não existir, não há projeto Continuum nesta pasta — o primeiro `save` cria o arquivo. `trash` lista a lixeira inteira desta máquina.
- **Workspace** (multi-root): composição dos UUIDs de cada raiz que já tem o arquivo.
- **Sem caminho conhecido**: bucket fixo `sem-projeto` (hash `unscoped`), só no MCP sem `roots`. Home e pastas sem git são pastas válidas — o agente deve passar esse caminho em `roots`.

#### 4.2.1 Limitação conhecida: a primitiva `roots` do MCP não é confiável em todo cliente

O Cursor anuncia suporte à capability `roots` na conexão inicial, mas a chamada real `roots/list` retorna erro (`Method not found`) — bug documentado no fórum da própria ferramenta, sem previsão de correção. Isso significa que a resolução automática de escopo via `roots` **nunca funciona no Cursor**.

Isso não é universal — depende do cliente MCP:

| Cliente | `roots/list` | `cwd` do processo do servidor | Sinal extra |
|---|---|---|---|
| Cursor | Quebrado (bug conhecido, sem ETA) | Não confiável — não amarrado ao workspace do chat | Nenhum |
| Claude Code (macOS/Linux) | Funciona (retorna o diretório de lançamento + `--add-dir`) | Reportado igual ao diretório do projeto | `CLAUDE_PROJECT_DIR` (env var, documentado como estável) |
| Claude Code (Windows) | Funciona | Bug conhecido: às vezes vem `C:\WINDOWS\system32` | `CLAUDE_PROJECT_DIR` também pode faltar em versões antigas |
| VS Code (Copilot) | Documentado como suportado | Documentado como "padrão = pasta do workspace" | `${workspaceFolder}` (resolvido pelo cliente antes de subir o processo, não é env var) |
| Cline / Continue | Não confirmado | Só correto se o próprio usuário configurar `cwd: "${workspaceFolder}"` no `mcp.json` | — |

Por isso o design não pode assumir nem "roots sempre funciona" nem "cwd sempre é confiável" — a combinação varia por cliente e não há como o servidor MCP saber de antemão qual vai funcionar em cada conexão.

Três consequências no design, para não depender de nenhum desses mecanismos isoladamente:

1. **O agente de IA que chama a ferramenta deve informar `roots` explicitamente** (usando o caminho absoluto que ele já conhece: pasta de projeto, pasta aleatória ou pasta do usuário) em vez de confiar apenas na primitiva. Só omite `roots` quando não há nenhum caminho conhecido; nesse caso o MCP usa o bucket `sem-projeto`. As descrições dos parâmetros das ferramentas MCP orientam isso. Quando o agente informa `roots`, esse valor tem prioridade sobre qualquer resultado da primitiva.
2. **A primitiva `roots/list` ainda é tentada automaticamente** quando o agente não informa nada — funciona corretamente em clientes que a implementam de verdade (ex.: Claude Code), então continua sendo útil onde o Cursor falha.
3. **O fallback para `process.cwd()` só é usado pela CLI**, nunca pelo servidor MCP. Na CLI, o diretório de trabalho do terminal é um sinal confiável (é o usuário quem o define, rodando o comando dentro do projeto). No servidor MCP, esse diretório varia por cliente (ver tabela acima) e não há como o Continuum diferenciar, em runtime, um cliente onde ele é confiável de um onde não é — por isso, sem `roots` (explícito ou via primitiva), uma chamada MCP cai no bucket `sem-projeto` em vez de arriscar adivinhar um caminho errado.
4. **Cache de escopo por processo MCP**: quando uma chamada anterior na mesma sessão de chat já resolveu `roots` (explícito ou via primitiva), chamadas seguintes sem `roots` reutilizam o último escopo conhecido do processo — com aviso explícito. Isso reduz o impacto de o agente esquecer de informar `roots` na segunda chamada, sem substituir a necessidade de informá-lo na primeira.

### 4.3 Sessões são cumulativas, não incrementais

Cada `continuum_save` deve gravar um **retrato completo do estado atual** (o que estava sendo feito, decisões, estado atual, próximos passos, arquivos relevantes) — não apenas o delta da sessão de chat corrente. Isso garante que ler somente a sessão mais recente (`continuum_load`) seja suficiente para retomar o trabalho, sem precisar reconstruir uma cadeia de deltas.

O "estado atual" de um projeto/workspace **não é um arquivo físico separado** — é sempre a sessão de id mais recente dentro de `sessions/`.

A sessão "mais recente" é determinada pelo **id da sessão** (timestamp codificado no nome do arquivo, ex.: `2026-08-11-0915.md`), **não** pelo `mtime` do arquivo. Ordenar por id evita que `continuum_load` retorne a sessão errada se os horários de modificação dos arquivos mudarem.

### 4.4 Índice derivado (SQLite)

- Usa o módulo nativo **`node:sqlite`** (embutido no Node.js, sem dependência externa compilada) com **FTS5** para busca full-text.
- Requer Node.js recente (idealmente ≥24.15/25.7/26 para FTS5 garantido via release candidate). Ao iniciar, o servidor testa se FTS5 está disponível; se não estiver, cai automaticamente para busca simples por texto nos arquivos (sem quebrar funcionalidade, só perde o ranking mais esperto).
- **Nunca é fonte de verdade** — é reconstruível a qualquer momento varrendo os arquivos `.md` existentes. Se `index.sqlite` estiver vazio ou divergente em relação aos arquivos em disco, o `IndexReconciliationService` compara a contagem de arquivos com a contagem do índice e reconstrói automaticamente no boot e nas leituras. Arquivos que não são sessões (`meta.md`, entradas que não são diretórios em `projects/`) são excluídos dessa contagem.
- Quando o índice existe mas faltam slugs legíveis (dados antigos), o serviço também reconstrói a partir do disco se encontrar slugs em `meta.md`.
- Guarda metadados enxutos por sessão: hash do projeto/workspace, **slug legível**, timestamp, um resumo curto (1-2 linhas) extraído no momento do `save`, e um campo de **status** (`ativo` | `lixeira`) — usado tanto por `continuum_list` quanto por `continuum_trash`, sem precisar de dois caminhos de código diferentes.

### 4.5 Padrão de leitura (mantém as respostas enxutas)

- **`continuum_list` / `continuum_trash` / busca**: consultam **apenas o índice SQLite** — nunca abrem os arquivos `.md` inteiros. Respostas curtas mesmo com centenas de sessões.
- **`continuum_load` / `continuum_recap`**: leem o(s) arquivo(s) `.md` completo(s) do disco, mas **aplicam truncamento na resposta** para caber no contexto do modelo (`CONTINUUM_MAX_LOAD_CHARS`, padrão 40000; `CONTINUUM_MAX_RECAP_CHARS`, padrão 60000). O arquivo em disco permanece intacto.

## 5. Ferramentas (7)

| Ferramenta | Função | Observações |
|---|---|---|
| `continuum_save` | Salva o contexto da sessão atual | Grava o `.md` (escrita atômica: temp + rename) e depois insere/atualiza a linha correspondente no índice. Emite aviso heurístico se o conteúdo parecer conter segredo (token/chave/senha). |
| `continuum_load` | Carrega só a sessão mais recente | Lê o `.md` de id mais recente em `sessions/` do escopo atual (ordenado por id de sessão, não por mtime). Trunca na resposta se necessário. |
| `continuum_recap` | Carrega as últimas N sessões (histórico mais profundo) | Padrão: **5 sessões**, configurável via parâmetro. Orçamento total de caracteres dividido entre as N sessões. |
| `continuum_list` | Lista/busca sessões | Consulta o índice SQLite (FTS5 quando disponível, fallback por texto simples). Exibe slug legível do projeto quando disponível. |
| `continuum_stash` | Move sessão específica ou projeto/workspace inteiro para a lixeira | Reversível: move o arquivo físico para `.trash/` e atualiza o status no índice para `lixeira` (não remove a linha). Compensa movimentação física se a atualização do índice falhar. |
| `continuum_trash` | Lista o que está na lixeira | Consulta o índice filtrando `status = lixeira` — inclui slug legível do projeto. |
| `continuum_restore` | Restaura sessão ou projeto/workspace inteiro da lixeira | Move o arquivo de volta ao local original e atualiza o status para `ativo`. Aceita `session_id` ou `--project`. |

### 5.1 CLI equivalente

```bash
continuum save [-m "resumo"]        # sem -m, abre $EDITOR
continuum load
continuum recap [--last N]
continuum list [--query "busca"] [--all-projects]
continuum stash --session <id> | --project
continuum trash
continuum restore <id> | --project
continuum ui [--port N] [--open]    # inspeção local no browser; Ctrl+C encerra
```

### 5.2 UI local de inspeção (`continuum ui`)

Servidor HTTP em `127.0.0.1` (nunca em todas as interfaces). Imprime o link no terminal. Fechar a aba não encerra o processo; Ctrl+C sim.

Navegação: projetos → sessões → conteúdo completo do `.md` (sem truncar). Stash, lixeira e restore usam os mesmos casos de uso da CLI/MCP. O índice SQLite aparece só como vitrine — o markdown continua sendo a fonte da verdade.

A tela da sessão é **somente leitura** na v1. Edição (sobrescrever o arquivo, criar outra sessão, ou os dois) fica para a v2 — ver [DESIGN-v2.md](./DESIGN-v2.md) seção "UI — edição de sessão".

## 6. Local apenas

Não há sincronização git de `~/.continuum/`. O arquivo `.continuum.local.json` é criado no primeiro `save` mesmo quando a pasta não é um repositório git (pasta aleatória, pasta do usuário, etc.). O git do projeto aberto, quando existe, é usado só para:

- colocar o arquivo na raiz do repositório (em vez da subpasta aberta);
- acrescentar esse arquivo a `.git/info/exclude` nesta cópia, para não ser versionado.

## 7. Lixeira

- `continuum_stash` move para `.trash/`, nunca apaga de verdade.
- `continuum_restore` suporta restauração de sessão individual (`session_id`) ou de projeto/workspace inteiro (`--project`), revertendo o `stash --project`.
- **Sem expiração automática na v1** (removido do escopo — descartamos tanto o agendador do SO quanto a varredura preguiçosa de 30 dias por complexidade/preferência do usuário). Os itens ficam na lixeira indefinidamente até restauração ou remoção manual pelo próprio usuário no sistema de arquivos.
- Possível melhoria futura (não na v1): expiração automática configurável.

## 8. Robustez de implementação

1. **Escrita atômica**: grava em arquivo temporário e renomeia (operação atômica no sistema de arquivos) — protege contra corrupção mesmo com múltiplos processos `stdio` escrevendo ao mesmo tempo (cada cliente MCP pode spawnar seu próprio processo do servidor). Lock de arquivo simples para operações que tocam mais de um arquivo junto (ex.: sessão + índice).
2. **Varredura tolerante do filesystem**: ao listar projetos/workspaces em disco, só entradas que são diretórios são consideradas escopos — arquivos soltos (ex.: `.DS_Store` no macOS) são ignorados em vez de provocar erro ao abrir `<arquivo>/sessions`.
3. **Camada de resolução de escopo separada**: uma função única, chamada por todas as ferramentas antes de qualquer leitura/escrita, responsável por decidir projeto vs. workspace e calcular o hash correspondente. Centraliza a lógica e já deixa pronto o ponto de entrada para autenticação, quando/se existir modo remoto.
4. **Respostas MCP com `isError`**: erros retornam `isError: true` no protocolo MCP (não apenas texto prefixado com `Error:`).
5. **Avisos padronizados**: segurança, truncamento, escopo genérico e cache de escopo usam prefixo `Aviso:` consistente, distinto de erros.

## 9. Fora do escopo da v1 (roadmap)

> Planejamento detalhado da evolução (captura em camadas, transcripts, knowledge, hooks): **[DESIGN-v2.md](./DESIGN-v2.md)**.
> Identidade de projeto (arquivo local `.continuum.local.json`): **[SCOPE-REGISTRY.md](./SCOPE-REGISTRY.md)**.

- Camada `knowledge/` — conhecimento reaproveitável entre projetos, organizado por projeto de origem, com índice de descoberta cross-project.
- Captura automática via hooks de ciclo de vida (hoje é só manual).
- Modo remoto hospedado (HTTP / MCP) — arquitetura já preparada (núcleo desacoplado do transporte); `continuum ui` **não** é esse modo.
- Expiração automática da lixeira (agendador do SO ou varredura preguiçosa).
- Backups binários dedicados, jobs agendados de manutenção (consolidação, lint, embeddings).
- Edição de sessão na UI (sobrescrever / nova / os dois) — ver DESIGN-v2.md.

## 10. Referência de comparação

Este design foi comparado com um projeto de referência mais robusto ("ai-memory", em Rust) que usa: hooks de captura automática, servidor único em Rust servindo stdio e HTTP, fila de escrita única (mpsc), camada dedicada de scope/auth/admission, SQLite como índice derivado de uma wiki markdown, jobs agendados de manutenção, e backups dedicados. As ideias de **índice derivado**, **escrita segura contra concorrência** e **camada de resolução de escopo separada** foram incorporadas ao design do Continuum; as demais (hooks automáticos, MCP HTTP remoto, jobs agendados, binário Rust) ficaram como possíveis evoluções futuras, para manter a v1 o mais simples possível. A inspeção local no browser (`continuum ui`) entrou na v1; edição de sessão na UI permanece na v2.

## 11. Casos de uso ilustrativos

| Ferramenta | Cenário | Via MCP | Via CLI |
|---|---|---|---|
| `save` | Encerrando o trabalho do dia | "salva o contexto antes de eu fechar" | `continuum save -m "..."` |
| `load` | Retomando no dia seguinte | "retoma de onde parei" | `continuum load` |
| `recap` | Voltando a um projeto parado há meses | "me dá um apanhado geral de tudo que fizemos aqui" | `continuum recap --last 10` |
| `list` | Buscando se já resolveu algo parecido | "já resolvi algo parecido com autenticação em outro projeto?" | `continuum list --query "autenticação" --all-projects` |
| `stash` | Sessão de teste salva por engano | "apaga essa última sessão, foi só um teste" | `continuum stash --session <id>` |
| `trash` | Antes de restaurar algo | "o que eu já apaguei desse projeto?" | `continuum trash` |
| `restore` | Recuperando de uma exclusão por engano | "restaura aquela sessão que apaguei ontem" | `continuum restore <id>` |
| `ui` | Inspecionar sessões no browser | — | `continuum ui` |
