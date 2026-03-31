import type { Data, Config } from '@puckeditor/core';

// ---- Component prop types (page components) ----

export interface HeroProps {
  title: string;
  subtitle: string;
  backgroundImageUrl: string;
  overlay: 'primary' | 'dark' | 'none';
  ctaLabel: string;
  ctaHref: string;
}

export interface RichTextProps {
  content: string;
  alignment: 'left' | 'center';
  columns: 1 | 2;
}

export interface ImageBlockProps {
  url: string;
  alt: string;
  caption: string;
  width: 'small' | 'medium' | 'full';
  linkHref: string;
}

export interface ButtonGroupProps {
  buttons: Array<{
    label: string;
    href: string;
    style: 'primary' | 'outline';
    size: 'default' | 'large';
  }>;
}

export interface LinkListProps {
  items: Array<{
    label: string;
    url: string;
    description: string;
  }>;
  layout: 'inline' | 'stacked';
}

export interface StatsProps {
  source: 'auto' | 'manual';
  items: Array<{
    label: string;
    value: string;
  }>;
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
  linkHref: string;
  linkLabel: string;
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
}

export interface EmbedProps {
  url: string;
  height: number;
  title: string;
}

// ---- Chrome component prop types ----

export interface HeaderBarProps {
  layout: 'centered' | 'left-aligned';
  showTagline: boolean;
  backgroundColor: 'primary' | 'primary-dark' | 'surface' | 'default';
}

export interface NavBarProps {
  style: 'horizontal' | 'hamburger' | 'tabs';
  position: 'below-header' | 'sticky';
  showMobileBottomBar: boolean;
}

export interface AnnouncementBarProps {
  text: string;
  linkUrl: string;
  backgroundColor: 'primary' | 'accent' | 'surface';
}

export interface FooterColumnsProps {
  columns: Array<{
    title: string;
    links: Array<{ label: string; url: string }>;
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
  links: Array<{ label: string; url: string }>;
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
