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

  // --- Auth checks (only for protected routes) ---
  const isProtectedRoute =
    pathname.startsWith('/manage') ||
    pathname.startsWith('/admin');

  if (!isProtectedRoute) {
    return supabaseResponse;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  // Check admin role for /admin routes
  if (pathname.startsWith('/admin')) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      const url = request.nextUrl.clone();
      url.pathname = '/manage';
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
