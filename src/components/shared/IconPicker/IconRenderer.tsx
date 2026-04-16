'use client';

import { useState, useEffect } from 'react';
import type { IconValue } from '@/lib/types';
import type { ComponentType, SVGProps } from 'react';

interface IconRendererProps {
  icon: IconValue | undefined;
  size?: number;
  className?: string;
}

export function IconRenderer({ icon, size = 20, className }: IconRendererProps) {
  const [IconComponent, setIconComponent] = useState<ComponentType<SVGProps<SVGSVGElement>> | null>(null);

  useEffect(() => {
    if (!icon || icon.set === 'emoji') {
      setIconComponent(null);
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        let Component: ComponentType<SVGProps<SVGSVGElement>> | undefined;

        if (icon!.set === 'lucide') {
          const mod = await import('lucide-react');
          Component = (mod.icons as Record<string, ComponentType<any>>)[icon!.name];
        } else if (icon!.set === 'heroicons') {
          const style = icon!.style || 'outline';
          if (style === 'solid') {
            const mod = await import('@heroicons/react/24/solid');
            Component = (mod as unknown as Record<string, ComponentType<any>>)[`${icon!.name}Icon`];
          } else {
            const mod = await import('@heroicons/react/24/outline');
            Component = (mod as unknown as Record<string, ComponentType<any>>)[`${icon!.name}Icon`];
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
  }, [icon?.set, icon?.name, icon?.style]);

  if (!icon) return null;

  if (icon.set === 'emoji') {
    return (
      <span style={{ fontSize: `${size}px`, lineHeight: 1 }} className={className}>
        {icon.name}
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
export async function iconToHtml(icon: IconValue, size: number): Promise<string> {
  if (icon.set === 'emoji') {
    return icon.name;
  }

  // For SVG icons, dynamically import and render to string
  const { renderToStaticMarkup } = await import('react-dom/server');

  if (icon.set === 'lucide') {
    const mod = await import('lucide-react');
    const Component = (mod.icons as Record<string, ComponentType<any>>)[icon.name];
    if (Component) {
      return renderToStaticMarkup(<Component width={size} height={size} />);
    }
  } else if (icon.set === 'heroicons') {
    const style = icon.style || 'outline';
    const mod = style === 'solid'
      ? await import('@heroicons/react/24/solid')
      : await import('@heroicons/react/24/outline');
    const Component = (mod as unknown as Record<string, ComponentType<any>>)[`${icon.name}Icon`];
    if (Component) {
      return renderToStaticMarkup(<Component width={size} height={size} />);
    }
  }

  return '';
}
