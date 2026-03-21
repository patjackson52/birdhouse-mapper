import type { LandingBlock } from '@/lib/config/landing-types';
import { SpacerBlock } from './blocks/SpacerBlock';
import { ButtonBlock } from './blocks/ButtonBlock';
import { ImageBlock } from './blocks/ImageBlock';
import { LinksBlock } from './blocks/LinksBlock';
import { HeroBlock } from './blocks/HeroBlock';
import { TextBlock } from './blocks/TextBlock';
import { GalleryBlock } from './blocks/GalleryBlock';

function BlockComponent({ block }: { block: LandingBlock }) {
  switch (block.type) {
    case 'spacer': return <SpacerBlock block={block} />;
    case 'button': return <ButtonBlock block={block} />;
    case 'image': return <ImageBlock block={block} />;
    case 'links': return <LinksBlock block={block} />;
    case 'hero': return <HeroBlock block={block} />;
    case 'text': return <TextBlock block={block} />;
    case 'gallery': return <GalleryBlock block={block} />;
    case 'stats': return <div data-block-type={block.type} />;
    default: return null;
  }
}

export function LandingRenderer({ blocks }: { blocks: LandingBlock[] }) {
  if (blocks.length === 0) return null;
  return <>{blocks.map((block) => <BlockComponent key={block.id} block={block} />)}</>;
}
