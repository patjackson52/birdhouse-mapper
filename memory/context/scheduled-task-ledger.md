# Scheduled-Task Ledger

**Purpose:** one row per nightly scheduled-agent run. This is the cross-run memory that prevents the same issue being re-solved every night (see the 2026-05 history below: #279 attempted 4×, #319 3×, all undelivered).

## Protocol (every scheduled run MUST follow)

1. **Before triage:** read this ledger. Skip any issue with an open `pending`/`in-progress` row unless you are explicitly resuming it. Prefer issues never attempted.
2. **On starting an issue:** comment on the GitHub issue ("scheduled run YYYY-MM-DD started") — the comment is a distributed lock visible to every future run and to Patrick.
3. **After the run:** append a row here with the real outcome. `merged` only when the PR is merged; `pr-open` when a PR exists; `blocked` when work exists but couldn't be delivered; `abandoned` when dropped.
4. **ADR numbering:** next number = max(`docs/adr/` on origin/main, open-PR ADRs) + 1. Never reuse a number sitting only inside an unpushed patch (this is how three runs each claimed "ADR-0011").
5. Commit this file **in the same PR** as the work, so the ledger and the delivery move together.

## Ledger

| Date | Issue | Summary | Outcome | Delivered? | Notes |
|---|---|---|---|---|---|
| 2026-05-07 | #269 | Authenticated photo uploads bypass moderation (prio:high) | blocked | ✗ | Became PR #327 (still open, failing Migration Dry Run check). Root fix in `sync-engine.ts`. |
| 2026-05-08 | #322 | Update-detail overlay button overlap (`top-[58px]` hardcode) | blocked | ✗ | Patch at root: `322-fix.patch`. |
| 2026-05-09 | #279 | geo_layers offline sync 400 (loose ends after PR #321) | blocked | ✗ | **Attempt 1 of 4.** |
| 2026-05-11 | multiple | Code complete, push blocked (unclear primary) | blocked | ✗ | Touched #162/#269/#276/#279/#313/#322. |
| 2026-05-12 | #319 | Remove About page + admin entry | blocked | ✗ | Branch `scheduled/night-task-2026-05-12`; `319-cleanup-about-page.patch`. |
| 2026-05-13 | #162 | Admin breadcrumb (+ triage) | blocked | ✗ | `162-admin-breadcrumb.patch`, `gh-issue-triage-2026-05-13.md`. |
| 2026-05-14 | #276 | Centralize soft-delete awareness in sync engine | blocked | ✗ | Ties into PR #327 area. |
| 2026-05-16 | #319 | Remove About page (re-attempt) | blocked | ✗ | Duplicate of 05-12. |
| 2026-05-17 | #313 | Scheduled maintenance load error (offline cache) | blocked | ✗ | `313-no-cache-supabase-rest.patch`. |
| 2026-05-18 | #279 | geo_layers offline sync | blocked | ✗ | **Attempt 2 of 4.** |
| 2026-05-19 | #279 | geo_layers offline sync — *removed* geo-layers sync | blocked | ✗ | **Attempt 3 of 4.** Drafted ADR "remove-geo-layers-sync" (claimed 0011). 45/45 offline tests pass. |
| 2026-05-20 | #279 | geo_layers offline sync — *rejected* removal (keeps sync) | blocked | ✗ | **Attempt 4 of 4. Contradicts 05-19.** Rejected removal as ADR-0009 violation; drafted a different ADR (also claimed 0011). |

**Root cause of all `blocked` rows:** scheduled sandbox has a read-only `.git` mount (can't clear locks / commit) and a read-only GitHub integration (`403` on `create_branch`/`push_files`), with no `gh` CLI or token. Fix tracked as P0-1 in `docs/reports/2026-07-02-repo-audit.md`. Until P0-1 lands, scheduled runs cannot deliver — a run that can't push should **abort with a one-line failure report, not emit `.patch` files into the repo.**

## Open threads needing a human decision
- **CI Supabase auth is dead (P0).** `supabase link` in `ci.yml` returns `{"message":"Unauthorized"}` → exit 1 on **every** branch (main included). So the `Migration Dry Run` check is red on all PRs regardless of content, and `Apply Migrations` on `main` push fails — **prod migrations have not applied since the token expired.** Fix: rotate `SUPABASE_ACCESS_TOKEN` secret (verify `SUPABASE_PROJECT_REF`). This is why PR #327's "Migration Dry Run failure" was never content-related. Evidence: failed run 28601569471.
- **#279** — two contradictory designs (remove vs keep geo-layers sync). Needs Patrick to pick before any further attempt. Do NOT re-attempt blind.
- **PR #327** (#269 photo moderation) — open; its red "Migration Dry Run" is the expired-token issue above, not the patch. Merge once the token is rotated and content re-reviewed.
