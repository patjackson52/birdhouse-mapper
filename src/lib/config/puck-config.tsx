import type { Config } from '@measured/puck';
import React, { useState } from 'react';

// ---------------------------------------------------------------------------
// Component prop type definitions
// ---------------------------------------------------------------------------

type HeroProps = {
  title: string;
  subtitle: string;
  backgroundImageUrl: string;
};

type RichTextProps = {
  content: string;
};

type ImageProps = {
  src: string;
  alt: string;
  width: 'full' | 'half' | 'third';
};

type ButtonProps = {
  label: string;
  href: string;
  hrefType: 'home' | 'list' | 'signin' | 'manage' | 'custom';
  customHref: string;
  style: 'primary' | 'secondary';
};

type LinkListProps = {
  links: { label: string; href: string }[];
  layout: 'inline' | 'stacked';
};

type StatsProps = {
  mode: 'auto' | 'manual';
  stats: { label: string; value: string }[];
};

type GalleryProps = {
  imageUrls: { url: string }[];
  columns: 2 | 3 | 4;
};

type SpacerProps = {
  size: 'sm' | 'md' | 'lg';
};

// ---------------------------------------------------------------------------
// Route options for Button href
// ---------------------------------------------------------------------------

const ROUTE_OPTIONS = [
  { value: 'home', label: '/home — Interactive Map' },
  { value: 'list', label: '/home?view=list — Item List' },
  { value: 'signin', label: '/signin — Sign In' },
  { value: 'manage', label: '/manage — About / Manage' },
  { value: 'custom', label: 'custom — Custom URL' },
] as const;

function resolveHref(hrefType: ButtonProps['hrefType'], customHref: string): string {
  switch (hrefType) {
    case 'home': return '/home';
    case 'list': return '/home?view=list';
    case 'signin': return '/signin';
    case 'manage': return '/manage';
    case 'custom': return customHref || '/';
  }
}

// ---------------------------------------------------------------------------
// Puck component config
// ---------------------------------------------------------------------------

