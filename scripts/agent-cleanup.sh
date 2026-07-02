#!/usr/bin/env bash
#
# agent-cleanup.sh — janitor for autonomous / scheduled agent runs.
#
# Run at the START of every scheduled run (start-of-run cleanup survives a
# crashed predecessor; end-of-run cleanup does not). Also runnable manually.
#
# Modes:
#   (default)        Clean up stale locks, phantom worktrees, dead branches, old stashes.
#   --verify-clean   Exit non-zero if the working tree still has agent litter or
#                    stray worktrees. Use as a Stop/SessionEnd gate.
#   --dry-run        Print what would be done, change nothing.
#
# Safe by construction: only removes worktrees whose paths no longer exist,
# only deletes zero-commit branches sitting exactly at origin/main's SHA,
# and only steals the scheduled lock when its PID is dead.

set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || { echo "not a git repo"; exit 2; }

DRY=0; VERIFY=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY=1 ;;
    --verify-clean) VERIFY=1 ;;
    *) echo "unknown arg: $arg"; exit 2 ;;
  esac
done

run() { if [ "$DRY" = 1 ]; then echo "DRY: $*"; else eval "$@"; fi; }
log() { echo "[agent-cleanup] $*"; }

LOCK=".claude/scheduled_tasks.lock"
LITTER_GLOBS=('*.patch' 'SCHEDULED-TASK-REPORT-*.md' 'triage-report-*.md' 'gh-issue-triage-*.md' '*-pr-body.md' 'PR-BODY-*.md' '.tmp-*')

# ---- verify-clean gate --------------------------------------------------
if [ "$VERIFY" = 1 ]; then
  fail=0
  for g in "${LITTER_GLOBS[@]}"; do
    for f in $g; do [ -e "$f" ] && { echo "LITTER: $f"; fail=1; }; done
  done
  # Any worktree whose path is gone but still registered?
  if git worktree list --porcelain | grep -q 'prunable'; then
    echo "STALE WORKTREES registered (run agent-cleanup.sh to prune)"; fail=1
  fi
  [ "$fail" = 0 ] && log "clean" || log "NOT clean"
  exit "$fail"
fi

# ---- 1. steal stale scheduled lock -------------------------------------
if [ -f "$LOCK" ]; then
  pid=$(grep -oE '[0-9]+' "$LOCK" | head -1 || true)
  if [ -n "${pid:-}" ] && kill -0 "$pid" 2>/dev/null; then
    log "lock held by live PID $pid — leaving it"
  else
    log "removing stale lock (PID ${pid:-unknown} dead)"
    run "rm -f '$LOCK'"
  fi
fi

# ---- 2. stray .git lock files (no live git process) --------------------
if ! pgrep -x git >/dev/null 2>&1; then
  while IFS= read -r lk; do
    log "removing stale git lock: $lk"; run "rm -f '$lk'"
  done < <(find .git -maxdepth 3 -name '*.lock' 2>/dev/null)
  run "rm -f .git/index.lock.bak .git/test.txt"
fi

# ---- 3. prune worktrees; force-remove phantom-locked ones --------------
run "git worktree prune -v"
git worktree list --porcelain 2>/dev/null | awk '/^worktree /{p=$2} /^locked/{print p}' | while read -r wt; do
  [ -z "$wt" ] && continue
  if [ ! -d "$wt" ]; then
    log "force-removing phantom-locked worktree: $wt"
    run "git worktree unlock '$wt' 2>/dev/null; git worktree remove --force '$wt' 2>/dev/null"
  fi
done
run "git worktree prune"

# ---- 4. delete zero-commit branches sitting at origin/main -------------
git fetch origin main -q 2>/dev/null || true
main_sha=$(git rev-parse origin/main 2>/dev/null || git rev-parse main)
cur=$(git branch --show-current)
git for-each-ref --format='%(refname:short) %(objectname)' refs/heads/ | while read -r name sha; do
  case "$name" in
    main|"$cur") continue ;;
    scheduled/*|fix/*|chore/scheduled-*)
      if [ "$sha" = "$main_sha" ]; then
        log "deleting zero-commit branch at main SHA: $name"
        run "git branch -D '$name'"
      fi ;;
  esac
done

# ---- 5. list old stashes (report only — never auto-drop) ---------------
n=$(git stash list 2>/dev/null | wc -l | tr -d ' ')
[ "$n" != 0 ] && { log "$n stash(es) present — review manually:"; git stash list; }

log "done."
