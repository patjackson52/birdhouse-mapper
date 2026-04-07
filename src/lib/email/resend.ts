import { Resend } from 'resend';
import { createServiceClient } from '@/lib/supabase/server';
import { renderNotificationEmail } from './templates/NotificationEmail';
import { sign } from './unsubscribe-token';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_ADDRESS = process.env.EMAIL_FROM_ADDRESS || 'notifications@fieldmapper.com';

export async function sendNotificationEmail(input: {
  userId: string;
  orgId: string;
  topicId: string;
  title: string;
  body: string;
  link: string | null;
}): Promise<void> {
  const supabase = createServiceClient();

  const { data: authUser } = await supabase.auth.admin.getUserById(input.userId);
  if (!authUser?.user?.email) throw new Error('User email not found');

  const { data: org } = await supabase
    .from('orgs')
    .select('name, logo_url, theme')
    .eq('id', input.orgId)
    .single();

  const unsubscribeToken = sign({ userId: input.userId, topicId: input.topicId });
  const unsubscribeUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/unsubscribe?token=${unsubscribeToken}`;

  const html = renderNotificationEmail({
    orgName: org?.name ?? 'FieldMapper',
    orgLogoUrl: org?.logo_url ?? null,
    title: input.title,
    body: input.body,
    ctaUrl: input.link,
    unsubscribeUrl,
  });

  await resend.emails.send({
    from: `${org?.name ?? 'FieldMapper'} <${FROM_ADDRESS}>`,
    to: authUser.user.email,
    subject: input.title,
    html,
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  });
}
