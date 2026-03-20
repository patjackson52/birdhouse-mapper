import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

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

  // --- Setup complete check ---
  const pathname = request.nextUrl.pathname;
  const isSetupRoute = pathname === '/setup' || pathname.startsWith('/setup/');
  const isAuthCallback = pathname.startsWith('/api/auth/');
  const isStaticAsset = pathname.startsWith('/_next/');

  if (!isSetupRoute && !isAuthCallback && !isStaticAsset) {
    const setupDoneCookie = request.cookies.get('setup_done');

    if (!setupDoneCookie) {
      // Check database for setup_complete
      const { data } = await supabase
        .from('site_config')
        .select('value')
        .eq('key', 'setup_complete')
        .single();

      const setupComplete = data?.value === true;

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

  // Single combined profile query for role + temp status
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_temporary, session_expires_at, invite_id')
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
  if (pathname.startsWith('/admin') && (!profile || profile.role !== 'admin')) {
    const url = request.nextUrl.clone();
    url.pathname = '/manage';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
