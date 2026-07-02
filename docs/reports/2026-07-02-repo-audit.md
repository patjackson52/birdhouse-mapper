# FieldMapper — Repo Audit & Roadmap to MVP + Autonomous Loops

**Date:** 2026-07-02 · **Branch reviewed:** `main` @ `d24b1d28` (44 commits pulled this session) · **Method:** 6 parallel audit agents (MVP completeness, gaps/risk, dead code, simplification, process/automation, testing/CI) + 3 deep dives (offline sync, server-action security, RLS/migrations).

---

## TL;DR

The **product is far more complete than the delivery pipeline suggests.** Core loop ships: multi-tenant resolution, auth, map, item CRUD + custom types, timeline v2, species picker, Puck site-builder, geo layers, knowledge base, QR, scheduled maintenance, offline sync. 50 migrations, ~490 src files, ~200 unit-test files, green CI on merges.

Two things are actually on fire:

1. **Security — anonymous privilege escalation.** `/setup` server actions are unauthenticated service-role writes with no `setup_complete` guard → any anon visitor can POST `setupCreateAdmin` and mint an admin on a live org. Plus a photo-moderation bypass, SSRF, and several unauth'd cross-tenant actions. **These are pre-launch blockers, not nice-to-haves.**
2. **Delivery pipeline is broken.** `main` has been frozen since **2026-05-03**. Nightly agents complete work but can't push (read-only git mount + no GitHub write token), so they dump `.patch` + report files at repo root and **re-solve the same issues every night** (#279 attempted 4×, with *contradictory* ADRs; #322 twice). ~30 untracked junk files at root, ~70 registered git worktrees (16 phantom-locked), 5 stale stashes, a 2-month-old `index.lock`.

Everything else (dead code, duplication, test gaps) is real but secondary to those two.

---

## 1. Security — fix before any public launch

Consolidated from server-action + RLS + sync audits. The `/setup` finding surfaced independently in **three** agents — high confidence.

