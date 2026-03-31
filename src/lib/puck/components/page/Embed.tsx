import type { EmbedProps } from '../../types';
import { isAllowedEmbedUrl } from '../../schemas';

export function Embed({ url, height, title }: EmbedProps) {
  if (!url || !isAllowedEmbedUrl(url)) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-4">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center text-sm text-red-600">
          Embed URL not allowed. Supported: YouTube, Vimeo, Google Maps, Spotify.
        </div>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-4xl px-4 py-4">
      <iframe src={url} title={title} height={height} className="w-full rounded-lg border-0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen loading="lazy" />
    </div>
  );
}
