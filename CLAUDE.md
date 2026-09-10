# CLAUDE.md — Jade Linter

VS Code extension / LSP for Jade ORM schema files (`.jade` declarative + Lua Entity style).

## Branding (mandatory)

**Do not mention Prisma** in any user-facing or repo surface:

- README / marketplace listing / extension `description` / keywords
- Docs, CHANGELOG, release notes, commit messages
- Diagnostics, hover, completion copy, snippets
- Comments that ship in the published vsix if they are user-visible

Prisma is an internal DX reference only — not product branding. Jade is **Jade**.

If you need a mental model for schema DX, think declarative schema blocks, not another ORM’s name.

## Repo conventions

- PRs to `master`
- Diagnostics / LSP messages in **English**
- Talk to the user in **PT-BR** when coordinating
- Align `.jade` syntax with core `schema/declarative.lua` (`parsedeclarativeSchema`)
- Do not register a grammar as `language: "lua"` / hijack `source.lua` (use injection)

## Worktrees

Other agents share this workspace. Prefer an isolated worktree per task (`jade-linter-*`); do not edit the main worktree in parallel.
