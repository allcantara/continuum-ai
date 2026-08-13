# Continuum — Identidade de projeto

A identidade de um projeto **não** usa mais o registro de aliases (remoto git / caminho).

Fonte única: o arquivo `.continuum.local.json` na raiz git (ou na pasta aberta, se não houver git).

- Criado no primeiro `save`.
- Contém `id` (UUID) e `folderName`.
- Ignorado pelo git via `.git/info/exclude` nesta cópia.
- `list` / `load` / `recap` / `stash` / `restore` só encontram o projeto se esse arquivo existir. `trash` lista a lixeira inteira desta máquina.

Detalhes: [README.md](./README.md) (seção *How Continuum identifies a project*) e [DESIGN.md](./DESIGN.md) §4.2.
