'use client';

import dynamic from 'next/dynamic';

interface MapSnippetBlockProps {
  latitude: number;
  longitude: number;
  context: 'bottom-sheet' | 'side-panel' | 'preview';
}

const MapSnippetInner = dynamic(() => import('./MapSnippetInner'), { ssr: false });

export default function MapSnippetBlock({ latitude, longitude, context }: MapSnippetBlockProps) {
  if (context === 'bottom-sheet') return null;

  return (
    <div className="h-32 rounded-lg border border-sage-light overflow-hidden">
      <MapSnippetInner latitude={latitude} longitude={longitude} />
    </div>
  );
}