### Critical
| # | Finding | Evidence | Fix |
|---|---|---|---|
| C1 | **Anon → admin escalation.** All `/setup` actions use `createServiceClient()` (RLS bypass), no auth check, no `setup_complete` guard; `/setup` not in middleware protected list. `setupCreateAdmin` mints a confirmed admin on the first org. | `src/app/setup/actions.ts:110,31,166,189,213,244`; `middleware.ts:238-246` | Guard every setup action on `orgs.setup_complete === false` (+ one-time token); 403 after. |
| C2 | **Exported service-role geo-layer actions.** `createGeoLayerService`/`assignLayerToPropertyService` are `'use server'` + service client + no auth → insert into any org, bypass RLS. | `src/app/admin/geo-layers/actions.ts:222,356` | Make non-exported internal helpers, or add org-admin check. |
| C3 | **Photo moderation bypass.** Member/offline photos upload straight to public `vault-public` bucket + unmoderated `photos` row (no moderation columns). World-readable instantly; anon can also *list* the bucket. | `src/lib/offline/sync-engine.ts:67-97`; `migrations/026:159-160` | Route sync-engine photos through vault-private → `moderateImage` (PR #327's change) + add moderation status. |

### High
- **SSRF** — `processUrlContext` fetches unvalidated client URL server-side (localhost, `169.254.169.254`). `src/lib/ai-context/actions.ts:473`. → scheme/host allowlist, block private ranges.
- **Unauth'd custom-domain actions** — `addCustomDomain`/`removeCustomDomain`/`checkDomainStatus` trust client `orgId`, no admin check. `src/lib/domains/actions.ts:17,75,109`.
- **Email-blast without admin check** — `sendNotification` + topic CRUD only check `getUser()`, client-supplied `org_id`. `src/lib/communications/actions.ts:170,11,39,69`.
- **RLS: `vault_items` anon policy ignores `visibility`** — approved private items anon-readable. `043:68-78`. → add `AND vi.visibility='public'`.
- **RLS: `geo_layers` world-readable** (`TO anon USING(true)`) — every org's GeoJSON + boundaries. `021:70-73,142-146`.
- **RLS: entities/entity_types anon cross-tenant read** incl. `custom_field_values`. `013:119-140`.
- **RLS: maintenance public read** ignores anon-access config, leaks project data. `050:11-47`.
- **RLS: storage buckets writable cross-tenant** — org A admin overwrites org B logo; any auth user writes `item-photos`. `002:386-393`, `010:446-461`, `024:12-33`. → path-scope by org-id folder.
- **`type-check` currently FAILS** — missing `@vercel/speed-insights/next` + `isomorphic-dompurify` from `node_modules` (declared in package.json but absent). The DOMPurify one is the Puck XSS sanitizer. `layout.tsx:15`, `src/lib/puck/sanitize-html.ts:9`. → repair lockfile/install; **this also breaks local `npm run test` (633 failures) while CI stays green.**

### Sync-engine correctness (Critical/High, data-loss class)
- **Stranded `in_flight` ops = silent permanent data loss** — `markInFlight` sets `in_flight`, but `getPendingMutations` only selects `pending`/`failed`; tab crash mid-flush loses the op forever. `mutations.ts:27-33`. → reset stale `in_flight`→`pending` on startup.
- **Non-idempotent flush** — blobs upload before row op, deleted only on full success; failure retries with new `Date.now()` path → duplicate public objects + `photos` rows + orphan blobs. `sync-engine.ts:57-108`.
- **Last-write-wins clobber / silent edit-drop** — no version guard; inbound sync (line 268-270) silently deletes pending offline edits + photo blobs. `sync-engine.ts:119-124,261-272`.
- **Errors swallowed, no sync UI** — after `MAX_RETRIES=5` ops skipped forever; `pendingCount`/`isSyncing` consumed by zero components → user believes data synced. `sync-engine.ts:23-26`, `provider.tsx:68-89`.
- **Cross-tab double-execution** — `syncInProgress` is per-tab `useRef`, no `navigator.locks`. `provider.tsx:48-74`.
- **Serwist caches Supabase `/rest/` cross-user** — `defaultCache` NetworkFirst keyed on URL only; user A's data served to user B offline. `src/app/sw.ts:67`. (Unmerged `313-no-cache-supabase-rest.patch` at root = known.) → `NetworkOnly` for `supabase.co/rest|auth`.

### Medium (representative — full list in agent reports)
SECURITY DEFINER fns without `SET search_path` (privilege-escalation vector, many); INSERT policies don't enforce `org_id`/`property_id` consistency (cross-org rows); spoofable `x-property-id`/`x-preview` headers when tenant resolves without property (`middleware.ts:118-122`); `uploadToVault` path traversal via unsanitized `file.name`; vault quota triggers silently no-op under RLS (`current_storage_bytes` never tracks); `parcel_lookups` policies reference nonexistent roles (`owner/admin/staff` vs `org_admin/org_staff`) → all writes fail closed.

### Also
- **No root error boundary** — only maintenance has `error.tsx`; no `app/global-error.tsx`. Unhandled errors on map/admin/item routes hit Next default page.
- **`src/lib/types.ts` `Database` interface hand-maintained and badly stale** — ~20 tables missing (`vault_items`, `geo_layers`, `knowledge_*`, `maintenance_*`, `audit_log`…), `ItemUpdate` missing soft-delete cols. → regenerate with `supabase gen types`.

---

## 2. Delivery pipeline & process (root cause of the mess)

**How it works now:** nightly cloud agent mounts repo → triages issues → implements in a worktree → runs vitest+tsc → tries to push → **push fails** (read-only `.git` mount forbids unlink/commit; GitHub MCP is read-only, `403`; no `gh`/token in sandbox) → falls back to writing `NNN.patch` + `NNN-pr-body.md` + `SCHEDULED-TASK-REPORT.md` **at repo root**. Nothing lands.

**Failure modes observed:**
- **main frozen since 05-03**; 9 loose patches + reports at root, 0 PRs merged.
- **Duplicate/contradictory work** — no cross-run state. #279 solved 4× (05-19 *removed* geo-layers sync w/ draft ADR-0011; 05-20 *rejected* removal as ADR-0009 violation w/ draft ADR-0012 — both claim number 0011, neither in `docs/adr/`). #322 twice.
- **Litter agents can't clean** — ~70 worktrees (16 locked at nonexistent sandbox paths, survive prune), zero-commit orphan branches at main's SHA, `.git/test.txt` + `index.lock.bak`, stale `.claude/scheduled_tasks.lock` (PID 33379, Apr 17, no liveness check), 5 stashes.
- **`.gitignore` gaps** — covers `.worktrees/` but not `.claude/worktrees/`, `*.patch`, or report files → every `git add -A` risks committing 30+ junk files.
- **Memory half-drained** — `memory/inbox/0003-icon-jsonb-schmea.md` is an *Accepted* ADR stuck since Apr 17, its number 0003 since taken by species-picker; `cleanup.sh` (Apr 17, never run) references nonexistent scripts.

**Root cause: not crashes.** Runs complete diligently. Causes are (1) environment can't deliver, (2) no cleanup contract, (3) no cross-run ledger.

---

## 3. Dead code / cruft (low-risk cleanup)

- **9 confidently-dead source files** — `AiContextPanel.tsx`, `layout/Header.tsx`, `builder/BlockToolbar.tsx`, `preview/DetailPreview.tsx`, `MaintenanceEmpty.tsx`, `puck/icons/icon-catalog.ts`, superseded `admin/domains/actions.ts` + `manage/update/[id]/actions.ts`, `e2e/fixtures/auth.ts`. (`src/app/sw.ts`, `global-setup.ts` are knip false positives — keep.)
- **4 unused deps** — `proj4`+`@types/proj4`, `@formkit/auto-animate`, `@react-email/components`, `@types/sharp`. Move `@types/leaflet-draw` to devDeps. **Add unlisted** `@tiptap/*` (13 files, transitive-only — fragile).
- **`public/sw.js`** = tracked build artifact (generated from `src/app/sw.ts`). → `git rm --cached` + gitignore. *(The stashed deletion this session was correct.)*
- **Visual e2e tests never run** — `.visual.ts` files don't match Playwright default `testMatch`; `--list` shows 0. Yet CLAUDE.md + playbook + `visual-comment.sh` reference them. → add `testMatch: /.*\.(spec|visual)\.ts/` or rename; regenerate baselines. **(Flagged by 3 agents.)**
- **53 unused exports + 34 unused types** (knip) — dedicated pruning PR.
- **Root cruft** — all untracked; delete patches/reports/`cleanup.sh`/`.tmp-issues-copy.txt`; land the stranded icon-JSONB ADR as `docs/adr/0011-icon-jsonb-schema.md`.

---

## 4. Simplification (touch-driven, not a rewrite)

- **#1 auth/tenant prologue copy-pasted ~60×** — no `requireOrgContext()` helper anywhere; `"Not authenticated"` string appears 115×. Add helper in `lib/supabase/server.ts` returning `{supabase,user,orgId}|{error}`. Removes ~250-300 lines **and makes the security fixes enforceable in one place** — do this alongside §1.
- **Inconsistent action result shape** — `{error}` ×198, `{success:true}` ×177, `{success:false,error}` ×7, plus 29 `throw` in server code. CLAUDE.md mandates one shape. Add `ActionResult<T>` type.
- **3 client data-fetching styles** in the same admin dir (react-query mounted globally but 15 files hand-roll `setLoading`, 32 use `useEffect`). Declare react-query standard; migrate on touch.
- **Custom-field rendering duplicated** despite existing `DynamicFieldRenderer`; `ItemForm`/`EditItemForm` ~70% clones (~-300 lines). Repeated helpers: `formatDate` ×5 (util exists), `slugify` ×3, property-by-slug lookup ×13 (child pages refetch what layout already has), 31 hand-rolled `fixed inset-0` modals (no `Modal` primitive), LLM setup duplicated 4× in `ai-context/actions.ts`.
- **Largest files needing split:** `onboard/page.tsx` (1688 ln, ~30 useState — split by wizard step + `useReducer`), `admin/access/page.tsx` (970, 3 features), `LayoutEditor.tsx` (839), `HomeMapView.tsx` (533, extract `useGeoLayers`).
- **Healthy (no action):** stores/Dexie layer lean, sync engine cleanly decoupled from UI, invite/image logic already shared.

---

## 5. Testing / CI

- **Deploy ungated (Critical)** — `deploy.yml` ships to Vercel prod on push to *any* branch with no `needs: ci/e2e`. Broken build deploys.
- **RLS effectively untested (Critical)** — 152 policies, 1 manual non-asserting SQL file, not in CI. #1 data-leak risk for multi-tenant. → pgTAP tenant-isolation matrix in CI.
- **5 highest-risk untested modules:** `onboard/actions.ts` (438), `lib/supabase/middleware.ts` (417), admin `members`/`roles`/`access` actions, `domains/actions.ts`. All are the security surfaces from §1.
- **No `concurrency:` cancellation** + `push:['*']` → every PR double-runs CI/e2e/deploy. `ci.yml` uses `npm install` (no lockfile enforce, no cache); Playwright browsers re-downloaded each run.
- **Test quality good** — behavior-style, no snapshots, sane mock boundaries. ~7 type-shape filler tests, 5 `waitForTimeout` flake seeds (retries=2 masks).
- **For agent self-verify:** add `npm run verify` = `type-check && lint && vitest run` (fast, deterministic, no DB — pieces exist, no single command).

---

## Prioritized next steps

### P0 — Unblock delivery (nothing else matters until this works)
1. **Give the nightly environment write access** — fine-grained PAT/GitHub App (`contents:write`+`pull_requests:write`) + `gh` CLI, or run agents that **clone** (not mount) the repo to sandbox-local disk (05-20 report proved `/tmp` clone works). New contract: fresh clone → branch → commit → push → `gh pr create`; **PR is the only deliverable; never emit `.patch` at root.**
2. **Cross-run ledger** — `memory/context/scheduled-task-ledger.md` (tracked): one line per run (date, issue#, outcome, branch/PR). Agent reads before triage, comments on the GitHub issue when starting (= distributed lock), appends after. Kills the #279-solved-4× waste.
3. **`.gitignore` + one-time sweep** — add `*.patch`, `SCHEDULED-TASK-REPORT-*.md`, `triage-report-*.md`, `*-pr-body.md`, `.tmp-*`, `.claude/worktrees/`, `.claude/scheduled_tasks.lock`, `/public/sw.js`. Delete root litter; land stranded icon ADR; drop stale stashes/locks.
4. **`scripts/agent-cleanup.sh` janitor** run at **start** of each nightly (start-of-run survives crashed predecessors): prune/force-remove phantom worktrees, delete zero-commit `scheduled/*`+`fix/*` branches, steal stale PID-dead lock.

### P1 — Security (before any public/marketing launch)
5. Fix **C1 setup.ts** (anon→admin) — highest severity, self-contained.
6. Fix **C2 geo-layer service actions** + **C3 photo moderation** (merge PR #327 after fixing its Migration Dry Run check — stale 8 weeks).
7. Add **`requireOrgContext()` helper** (§4 #1) and route the unauth'd domain/communications/ai-context actions + SSRF through it. Two-for-one with the simplification win.
8. **Repair `node_modules`** so `type-check`/`test`/build pass locally (currently red locally, green CI — divergence is itself a risk).
9. **RLS pass** — visibility/anon-scope fixes (vault_items, geo_layers, entities, maintenance, storage buckets) + `SET search_path` on SECURITY DEFINER fns.
10. **Gate `deploy.yml`** on CI + smoke e2e; add `concurrency:` to all workflows.

### P2 — Verification gates → enable *long* unattended loops
11. `npm run verify` single command + document pre-PR e2e (`test:e2e:smoke`). Add `Stop`/`SessionEnd` hook calling `agent-cleanup.sh --verify-clean` that fails loudly on leftover litter.
12. **pgTAP RLS tenant-isolation tests in CI** (org A can't read org B) — the real backstop for autonomous multi-tenant changes.
13. Add `app/global-error.tsx`; regenerate `Database` types; fix visual-test `testMatch`.
14. Once 10–12 hold: opt-in `gh pr merge --auto --squash` for `risk:low` issues → true hands-off loop.

### P3 — MVP product blockers (parallel track, product not infra)
15. Offline reliability (#148, #313, #276) — offline is a stated pillar; sync-engine data-loss bugs in §1 are the structural fix.
16. Public-contributor flow (#217, #326) — stated growth wedge, only anon form exists today.
17. Feature-gate enforcement (#206) — `resolveOrgFeatures` has zero call sites; tiering is fiction until wired.
18. Billing decision — 4 tiers modeled, no payment path. Wire Stripe or declare free-tier MVP explicitly (no ADR either way currently).

### P4 — Cleanup (batch when convenient)
19. Delete 9 dead files + 4 deps + `public/sw.js` cached; knip unused-exports PR; simplification items §4 on touch.

---

*Full per-agent reports (with complete Medium/Low lists) are in this session's transcript. The `/setup` anon-escalation, photo-moderation bypass, and stale-delivery-pipeline findings each corroborated across multiple independent agents.*
