import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { PlatformShell } from './PlatformShell';

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Defense-in-depth: middleware already checks this, but guard here too
  const { data: profile } = await supabase
    .from('users')
    .select('is_platform_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_platform_admin) {
    redirect('/');
  }

  return (
    <PlatformShell userEmail={user.email ?? ''}>
      {children}
    </PlatformShell>
  );
}
