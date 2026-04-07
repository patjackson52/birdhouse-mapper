// src/app/api/unsubscribe/route.ts
import { NextResponse } from 'next/server';
import { verify } from '@/lib/email/unsubscribe-token';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  const unsubAll = url.searchParams.get('all') === 'true';

  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  }

  const payload = verify(token);
  if (!payload) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 400 });
  }

  const supabase = createServiceClient();

  if (unsubAll) {
    // Disable email for all subscriptions
    await supabase
      .from('user_subscriptions')
      .update({ email_enabled: false })
      .eq('user_id', payload.userId);
  } else {
    // Disable email for this specific topic
    await supabase
      .from('user_subscriptions')
      .update({ email_enabled: false })
      .eq('user_id', payload.userId)
      .eq('topic_id', payload.topicId);
  }

  // Return a simple HTML confirmation page
  const html = `<!DOCTYPE html>
<html><head><title>Unsubscribed</title></head>
<body style="font-family:sans-serif;text-align:center;padding:60px 20px;">
  <h1 style="font-size:24px;color:#1a1a1a;">You've been unsubscribed</h1>
  <p style="color:#666;">
    ${unsubAll
      ? 'You will no longer receive email notifications.'
      : 'You will no longer receive email notifications for this topic.'
    }
  </p>
  <p style="color:#999;font-size:14px;">You can manage your preferences anytime from your account settings.</p>
</body></html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html' },
  });
}

// Support RFC 8058 List-Unsubscribe-Post
export async function POST(request: Request) {
  return GET(request);
}
