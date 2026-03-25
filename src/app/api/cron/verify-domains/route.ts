import { createClient } from '@supabase/supabase-js';
import { checkDomainOnVercel } from '@/lib/domains/vercel';

function createServiceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const FAILURE_TIMEOUT_HOURS = 72;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabase = createServiceRoleClient();

  // Fetch all domains pending verification
  const { data: pendingDomains, error } = await supabase
    .from('custom_domains')
    .select('id, domain, created_at')
    .eq('status', 'verifying');

  if (error || !pendingDomains) {
    return Response.json({ error: error?.message ?? 'No data' }, { status: 500 });
  }

  let activated = 0;
  let failed = 0;
  let stillPending = 0;

  for (const row of pendingDomains) {
    try {
      const vercelStatus = await checkDomainOnVercel(row.domain);

      if (!vercelStatus) {
        // Domain not found on Vercel — mark as failed
        await supabase.from('custom_domains')
          .update({ status: 'failed', last_checked_at: new Date().toISOString() })
          .eq('id', row.id);
        failed++;
        continue;
      }

      if (vercelStatus.verified) {
        // Domain verified — activate
        await supabase.from('custom_domains')
          .update({
            status: 'active',
            verified_at: new Date().toISOString(),
            last_checked_at: new Date().toISOString(),
          })
          .eq('id', row.id);
        activated++;
      } else {
        // Still pending — check if it's been too long
        const createdAt = new Date(row.created_at);
        const hoursElapsed = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);

        if (hoursElapsed > FAILURE_TIMEOUT_HOURS) {
          await supabase.from('custom_domains')
            .update({ status: 'failed', last_checked_at: new Date().toISOString() })
            .eq('id', row.id);
          failed++;
        } else {
          await supabase.from('custom_domains')
            .update({ last_checked_at: new Date().toISOString() })
            .eq('id', row.id);
          stillPending++;
        }
      }
    } catch (err) {
      // Skip this domain on API error, try again next cron run
      stillPending++;
    }
  }

  return Response.json({
    checked: pendingDomains.length,
    activated,
    failed,
    stillPending,
  });
}
