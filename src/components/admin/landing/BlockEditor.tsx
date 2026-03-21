'use client';

import type { LandingBlock, LandingAsset } from '@/lib/config/landing-types';
import HeroEditor from '@/components/admin/landing/block-editors/HeroEditor';
import TextEditor from '@/components/admin/landing/block-editors/TextEditor';
import ImageEditor from '@/components/admin/landing/block-editors/ImageEditor';
import ButtonEditor from '@/components/admin/landing/block-editors/ButtonEditor';
import LinksEditor from '@/components/admin/landing/block-editors/LinksEditor';
import StatsEditor from '@/components/admin/landing/block-editors/StatsEditor';
import GalleryEditor from '@/components/admin/landing/block-editors/GalleryEditor';
import SpacerEditor from '@/components/admin/landing/block-editors/SpacerEditor';

interface BlockEditorProps {
  block: LandingBlock;
  onChange: (block: LandingBlock) => void;
  assets: LandingAsset[];
  onAssetsChange: (assets: LandingAsset[]) => void;
}

export default function BlockEditor({ block, onChange, assets, onAssetsChange }: BlockEditorProps) {
  switch (block.type) {
    case 'hero':
      return <HeroEditor block={block} onChange={onChange} assets={assets} onAssetsChange={onAssetsChange} />;
    case 'text':
      return <TextEditor block={block} onChange={onChange} />;
    case 'image':
      return <ImageEditor block={block} onChange={onChange} assets={assets} onAssetsChange={onAssetsChange} />;
    case 'button':
      return <ButtonEditor block={block} onChange={onChange} />;
    case 'links':
      return <LinksEditor block={block} onChange={onChange} />;
    case 'stats':
      return <StatsEditor block={block} onChange={onChange} />;
    case 'gallery':
      return <GalleryEditor block={block} onChange={onChange} assets={assets} onAssetsChange={onAssetsChange} />;
    case 'spacer':
      return <SpacerEditor block={block} onChange={onChange} />;
    default:
      return null;
  }
}
