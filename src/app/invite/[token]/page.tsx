import { createClient } from '@/lib/supabase/server';
import { validateInviteToken } from './actions';
import InviteClaimForm from './InviteClaimForm';
import Footer from '@/components/layout/Footer';
import Link from 'next/link';

export default async function InvitePage({
  params,
}: {
  params: { token: string };
}) {
  // Check if already authenticated
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from('users')
      .select('display_name')
      .eq('id', user.id)
      .single();

    return (
      <div className="pb-20 md:pb-0">
        <div className="min-h-[calc(100vh-10rem)] flex items-center justify-center px-4">
          <div className="w-full max-w-sm text-center">
            <span className="text-4xl mb-3 block">👤</span>
            <h1 className="font-heading text-xl font-semibold text-forest-dark mb-2">
              Already Signed In
            </h1>
            <p className="text-sm text-sage mb-6">
              You&apos;re signed in as {profile?.display_name || 'a user'}.
            </p>
            <Link href="/manage" className="btn-primary inline-block">
              Go to Dashboard
            </Link>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  const result = await validateInviteToken(params.token);

  if (!result.valid) {
    return (
      <div className="pb-20 md:pb-0">
        <div className="min-h-[calc(100vh-10rem)] flex items-center justify-center px-4">
          <div className="w-full max-w-sm text-center">
            <span className="text-4xl mb-3 block">
              {result.reason === 'expired' ? '⏰' : '🔒'}
            </span>
            <h1 className="font-heading text-xl font-semibold text-forest-dark mb-2">
              {result.reason === 'expired'
                ? 'Invite Expired'
                : result.reason === 'already_claimed'
                ? 'Invite Already Used'
                : 'Invite Not Found'}
            </h1>
            <p className="text-sm text-sage mb-6">
              {result.reason === 'expired'
                ? 'This invite link is no longer valid. Ask your organizer for a new one.'
                : result.reason === 'already_claimed'
                ? 'This invite has already been claimed. Ask your organizer for a new one.'
                : 'This invite could not be found. Check the link and try again.'}
            </p>
            <Link href="/" className="btn-primary inline-block">
              View the Map
            </Link>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="pb-20 md:pb-0">
      <div className="min-h-[calc(100vh-10rem)] flex items-center justify-center px-4">
        <InviteClaimForm
          token={params.token}
          displayName={result.invite!.display_name}
          sessionExpiresAt={result.invite!.session_expires_at}
          roleName={result.invite!.role_name}
          capabilities={result.invite!.capabilities}
        />
      </div>
      <Footer />
    </div>
  );
}
