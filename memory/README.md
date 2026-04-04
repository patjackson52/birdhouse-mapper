# Cross-Tool Developer Memory

Canonical durable memory that works across Claude Code, OpenClaw, Cursor, and Codex/AGENTS.md.

## Purpose

This directory is the single source of truth for project knowledge that AI coding tools need to work effectively. It stores decisions, patterns, procedures, and context as plain markdown files, reviewable in git with no external dependencies.

## Directory Structure

```
memory/
  decisions/        # Technical decisions at project and org level
  patterns/         # Recurring coding and architecture patterns
  procedures/       # Runbooks for releases, incidents, etc.
  context/          # Product and team context
  inbox/            # Uncategorized notes awaiting promotion
```

## How Each Tool Discovers Memory

- **Claude Code** — Reads `CLAUDE.md` which references `memory/` files. Memory files are loaded as context.
- **Cursor** — `.cursorrules` or project-level rules reference memory files.
- **Codex / AGENTS.md** — `AGENTS.md` references memory files for agent context.
- **OpenClaw** — Configured to read memory directory as project knowledge.

All tools converge on the same markdown files, ensuring consistency.

## Adding Entries

**Manually:** Edit the relevant file in `memory/` directly and commit.

**Via script:**
```bash
scripts/remember.sh "category" "Your note here"
# Example:
scripts/remember.sh decision "Chose Zod over Yup for schema validation"
```

Notes added via `remember.sh` land in `memory/inbox/` by default unless a category is specified.

## Promoting Entries

Items in `inbox/` should be periodically reviewed and moved to the appropriate memory file:

```bash
scripts/promote-memory.sh
```

This walks through inbox items and prompts you to file them into the correct location.

## Design Principles

1. **Repo files as source of truth** — No databases, no SaaS, no external state.
2. **Reviewable in git** — All memory changes go through normal PR review.
3. **No external dependencies** — Plain markdown, plain bash scripts.
4. **Tool-agnostic** — Any tool that can read files can use this memory.
5. **Append-friendly** — Easy to add, hard to accidentally lose.
