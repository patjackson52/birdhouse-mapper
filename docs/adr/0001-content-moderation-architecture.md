# ADR-0001: Content Moderation Architecture

**Status:** Accepted

**Date:** 2026-04-15

**Owners:** @patjackson52

## Context

FieldMapper is adding public contributions — unauthenticated users can submit photos from the public map. This opens the application to abuse (spam, NSFW content, offensive text). We need a moderation system that is effective, simple to maintain, and cost-efficient at low volume.

## Decision

Use a **synchronous server action pipeline** with **OpenAI's free omni-moderation API** as the sole automated moderation layer. All public uploads go through a staging flow (vault-private bucket) and are never publicly accessible until moderation completes.

Key choices:

1. **Server actions over Edge Functions** — Moderation runs inline in the existing `uploadToVault()` server action. No new deployment pipeline, no webhook wiring, no additional infrastructure.

2. **OpenAI omni-moderation as the single AI layer** — Free, handles both images and text, sufficient for current scale. Heavier tools (PhotoDNA, AWS Rekognition, Hive) are deferred.

3. **Existing vault-private bucket as staging** — No new bucket. Pending items live in `vault-private` and move to `vault-public` on approval.

4. **Existing anonymous auth for public contributors** — Extends the Supabase anonymous sign-in system with a new `public_contributor` role rather than introducing a second auth pathway.

5. **Fail closed** — If the OpenAI API is unavailable, content is queued for manual review (never auto-approved).

## Alternatives Considered

- **Edge Function pipeline (from issue #221 spec)** — Staging bucket -> DB webhook -> Supabase Edge Function -> multi-vendor AI. More scalable but adds Deno Edge Function deployment, webhook wiring, and cold start latency. Over-engineered for current volume.

- **Async queue with pg_cron** — Upload instantly, moderate in background. Better UX (no upload latency) but adds pg_cron dependency, polling/realtime for status updates, and more failure modes.

- **Full multi-vendor stack (PhotoDNA + Rekognition + Hive)** — Enterprise-grade CSAM/NSFW detection. Required at scale but unnecessary for a niche conservation tool with <5K uploads/month. Can be layered on later without changing the data model.

## Decision Drivers

- **Simplicity** — Matches existing server action patterns, single deploy, minimal new infrastructure
- **Cost** — OpenAI moderation is free; no paid services required for v1
- **Safety** — Fail-closed design ensures no content goes public without a check
- **Extensibility** — Data model and pipeline structure support adding moderation layers later
- **Time to ship** — Can be implemented without learning new deployment tools (Deno, webhooks)

## Consequences

**Positive:**
- Zero additional infrastructure cost
- Single deploy pipeline (same as rest of app)
- Easy to debug (server action logs, no async gaps)
- Clean upgrade path to more sophisticated moderation

**Negative:**
- Synchronous moderation adds 1-2s latency to uploads (acceptable for submission flow)
- No CSAM hash matching in v1 (legal obligation if platform grows significantly)
- Single point of failure on OpenAI API (mitigated by fail-closed to manual review)

**Neutral:**
- Rate limiting is per-anonymous-session, not per-IP. Determined abusers can clear cookies, but moderation still catches bad content.

## Related Files

- `docs/content-safety.md` — Feature documentation
- `docs/superpowers/specs/2026-04-15-content-safety-design.md` — Design spec
- `src/lib/moderation/moderate.ts` — OpenAI moderation wrapper
- `src/lib/vault/actions.ts` — Moderation pipeline in uploadToVault
- `supabase/migrations/043_content_safety.sql` — Database schema

## Related Issues / PRs

- #221
- #252

## Tags

`moderation`, `security`, `public-contributions`, `openai`
