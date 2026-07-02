import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getTenantContext } from '@/lib/tenant/server';

/**
 * Shared authentication/authorization prologue for server actions.
 *
 * Before this existed the same ~5-line prologue (`createClient` +
 * `auth.getUser()` + `getTenantContext()` + null checks) was copy-pasted
 * across ~60 server actions, and the admin variant was re-implemented per
 * file — several of those copies forgot to scope the `org_memberships`
 * lookup by `org_id`, so an admin of *any* org passed the check (the
 * cross-org-admin bug from the 2026-07-02 audit). Routing everything
 * through these helpers fixes that in one place.
 *
 * Both helpers FAIL CLOSED: on any missing precondition they return
 * `{ error }` (never throw, never fall through to a privileged path).
 * Callers narrow with `isAuthFailure(result)`.
 */

type SupabaseServerClient = ReturnType<typeof createClient>;
type Tenant = Awaited<ReturnType<typeof getTenantContext>>;

export interface OrgContext {
  supabase: SupabaseServerClient;
  user: User;
  tenant: Tenant;
  /** Non-null — narrowed from `tenant.orgId` by the guard above. */
  orgId: string;
}

export interface AuthFailure {
  error: string;
}

export function isAuthFailure(
  result: OrgContext | AuthFailure
): result is AuthFailure {
  return 'error' in result;
}

/**
 * Require an authenticated user within a resolved org context.
 * Returns the Supabase client, the user, the tenant, and a non-null `orgId`.
 */
export async function requireOrgContext(): Promise<OrgContext | AuthFailure> {
  const supabase = createClient();
  const tenant = await getTenantContext();
  if (!tenant.orgId) return { error: 'No org context' };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  return { supabase, user, tenant, orgId: tenant.orgId };
}

/**
 * Require the caller to be an admin of the CURRENT org: either a platform
 * admin, or an active `org_admin` member **of this tenant's org**. The
 * `.eq('org_id', orgId)` scoping is the fix for the cross-org-admin bug —
 * without it, being org_admin of any org anywhere passes.
 */
export async function requireOrgAdmin(): Promise<OrgContext | AuthFailure> {
  const ctx = await requireOrgContext();
  if (isAuthFailure(ctx)) return ctx;

  const { supabase, user, orgId } = ctx;

  // Platform admins bypass org membership.
  const { data: userRow } = await supabase
    .from('users')
    .select('is_platform_admin')
    .eq('id', user.id)
    .single();

  if (userRow?.is_platform_admin) return ctx;

  const { data } = await supabase
    .from('org_memberships')
    .select('id, roles!inner(base_role)')
    .eq('user_id', user.id)
    .eq('org_id', orgId)
    .eq('status', 'active')
    .eq('roles.base_role', 'org_admin')
    .limit(1);

  if ((data?.length ?? 0) === 0) return { error: 'Admin access required' };

  return ctx;
}