export const puckConfig: Config<{
  Hero: HeroProps;
  RichText: RichTextProps;
  Image: ImageProps;
  Button: ButtonProps;
  LinkList: LinkListProps;
  Stats: StatsProps;
  Gallery: GalleryProps;
  Spacer: SpacerProps;
}> = {
  components: {
    Hero: {
      label: 'Hero',
      fields: {
        title: { type: 'text', label: 'Title' },
        subtitle: { type: 'text', label: 'Subtitle' },
        backgroundImageUrl: { type: 'text', label: 'Background Image URL' },
      },
      defaultProps: {
        title: 'Welcome',
        subtitle: 'Explore the map',
        backgroundImageUrl: '',
      },
      render: ({ title, subtitle, backgroundImageUrl }) => (
        <div
          className="relative flex items-center justify-center min-h-[320px] rounded-lg overflow-hidden"
          style={{
            background: backgroundImageUrl
              ? `url(${backgroundImageUrl}) center/cover no-repeat`
              : 'var(--color-primary, #2563eb)',
          }}
        >
          {backgroundImageUrl && (
            <div className="absolute inset-0 bg-black/40" />
          )}
          <div className="relative z-10 text-center px-6 py-12">
            <h1
              className="text-4xl font-bold mb-3"
              style={{ color: backgroundImageUrl ? '#fff' : 'var(--color-primary-foreground, #fff)' }}
            >
              {title}
            </h1>
            {subtitle && (
              <p
                className="text-lg opacity-90"
                style={{ color: backgroundImageUrl ? '#fff' : 'var(--color-primary-foreground, #fff)' }}
              >
                {subtitle}
              </p>
            )}
          </div>
        </div>
      ),
    },

    RichText: {
      label: 'Rich Text',
      fields: {
        content: { type: 'textarea', label: 'Content (Markdown supported)' },
      },
      defaultProps: { content: 'Enter your text here...' },
      render: ({ content }) => (
        <div
          className="prose max-w-none py-4"
          style={{ color: 'var(--color-foreground, inherit)' }}
        >
          {content.split('\n').map((line, i) => (
            <p key={i}>{line || <br />}</p>
          ))}
        </div>
      ),
    },

    Image: {
      label: 'Image',
      fields: {
        src: { type: 'text', label: 'Image URL' },
        alt: { type: 'text', label: 'Alt Text' },
        width: {
          type: 'select',
          label: 'Width',
          options: [
            { value: 'full', label: 'Full width' },
            { value: 'half', label: 'Half width' },
            { value: 'third', label: 'One third' },
          ],
        },
      },
      defaultProps: { src: '', alt: 'Image', width: 'full' },
      render: ({ src, alt, width }) => {
        const widthClass = width === 'full' ? 'w-full' : width === 'half' ? 'w-1/2' : 'w-1/3';
        return (
          <div className={`${widthClass} mx-auto`}>
            {src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt={alt} className="w-full rounded-lg object-cover" />
            ) : (
              <div className="w-full h-40 bg-gray-200 rounded-lg flex items-center justify-center text-gray-400 text-sm">
                No image URL set
              </div>
            )}
          </div>
        );
      },
    },

    Button: {
      label: 'Button',
      fields: {
        label: { type: 'text', label: 'Button Label' },
        hrefType: {
          type: 'select',
          label: 'Link To',
          options: ROUTE_OPTIONS.map(o => ({ value: o.value, label: o.label })),
        },
        customHref: { type: 'text', label: 'Custom URL (if custom selected)' },
        href: { type: 'text', label: 'Resolved href (auto-filled)' },
        style: {
          type: 'select',
          label: 'Style',
          options: [
            { value: 'primary', label: 'Primary' },
            { value: 'secondary', label: 'Secondary' },
          ],
        },
      },
      defaultProps: {
        label: 'Explore the Map',
        href: '/home',
        hrefType: 'home',
        customHref: '',
        style: 'primary',
      },
      render: ({ label, hrefType, customHref, style }) => {
        const href = resolveHref(hrefType, customHref);
        return (
          <div className="flex justify-center py-4">
            <a
              href={href}
              className={style === 'primary' ? 'btn-primary' : 'btn-secondary'}
              style={
                style === 'primary'
                  ? { background: 'var(--color-primary, #2563eb)', color: 'var(--color-primary-foreground, #fff)' }
                  : { borderColor: 'var(--color-primary, #2563eb)', color: 'var(--color-primary, #2563eb)' }
              }
            >
              {label}
            </a>
          </div>
        );
      },
    },

    LinkList: {
      label: 'Link List',
      fields: {
        links: {
          type: 'array',
          label: 'Links',
          arrayFields: {
            label: { type: 'text', label: 'Label' },
            href: { type: 'text', label: 'URL' },
          },
          defaultItemProps: { label: 'Link', href: '/' },
        },
        layout: {
          type: 'select',
          label: 'Layout',
          options: [
            { value: 'inline', label: 'Inline' },
            { value: 'stacked', label: 'Stacked' },
          ],
        },
      },
      defaultProps: { links: [], layout: 'stacked' },
      render: ({ links, layout }) => (
        <nav
          className={layout === 'inline' ? 'flex flex-wrap gap-3 py-2' : 'flex flex-col gap-2 py-2'}
        >
          {links.map((link, i) => (
            <a
              key={i}
              href={link.href}
              className="text-sm font-medium hover:underline"
              style={{ color: 'var(--color-primary, #2563eb)' }}
            >
              {link.label}
            </a>
          ))}
        </nav>
      ),
    },

    Stats: {
      label: 'Stats',
      fields: {
        mode: {
          type: 'select',
          label: 'Mode',
          options: [
            { value: 'auto', label: 'Auto (from live data)' },
            { value: 'manual', label: 'Manual' },
          ],
        },
        stats: {
          type: 'array',
          label: 'Stats (manual mode)',
          arrayFields: {
            label: { type: 'text', label: 'Label' },
            value: { type: 'text', label: 'Value' },
          },
          defaultItemProps: { label: 'Stat', value: '0' },
        },
      },
      defaultProps: { mode: 'auto', stats: [] },
      render: ({ mode, stats }) => {
        const items = mode === 'manual' ? stats : [
          { label: 'Items Tracked', value: '—' },
          { label: 'Updates', value: '—' },
          { label: 'Species', value: '—' },
        ];
        return (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 py-4">
            {items.map((s, i) => (
              <div
                key={i}
                className="card text-center p-4 rounded-lg"
                style={{ borderColor: 'var(--color-border, #e5e7eb)' }}
              >
                <div
                  className="text-2xl font-bold"
                  style={{ color: 'var(--color-primary, #2563eb)' }}
                >
                  {s.value}
                </div>
                <div className="text-sm text-gray-500 mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        );
      },
    },

    Gallery: {
      label: 'Gallery',
      fields: {
        imageUrls: {
          type: 'array',
          label: 'Image URLs',
          arrayFields: {
            // Puck array fields must be objects — we use a wrapper
            url: { type: 'text', label: 'URL' },
          },
          defaultItemProps: { url: '' },
        },
        columns: {
          type: 'select',
          label: 'Columns',
          options: [
            { value: 2, label: '2 columns' },
            { value: 3, label: '3 columns' },
            { value: 4, label: '4 columns' },
          ],
        },
      },
      defaultProps: { imageUrls: [], columns: 3 },
      render: ({ imageUrls, columns }) => {
        const colClass =
          columns === 2 ? 'grid-cols-2' : columns === 3 ? 'grid-cols-3' : 'grid-cols-4';
        const urls = imageUrls.map(u =>
          typeof u === 'string' ? u : u.url
        );
        return (
          <div className={`grid ${colClass} gap-2 py-4`}>
            {urls.map((src, i) =>
              src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={src} alt={`Gallery image ${i + 1}`} className="w-full rounded object-cover aspect-square" />
              ) : (
                <div key={i} className="bg-gray-200 rounded aspect-square flex items-center justify-center text-gray-400 text-xs">
                  No URL
                </div>
              )
            )}
          </div>
        );
      },
    },

    Spacer: {
      label: 'Spacer',
      fields: {
        size: {
          type: 'select',
          label: 'Size',
          options: [
            { value: 'sm', label: 'Small' },
            { value: 'md', label: 'Medium' },
            { value: 'lg', label: 'Large' },
          ],
        },
      },
      defaultProps: { size: 'md' },
      render: ({ size }) => {
        const h = size === 'sm' ? 'h-4' : size === 'md' ? 'h-8' : 'h-16';
        return <div className={h} />;
      },
    },
  },
};
