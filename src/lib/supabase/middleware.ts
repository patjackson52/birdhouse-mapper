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
      // Find user's org and its primary custom domain (if any)
      const { data: membership } = await tenantClient
        .from('org_memberships')
        .select('orgs(slug, custom_domains(domain, is_primary))')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .single();

      const org = (membership?.orgs as any);
      if (org?.slug) {
        // Prefer the org's primary custom domain, fall back to platform subdomain
        const primaryDomain = org.custom_domains?.find((d: any) => d.is_primary)?.domain;
        if (primaryDomain) {
          return NextResponse.redirect(new URL(`https://${primaryDomain}/manage`));
        }
        const platformDomain = process.env.PLATFORM_DOMAIN;
        return NextResponse.redirect(
          new URL(`https://${org.slug}.${platformDomain}/manage`)
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
        .select('destination_url, property_id')
        .eq('slug', slug)
        .single();

      if (data) {
        // Build destination: if property_id is set, resolve to property landing page
        // Otherwise fall back to destination_url
        let destination = data.destination_url;
        if (data.property_id && tenant?.orgId) {
          // Redirect to the property's landing page on the current host
          const url = request.nextUrl.clone();
          url.pathname = '/';
          url.search = '';
          destination = url.toString();
        }

        // Hash IP for privacy-safe analytics (Web Crypto API for Edge Runtime)
        const forwarded = request.headers.get('x-forwarded-for');
        const ip = forwarded?.split(',')[0]?.trim() || 'unknown';
        const ipBytes = new TextEncoder().encode(ip);
        const hashBuffer = await crypto.subtle.digest('SHA-256', ipBytes);
        const ipHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
        const userAgent = request.headers.get('user-agent') || null;

        // Log scan in the background (fire-and-forget)
        supabase.rpc('log_scan', {
          slug_param: slug,
          user_agent_param: userAgent,
          ip_hash_param: ipHash,
        });

        return NextResponse.redirect(destination, 302);
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
