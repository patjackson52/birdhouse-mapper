/** Check if Google Photos integration is configured */
export function isGooglePhotosConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
}

/**
 * Build the Google Photos picker popup URL.
 *
 * On custom domains, the popup opens on the platform domain so only one
 * JavaScript origin needs to be registered in Google Cloud Console.
 * On localhost, Vercel previews, or when already on the platform domain,
 * use a relative path to avoid cross-origin issues.
 */
export function getGooglePhotosPickerUrl(maxFiles: number, platformDomain: string | null): string {
  if (typeof window === 'undefined') return `/google-photos-picker?maxFiles=${maxFiles}`;

  const currentHost = window.location.hostname;
  const isLocalhost = currentHost === 'localhost' || currentHost === '127.0.0.1';
  const isVercelPreview = currentHost.endsWith('.vercel.app') && currentHost !== platformDomain;
  const isOnPlatformDomain = platformDomain && currentHost === platformDomain;

  if (isLocalhost || isVercelPreview || isOnPlatformDomain || !platformDomain) {
    return `/google-photos-picker?maxFiles=${maxFiles}`;
  }

  // Custom domain — open popup on the platform domain
  const protocol = platformDomain.includes('localhost') ? 'http' : 'https';
  return `${protocol}://${platformDomain}/google-photos-picker?maxFiles=${maxFiles}`;
}

const GIS_URL = 'https://accounts.google.com/gsi/client';
const PICKER_API_BASE = 'https://photospicker.googleapis.com/v1';
const PHOTOS_SCOPE = 'https://www.googleapis.com/auth/photospicker.mediaitems.readonly';

let gisLoaded = false;

/** Load a script tag dynamically, resolves when loaded */
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
}

/** Load Google Identity Services */
async function loadGis(): Promise<void> {
  if (gisLoaded) return;
  await loadScript(GIS_URL);
  gisLoaded = true;
}

let lastAccessToken: string | null = null;

/** Get the last OAuth access token obtained during this session */
export function getAccessToken(): string | null {
  return lastAccessToken;
}

/** Request an OAuth access token via Google Identity Services */
export async function requestAccessToken(): Promise<string> {
  await loadGis();
  return new Promise((resolve, reject) => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!;
    const tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: PHOTOS_SCOPE,
      callback: (response: any) => {
        if (response.error) {
          reject(new Error(response.error));
          return;
        }
        lastAccessToken = response.access_token;
        resolve(response.access_token);
      },
    });
    tokenClient.requestAccessToken();
  });
}

/* ------------------------------------------------------------------ */
/*  Google Photos Picker API (session-based)                          */
/* ------------------------------------------------------------------ */

export interface PickerSession {
  id: string;
  pickerUri: string;
  pollingConfig: {
    pollInterval: string; // e.g. "2s"
    timeoutIn: string;    // e.g. "600s"
  };
  mediaItemsSet: boolean;
}

export interface PickedMediaItem {
  id: string;
  type: 'PHOTO' | 'VIDEO';
  createTime?: string;
  mediaFile: {
    baseUrl: string;
    mimeType: string;
    filename: string;
    mediaFileMetadata?: {
      width: number;
      height: number;
    };
  };
}

/** Create a new picker session */
export async function createSession(
  token: string,
  maxItems: number
): Promise<PickerSession> {
  const res = await fetch(`${PICKER_API_BASE}/sessions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      pickingConfig: { maxItemCount: String(maxItems) },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create session: ${res.status} ${text}`);
  }
  return res.json();
}

/** Poll session status */
export async function getSession(
  token: string,
  sessionId: string
): Promise<PickerSession> {
  const res = await fetch(`${PICKER_API_BASE}/sessions/${sessionId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to get session: ${res.status}`);
  }
  return res.json();
}

/** List selected media items (handles pagination) */
export async function listMediaItems(
  token: string,
  sessionId: string
): Promise<PickedMediaItem[]> {
  const items: PickedMediaItem[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({ sessionId, pageSize: '100' });
    if (pageToken) params.set('pageToken', pageToken);

    const res = await fetch(`${PICKER_API_BASE}/mediaItems?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error(`Failed to list media items: ${res.status}`);
    }
    const data = await res.json();
    if (data.mediaItems) items.push(...data.mediaItems);
    pageToken = data.nextPageToken;
  } while (pageToken);

  return items;
}

/** Delete a session (best-effort cleanup) */
export async function deleteSession(
  token: string,
  sessionId: string
): Promise<void> {
  await fetch(`${PICKER_API_BASE}/sessions/${sessionId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {}); // best-effort
}

/** Parse a duration string like "2s" or "600s" into milliseconds */
export function parseDuration(d: string): number {
  const match = d.match(/^(\d+(?:\.\d+)?)s$/);
  return match ? parseFloat(match[1]) * 1000 : 5000;
}
