'use client';

import { useState, useEffect } from 'react';
import type { IconValue } from '../fields/link-utils';
import type { ComponentType, SVGProps } from 'react';

interface IconRendererProps {
  icon: IconValue | undefined;
  size?: number;
  className?: string;
}

export function IconRenderer({ icon, size = 20, className }: IconRendererProps) {
  const [IconComponent, setIconComponent] = useState<ComponentType<SVGProps<SVGSVGElement>> | null>(null);

  useEffect(() => {
    if (!icon) {
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
            Component = (mod as Record<string, ComponentType<any>>)[`${icon!.name}Icon`];
          } else {
            const mod = await import('@heroicons/react/24/outline');
            Component = (mod as Record<string, ComponentType<any>>)[`${icon!.name}Icon`];
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

  if (!icon || !IconComponent) return null;

  return <IconComponent width={size} height={size} className={className} />;
}
