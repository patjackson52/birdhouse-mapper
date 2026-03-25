import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const { origin } = requestUrl;
  const code = requestUrl.searchParams.get('code');
  const context = requestUrl.searchParams.get('context');
  const next = requestUrl.searchParams.get('next') ?? '/manage';

  if (code) {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
            try {
              cookiesToSet.forEach(({ name, value, options }: { name: string; value: string; options: CookieOptions }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // Ignore cookie errors in Server Component context
            }
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      if (context === 'platform') {
        // Check if user has an org membership
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
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
        }
        // No org — redirect to onboard
        return NextResponse.redirect(new URL('/onboard', origin));
      }

      // Existing behavior — redirect to next (default /manage)
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  // Error redirect
  const errorRedirect = context === 'platform' ? '/signin' : '/login';
  return NextResponse.redirect(new URL(`${errorRedirect}?error=auth`, origin));
}
