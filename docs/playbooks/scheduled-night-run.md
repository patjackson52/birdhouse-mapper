# Playbook: Scheduled Night Run

The loop a scheduled/autonomous agent follows each night. Keeping the prompt thin — "follow `docs/playbooks/scheduled-night-run.md`" — and the logic here.

## Preconditions (P0-1 — must hold or the run cannot deliver)

The environment MUST be able to push and open PRs. One of:
- **Clone, don't mount.** `git clone` the repo to sandbox-local disk (a mounted read-only `.git` cannot commit or clear locks — this was the 2026-05 failure). Verified working via `/tmp` clone in the 05-20 run.
- **Write credential present.** A fine-grained PAT or GitHub App token with `contents:write` + `pull_requests:write`, plus `gh` CLI on PATH. Verify with `gh auth status` before starting.

If neither holds: **abort. Write a one-line failure note and stop. Do NOT emit `.patch` / report files into the repo** — that was the old broken fallback and it litters the tree (`.gitignore` now blocks those patterns anyway).

## The loop

1. **Cleanup first.** `bash scripts/agent-cleanup.sh` — steals stale locks, prunes phantom worktrees, deletes dead branches. Start-of-run cleanup survives a crashed predecessor.
2. **Sync.** `git fetch origin main && git checkout -b scheduled/$(date +%F)-<issue> origin/main`. Always branch from fresh `origin/main`.
3. **Read the ledger.** `memory/context/scheduled-task-ledger.md`. Skip issues with an open `pending`/`in-progress` row or listed under "Open threads needing a human decision" (e.g. #279). Prefer never-attempted issues.
4. **Claim.** Comment on the chosen GitHub issue ("scheduled run YYYY-MM-DD started") — distributed lock visible to all runs.
5. **Implement** in the branch (worktrees under `.claude/worktrees/<task-id>`, created unlocked, removed in a finally step). Follow TDD + AGENTS.md invariants.
6. **Self-verify** before PR: `npm run type-check && npm run test` (add `npm run verify` once it exists). For UI, the visual-diff playbook. A run that can't verify green does not open a PR.
7. **Deliver — PR is the only artifact.** Commit (incl. the ledger row + any ADR), push, `gh pr create` with the verification evidence in the body. Reserve ADR numbers by pushing the ADR file in the PR immediately; next number = max(`docs/adr/` on origin/main + open-PR ADRs) + 1.
8. **Record.** Append the run's row to the ledger (in the same PR).
9. **Cleanup last.** `git worktree remove` the run's worktree; `bash scripts/agent-cleanup.sh --verify-clean` must exit 0.

## Memory drain (weekly, or per-run 5-min budget)

Promote or delete anything in `memory/inbox/` older than 7 days via `scripts/promote-memory.sh`. Inbox is a staging area, not storage — a decision sat there stranded for 2.5 months (the icon-JSONB ADR, now landed as `docs/adr/0011`).

## Guardrails for long (4+ hour) unattended runs

- Every mutation lands as a PR gated by CI; no direct pushes to `main`.
- `scripts/agent-cleanup.sh --verify-clean` as a `Stop`/`SessionEnd` hook fails loudly if litter or stray worktrees remain.
- Once RLS tenant-isolation tests run in CI (P2), low-risk issues can use `gh pr merge --auto --squash` for a truly hands-off loop.
