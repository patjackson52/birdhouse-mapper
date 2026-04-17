'use client';

import { useState, useEffect } from 'react';
import type { IconValue } from '@/lib/types';
import { normalizeIcon } from '@/lib/types';
import type { ComponentType, SVGProps } from 'react';

interface IconRendererProps {
  icon: IconValue | string | null | undefined;
  size?: number;
  className?: string;
}

export function IconRenderer({ icon, size = 20, className }: IconRendererProps) {
  const normalized = normalizeIcon(icon);
  const [IconComponent, setIconComponent] = useState<ComponentType<SVGProps<SVGSVGElement>> | null>(null);

  useEffect(() => {
    if (!normalized || normalized.set === 'emoji') {
      setIconComponent(null);
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        let Component: ComponentType<SVGProps<SVGSVGElement>> | undefined;

        if (normalized!.set === 'lucide') {
          const mod = await import('lucide-react');
          Component = (mod.icons as Record<string, ComponentType<any>>)[normalized!.name];
        } else if (normalized!.set === 'heroicons') {
          const style = normalized!.style || 'outline';
          if (style === 'solid') {
            const mod = await import('@heroicons/react/24/solid');
            Component = (mod as unknown as Record<string, ComponentType<any>>)[`${normalized!.name}Icon`];
          } else {
            const mod = await import('@heroicons/react/24/outline');
            Component = (mod as unknown as Record<string, ComponentType<any>>)[`${normalized!.name}Icon`];
          }
        }

        if (!cancelled && Component) {
          setIconComponent(() => Component!);
        }
      } catch {
        // Icon not found — render nothing
      }
    }

    load();
    return () => { cancelled = true; };
  }, [normalized?.set, normalized?.name, normalized?.style]);

  if (!normalized) return null;

  if (normalized.set === 'emoji') {
    return (
      <span style={{ fontSize: `${size}px`, lineHeight: 1 }} className={className}>
        {normalized.name}
      </span>
    );
  }

  if (!IconComponent) return null;

  return <IconComponent width={size} height={size} className={className} />;
}

/**
 * Returns an HTML string for an icon. Used by Leaflet DivIcon markers
 * and other contexts that need raw HTML instead of React components.
 */
export async function iconToHtml(icon: IconValue | string | null | undefined, size: number): Promise<string> {
  const normalized = normalizeIcon(icon);
  if (!normalized) return '';
  if (normalized.set === 'emoji') {
    return normalized.name;
  }

  // For SVG icons, dynamically import and render to string
  const { renderToStaticMarkup } = await import('react-dom/server');

  if (normalized.set === 'lucide') {
    const mod = await import('lucide-react');
    const Component = (mod.icons as Record<string, ComponentType<any>>)[normalized.name];
    if (Component) {
      return renderToStaticMarkup(<Component width={size} height={size} />);
    }
  } else if (normalized.set === 'heroicons') {
    const style = normalized.style || 'outline';
    const mod = style === 'solid'
      ? await import('@heroicons/react/24/solid')
      : await import('@heroicons/react/24/outline');
    const Component = (mod as unknown as Record<string, ComponentType<any>>)[`${normalized.name}Icon`];
    if (Component) {
      return renderToStaticMarkup(<Component width={size} height={size} />);
    }
  }

  return '';
}
