import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?redirect=/account');
  }

  return (
    <div className="min-h-screen bg-parchment">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="font-heading text-2xl font-semibold text-forest-dark mb-6">Account</h1>
        {children}
      </div>
    </div>
  );
}
