import type { LandingBlock } from '@/lib/config/landing-types';
import { SpacerBlock } from './blocks/SpacerBlock';
import { ButtonBlock } from './blocks/ButtonBlock';
import { ImageBlock } from './blocks/ImageBlock';
import { LinksBlock } from './blocks/LinksBlock';

function BlockComponent({ block }: { block: LandingBlock }) {
  switch (block.type) {
    case 'spacer': return <SpacerBlock block={block} />;
    case 'button': return <ButtonBlock block={block} />;
    case 'image': return <ImageBlock block={block} />;
    case 'links': return <LinksBlock block={block} />;
    case 'hero':
    case 'text':
    case 'stats':
    case 'gallery':
      return <div data-block-type={block.type} />;
    default: return null;
  }
}

export function LandingRenderer({ blocks }: { blocks: LandingBlock[] }) {
  if (blocks.length === 0) return null;
  return <>{blocks.map((block) => <BlockComponent key={block.id} block={block} />)}</>;
}
