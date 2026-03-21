export interface LandingPageConfig {
  enabled: boolean;
  blocks: LandingBlock[];
  generatedFrom?: string;
  assets: LandingAsset[];
}

export interface LandingAsset {
  id: string;
  storagePath: string;
  publicUrl: string;
  fileName: string;
  mimeType: string;
  category: 'image' | 'document';
  description?: string;
  uploadedAt: string;
}

export type LandingBlock =
  | HeroBlock
  | TextBlock
  | ImageBlock
  | ButtonBlock
  | LinksBlock
  | StatsBlock
  | GalleryBlock
  | SpacerBlock;

export interface BlockBase {
  id: string;
  type: string;
}

export interface HeroBlock extends BlockBase {
  type: 'hero';
  title: string;
  subtitle?: string;
  backgroundImageUrl?: string;
  overlay?: boolean;
}

export interface TextBlock extends BlockBase {
  type: 'text';
  content: string;
  alignment?: 'left' | 'center';
}

export interface ImageBlock extends BlockBase {
  type: 'image';
  url: string;
  alt: string;
  caption?: string;
  width?: 'small' | 'medium' | 'full';
}

export interface ButtonBlock extends BlockBase {
  type: 'button';
  label: string;
  href: string;
  style?: 'primary' | 'outline';
  size?: 'default' | 'large';
}

export interface LinksBlock extends BlockBase {
  type: 'links';
  items: { label: string; url: string; description?: string }[];
  layout?: 'inline' | 'stacked';
}

export interface StatsBlock extends BlockBase {
  type: 'stats';
  source: 'manual' | 'auto';
  items?: { label: string; value: string }[];
}

export interface GalleryBlock extends BlockBase {
  type: 'gallery';
  images: { url: string; alt: string; caption?: string }[];
  columns?: 2 | 3 | 4;
}

export interface SpacerBlock extends BlockBase {
  type: 'spacer';
  size: 'small' | 'medium' | 'large';
}
