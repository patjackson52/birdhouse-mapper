/** Check if Google Photos integration is configured */
export function isGooglePhotosConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID &&
    process.env.NEXT_PUBLIC_GOOGLE_API_KEY
  );
}

const PICKER_API_URL = 'https://apis.google.com/js/api.js';
const GIS_URL = 'https://accounts.google.com/gsi/client';
const PHOTOS_SCOPE = 'https://www.googleapis.com/auth/photoslibrary.readonly';

let pickerApiLoaded = false;
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

/** Load Google Picker API */
async function loadPickerApi(): Promise<void> {
  if (pickerApiLoaded) return;
  await loadScript(PICKER_API_URL);
  await new Promise<void>((resolve) => {
    (window as any).gapi.load('picker', { callback: resolve });
  });
  pickerApiLoaded = true;
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
function requestAccessToken(): Promise<string> {
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

export interface PickerResult {
  url: string;
  name: string;
  mimeType: string;
  token?: string; // OAuth access token — included when using popup flow
}

/** Open Google Picker for Photos and return selected items */
export async function openGooglePhotosPicker(maxFiles: number): Promise<PickerResult[]> {
  await Promise.all([loadPickerApi(), loadGis()]);

  const accessToken = await requestAccessToken();
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY!;

  return new Promise((resolve) => {
    const google = (window as any).google;
    const picker = new google.picker.PickerBuilder()
      .addView(
        new google.picker.PhotosView()
          .setType(google.picker.PhotosView.Type.FLAT)
      )
      .addView(
        new google.picker.PhotoAlbumsView()
      )
      .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
      .setMaxItems(maxFiles)
      .setOAuthToken(accessToken)
      .setDeveloperKey(apiKey)
      .setCallback((data: any) => {
        if (data.action === google.picker.Action.PICKED) {
          const results: PickerResult[] = data.docs.map((doc: any) => ({
            url: doc.url,
            name: doc.name || 'photo.jpg',
            mimeType: doc.mimeType || 'image/jpeg',
          }));
          resolve(results);
        } else if (data.action === google.picker.Action.CANCEL) {
          resolve([]);
        }
      })
      .build();

    picker.setVisible(true);
  });
}
