import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_HOSTS = [
  'lh3.googleusercontent.com',
  'lh4.googleusercontent.com',
  'lh5.googleusercontent.com',
  'lh6.googleusercontent.com',
  'photos.google.com',
  'video.google.com',
  'lh3.google.com',
  'video.googleusercontent.com',
];

export async function POST(request: NextRequest) {
  let body: { url?: string; token?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { url, token } = body;

  if (!url) {
    return NextResponse.json({ error: 'Missing required parameter: url' }, { status: 400 });
  }
  if (!token) {
    return NextResponse.json({ error: 'Missing required parameter: token' }, { status: 400 });
  }

  // Validate URL is from Google
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  if (!ALLOWED_HOSTS.includes(parsedUrl.hostname)) {
    return NextResponse.json(
      { error: 'Only Google Photos URLs are allowed' },
      { status: 400 }
    );
  }

  // Fetch the image from Google using the OAuth token
  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Google returned ${response.status}` },
        { status: 502 }
      );
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const imageBuffer = await response.arrayBuffer();

    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to fetch image from Google' },
      { status: 502 }
    );
  }
}
