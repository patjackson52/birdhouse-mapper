import type { Data, Config } from '@puckeditor/core';
import type { LinkValue } from './fields/link-utils';
import type { IconValue } from '@/lib/types';
import type { TextSize } from './text-styles';

// Re-export field value types for component use
export type { LinkValue } from './fields/link-utils';
export type { IconValue } from '@/lib/types';

// ---- Component prop types (page components) ----

export interface HeroProps {
  title: string;
  subtitle: string;
  backgroundImageUrl: string;
  overlay: 'primary' | 'dark' | 'none';
  ctaLabel: string;
  ctaHref: string | LinkValue;
  icon?: IconValue;
  textSize?: TextSize;
}

export interface RichTextProps {
  content: string;
  alignment: 'left' | 'center';
  columns: 1 | 2;
  textSize?: TextSize;
}

export interface ImageBlockProps {
  url: string;
  alt: string;
  caption: string;
  width: 'small' | 'medium' | 'full';
  linkHref: string | LinkValue;
}

export interface ButtonGroupProps {
  buttons: Array<{
    label: string;
    href: string | LinkValue;
    style: 'primary' | 'outline';
    size: 'default' | 'large';
  }>;
}

export interface LinkListProps {
  items: Array<{
    label: string;
    url: string | LinkValue;
    description: string;
  }>;
  layout: 'inline' | 'stacked';
  textSize?: TextSize;
}

export interface StatsProps {
  source: 'auto' | 'manual';
  items: Array<{
    label: string;
    value: string;
  }>;
  textSize?: TextSize;
}

export interface GalleryProps {
  images: Array<{
    url: string;
    alt: string;
    caption: string;
  }>;
  columns: 2 | 3 | 4;
}

export interface SpacerProps {
  size: 'small' | 'medium' | 'large';
}

export interface ColumnsProps {
  columnCount: 2 | 3 | 4;
}

export interface SectionProps {
  backgroundColor: 'default' | 'primary' | 'accent' | 'surface' | 'muted';
  backgroundImageUrl: string;
  paddingY: 'small' | 'medium' | 'large';
}

export interface CardProps {
  imageUrl: string;
  title: string;
  text: string;
  linkHref: string | LinkValue;
  linkLabel: string;
  icon?: IconValue;
  textSize?: TextSize;
}

export interface MapPreviewProps {
  height: 200 | 300 | 400;
  zoom: number;
  showControls: boolean;
}

export interface TestimonialProps {
  quote: string;
  attribution: string;
  photoUrl: string;
  style: 'default' | 'accent';
  textSize?: TextSize;
}

export interface EmbedProps {
  url: string;
  height: number;
  title: string;
}

export interface KnowledgeEmbedProps {
  knowledgeItemId: string;
  showTitle: boolean;
  showAttachments: boolean;
  textSize?: TextSize;
}

export interface KnowledgeListProps {
  tagFilter: string[];
  maxItems: number;
  layout: 'grid' | 'list';
  columns: 2 | 3 | 4;
  textSize?: TextSize;
}

// ---- Chrome component prop types ----

export interface HeaderBarProps {
  layout: 'centered' | 'left-aligned';
  showTagline: boolean;
  backgroundColor: 'primary' | 'primary-dark' | 'surface' | 'default';
  logoUrl?: string;
  icon?: IconValue;
  iconPosition?: 'before-name' | 'after-name' | 'above-name';
  taglinePosition?: 'below' | 'grouped';
  nameSize?: 'small' | 'medium' | 'large' | 'xl';
  nameWeight?: 'normal' | 'medium' | 'semibold' | 'bold';
  nameColor?: string;
  taglineSize?: 'small' | 'medium' | 'large' | 'xl';
  taglineWeight?: 'normal' | 'medium' | 'semibold' | 'bold';
  taglineColor?: string;
  links?: Array<{ label: string; href: string | LinkValue }>;
  linkColor?: string;
  showAuthActions?: boolean;
}

export interface NavBarProps {
  style: 'horizontal' | 'hamburger' | 'tabs';
  position: 'below-header' | 'sticky';
  showMobileBottomBar: boolean;
  showAuthActions?: boolean;
}

export interface AnnouncementBarProps {
  text: string;
  linkUrl: string | LinkValue;
  backgroundColor: 'primary' | 'accent' | 'surface';
}

export interface FooterColumnsProps {
  columns: Array<{
    title: string;
    links: Array<{ label: string; url: string | LinkValue }>;
  }>;
  showBranding: boolean;
  copyrightText: string;
}

export interface SocialLinksProps {
  links: Array<{
    platform: 'facebook' | 'twitter' | 'instagram' | 'youtube' | 'github' | 'linkedin';
    url: string;
  }>;
  size: 'small' | 'medium' | 'large';
  alignment: 'left' | 'center' | 'right';
}

export interface SimpleFooterProps {
  text: string;
  links: Array<{ label: string; url: string | LinkValue }>;
  showPoweredBy: boolean;
}

// ---- Puck data types ----

export type PuckPageData = Data;
export type PuckRootData = Data;

export interface PuckSiteData {
  pages: Record<string, PuckPageData>;
  root: PuckRootData;
  template: string | null;
}

// ---- Template types ----

export interface SiteTemplate {
  id: string;
  name: string;
  description: string;
  previewImageUrl?: string;
  root: PuckRootData;
  pages: Record<string, PuckPageData>;
}
