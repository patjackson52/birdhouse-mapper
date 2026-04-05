import { createClient } from '@/lib/supabase/server';

export default async function ProfilePage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="card p-6">
      <h2 className="font-heading text-lg font-semibold text-forest-dark mb-4">Profile</h2>
      <div className="space-y-3">
        <div>
          <span className="label">Email</span>
          <p className="text-sm text-gray-700">{user?.email ?? 'Unknown'}</p>
        </div>
        <div>
          <span className="label">Member since</span>
          <p className="text-sm text-gray-700">
            {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown'}
          </p>
        </div>
      </div>
    </div>
  );
}
