'use client';

import type { LandingBlock } from '@/lib/config/landing-types';
import { SpacerBlock } from './blocks/SpacerBlock';
import { ButtonBlock } from './blocks/ButtonBlock';
import { ImageBlock } from './blocks/ImageBlock';
import { LinksBlock } from './blocks/LinksBlock';
import { HeroBlock } from './blocks/HeroBlock';
import { TextBlock } from './blocks/TextBlock';
import { GalleryBlock } from './blocks/GalleryBlock';

function PreviewBlockComponent({ block }: { block: LandingBlock }) {
  switch (block.type) {
    case 'spacer': return <SpacerBlock block={block} />;
    case 'button': return <ButtonBlock block={block} />;
    case 'image': return <ImageBlock block={block} />;
    case 'links': return <LinksBlock block={block} />;
    case 'hero': return <HeroBlock block={block} />;
    case 'text': return <TextBlock block={block} />;
    case 'gallery': return <GalleryBlock block={block} />;
    case 'stats':
      return (
        <div data-block-type="stats" className="bg-sage-light py-8">
          <div className="text-center text-sage text-sm">
            {block.source === 'auto' ? 'Live stats will appear here' : 'Manual stats preview'}
          </div>
        </div>
      );
    default: return null;
  }
}

export function LandingRendererPreview({ blocks }: { blocks: LandingBlock[] }) {
  if (blocks.length === 0) return null;
  return <>{blocks.map((block) => <PreviewBlockComponent key={block.id} block={block} />)}</>;
}
