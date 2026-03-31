import type { SiteTemplate } from '../types';
import { classicTemplate } from './classic';
import { minimalTemplate } from './minimal';
import { showcaseTemplate } from './showcase';

export const templates: SiteTemplate[] = [classicTemplate, minimalTemplate, showcaseTemplate];

export function getTemplate(id: string): SiteTemplate | undefined {
  return templates.find((t) => t.id === id);
}
