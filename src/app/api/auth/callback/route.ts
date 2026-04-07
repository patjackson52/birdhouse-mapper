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
      // Process pending topic subscriptions from the subscribe flow
      const subscribeTopics = requestUrl.searchParams.get('subscribe_topics');
      if (subscribeTopics) {
        try {
          const topicIds: string[] = JSON.parse(subscribeTopics);
          if (Array.isArray(topicIds) && topicIds.length > 0) {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              const rows = topicIds.map((topic_id) => ({
                user_id: user.id,
                topic_id,
                email_enabled: true,
                in_app_enabled: true,
              }));
              await supabase
                .from('user_subscriptions')
                .upsert(rows, { onConflict: 'user_id,topic_id' });

              // Set cookie to suppress the subscribe prompt
              cookieStore.set('fm_prompt_subscribed', '1', {
                maxAge: 60 * 60 * 24 * 365, // 1 year
                path: '/',
                sameSite: 'lax',
              });
            }
          }
        } catch {
          // Ignore parse errors — don't block the auth flow
        }
      }

      if (context === 'platform') {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          // Platform admins go straight to /platform
          const { data: profile } = await supabase
            .from('users')
            .select('is_platform_admin')
            .eq('id', user.id)
            .single();

          if (profile?.is_platform_admin) {
            return NextResponse.redirect(new URL('/platform', origin));
          }

          // Check if user has an org membership
          const { data: membership } = await supabase
            .from('org_memberships')
            .select('orgs(slug, custom_domains(domain, is_primary))')
            .eq('user_id', user.id)
            .eq('status', 'active')
            .limit(1)
            .single();

          const org = (membership?.orgs as any);
          if (org?.slug) {
            const requestHost = new URL(request.url).hostname;
            // On localhost or Vercel preview, stay on the same origin —
            // subdomain/custom domain URLs won't point to the preview deployment
            const isPreviewOrLocal =
              requestHost === 'localhost' ||
              process.env.VERCEL_ENV === 'preview' ||
              process.env.VERCEL_ENV === 'development' ||
              (requestHost.endsWith('.vercel.app') && requestHost !== process.env.PLATFORM_DOMAIN);
            if (isPreviewOrLocal) {
              return NextResponse.redirect(new URL('/manage', origin));
            }
            // Prefer primary custom domain, fall back to platform subdomain
            const primaryDomain = org.custom_domains?.find((d: any) => d.is_primary)?.domain;
            if (primaryDomain) {
              return NextResponse.redirect(new URL(`https://${primaryDomain}/manage`));
            }
            const platformDomain = process.env.PLATFORM_DOMAIN;
            return NextResponse.redirect(
              new URL(`https://${org.slug}.${platformDomain}/manage`)
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
