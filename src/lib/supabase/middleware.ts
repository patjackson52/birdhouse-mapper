import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { resolveTenant } from '@/lib/tenant/resolve';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }: { name: string; value: string }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }: { name: string; value: string; options: CookieOptions }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const pathname = request.nextUrl.pathname;

  // --- Tenant resolution (Step 0) ---
  // Service-role client for tenant resolution (bypasses RLS on custom_domains)
  const tenantClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const hostname = request.headers.get('host') ?? 'localhost';
  const tenant = await resolveTenant(hostname, pathname, tenantClient);

  if (!tenant) {
    const url = request.nextUrl.clone();
    url.pathname = '/not-found';
    return NextResponse.rewrite(url);
  }

  // Platform context — handle entirely here, then return early
  if (tenant?.source === 'platform') {
    // Refresh session
    const { data: { user } } = await supabase.auth.getUser();

    const isPlatformAuthRoute = ['/signup', '/signin'].includes(pathname);
    const isOnboard = pathname === '/onboard' || pathname.startsWith('/onboard');
    const isRoot = pathname === '/';
    const isAuthCallback = pathname.startsWith('/api/auth/');
    const isStaticAsset = pathname.startsWith('/_next/') || pathname.startsWith('/favicon');

    // Always pass through static assets and auth callbacks
    if (isStaticAsset || isAuthCallback) {
      supabaseResponse.headers.set('x-tenant-source', 'platform');
      return supabaseResponse;
    }

    // Onboard requires auth
    if (isOnboard && !user) {
      return NextResponse.redirect(new URL('/signup', request.url));
    }

    // Authenticated user on root — route to org or onboard
    if (isRoot && user) {
      const { data: membership } = await supabase
        .from('org_memberships')
        .select('orgs(slug)')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .single();

      const orgSlug = (membership?.orgs as any)?.slug;
      if (orgSlug) {
        const platformDomain = process.env.PLATFORM_DOMAIN;
        return NextResponse.redirect(
          new URL(`https://${orgSlug}.${platformDomain}/manage`)
        );
      }
      return NextResponse.redirect(new URL('/onboard', request.url));
    }

    // All other platform routes (/, /signup, /signin, /onboard with auth) — pass through
    supabaseResponse.headers.set('x-tenant-source', 'platform');
    // Set cookie so client components (Navigation) can detect platform context
    supabaseResponse.cookies.set('x-tenant-source', 'platform', {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });
    return supabaseResponse;
  }

  // Inject tenant context as headers for server components
  supabaseResponse.headers.set('x-org-id', tenant.orgId);
  supabaseResponse.headers.set('x-org-slug', tenant.orgSlug);
  // Clear platform cookie in org context (in case user navigated from platform domain)
  supabaseResponse.cookies.delete('x-tenant-source');
  supabaseResponse.headers.set('x-tenant-source', tenant.source);
  if (tenant.propertyId) supabaseResponse.headers.set('x-property-id', tenant.propertyId);
  if (tenant.propertySlug) supabaseResponse.headers.set('x-property-slug', tenant.propertySlug);

  // --- QR code redirect handler ---
  if (pathname.startsWith('/go/')) {
    const slug = pathname.slice(4); // strip "/go/"
    if (slug) {
      const { data } = await supabase
        .from('redirects')
        .select('destination_url')
        .eq('slug', slug)
        .single();

      if (data?.destination_url) {
        // Increment scan count in the background (fire-and-forget)
        supabase.rpc('increment_scan_count', { slug_param: slug });
        return NextResponse.redirect(data.destination_url, 302);
      }
    }
    // Slug not found — return 404
    const url = request.nextUrl.clone();
    url.pathname = '/not-found';
    return NextResponse.rewrite(url);
  }

  // --- Setup complete check ---
  const isSetupRoute = pathname === '/setup' || pathname.startsWith('/setup/');
  const isAuthCallback = pathname.startsWith('/api/auth/');
  const isStaticAsset = pathname.startsWith('/_next/');

  if (!isSetupRoute && !isAuthCallback && !isStaticAsset) {
    const setupDoneCookie = request.cookies.get('setup_done');

    if (!setupDoneCookie) {
      // Check database for setup_complete
      // Use tenantClient (service-role) since this runs for unauthenticated users
      const { data } = await tenantClient
        .from('orgs')
        .select('setup_complete')
        .eq('id', tenant.orgId)
        .single();

      const setupComplete = data?.setup_complete === true;

      if (setupComplete) {
        // Set cookie so we don't check DB on every request
        supabaseResponse.cookies.set('setup_done', 'true', {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 365, // 1 year
        });
      } else {
        // Redirect to setup
        const url = request.nextUrl.clone();
        url.pathname = '/setup';
        return NextResponse.redirect(url);
      }
    }
  }

  // --- Session refresh (all routes) ---
  // Always call getUser() to keep Supabase session cookies fresh,
  // per Supabase SSR docs recommendation.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // --- Auth checks (only for protected routes) ---
  const isProtectedRoute =
    pathname.startsWith('/manage') ||
    pathname.startsWith('/admin');

  if (!isProtectedRoute) {
    return supabaseResponse;
  }

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  // Single combined profile query for admin + temp status
  const { data: profile } = await supabase
    .from('users')
    .select('is_platform_admin, is_temporary, session_expires_at, invite_id')
    .eq('id', user.id)
    .single();

  // Temp user session expired — sign out and redirect
  if (
    profile?.is_temporary &&
    profile.session_expires_at &&
    new Date(profile.session_expires_at) < new Date()
  ) {
    // Check if invite was convertible (for session-expired page message)
    let convertible = false;
    if (profile.invite_id) {
      const { data: invite } = await supabase
        .from('invites')
        .select('convertible')
        .eq('id', profile.invite_id)
        .single();
      convertible = invite?.convertible ?? false;
    }

    await supabase.auth.signOut();
    const url = request.nextUrl.clone();
    url.pathname = '/session-expired';
    if (convertible) url.searchParams.set('convertible', 'true');
    return NextResponse.redirect(url);
  }

  // Temp users cannot access admin routes
  if (profile?.is_temporary && pathname.startsWith('/admin')) {
    const url = request.nextUrl.clone();
    url.pathname = '/manage';
    return NextResponse.redirect(url);
  }

  // Non-admin users cannot access admin routes
  if (pathname.startsWith('/admin')) {
    let isAdmin = profile?.is_platform_admin ?? false;
    if (!isAdmin) {
      const { data } = await supabase
        .from('org_memberships')
        .select('id, roles!inner(base_role)')
        .eq('user_id', user.id)
        .eq('org_id', tenant.orgId)
        .eq('status', 'active')
        .eq('roles.base_role', 'org_admin')
        .limit(1);
      isAdmin = (data?.length ?? 0) > 0;
    }
    if (!isAdmin) {
      const url = request.nextUrl.clone();
      url.pathname = '/manage';
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
