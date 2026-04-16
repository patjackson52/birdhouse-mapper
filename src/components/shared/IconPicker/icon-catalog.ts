// src/components/shared/IconPicker/icon-catalog.ts
import { getAllEmojis, searchEmojis } from './emoji-catalog';

export interface IconEntry {
  set: 'lucide' | 'heroicons' | 'emoji';
  name: string;
  searchTerms: string;
  category?: string;
}

let lucideEntries: IconEntry[] | null = null;
let heroiconEntries: IconEntry[] | null = null;

export async function getLucideIcons(): Promise<IconEntry[]> {
  if (lucideEntries) return lucideEntries;
  const { icons } = await import('lucide-react');
  lucideEntries = Object.keys(icons).map((name) => ({
    set: 'lucide' as const,
    name,
    searchTerms: name.toLowerCase().replace(/([A-Z])/g, ' $1').trim(),
  }));
  return lucideEntries;
}

export async function getHeroicons(): Promise<IconEntry[]> {
  if (heroiconEntries) return heroiconEntries;
  const outlineMod = await import('@heroicons/react/24/outline');
  heroiconEntries = Object.keys(outlineMod)
    .filter((name) => name.endsWith('Icon'))
    .map((name) => ({
      set: 'heroicons' as const,
      name: name.replace(/Icon$/, ''),
      searchTerms: name.replace(/Icon$/, '').toLowerCase().replace(/([A-Z])/g, ' $1').trim(),
    }));
  return heroiconEntries;
}

export function getEmojis(): IconEntry[] {
  return getAllEmojis().map((e) => ({
    set: 'emoji' as const,
    name: e.emoji,
    searchTerms: e.searchTerms,
    category: e.category,
  }));
}

export async function searchIcons(
  query: string,
  set?: 'lucide' | 'heroicons' | 'emoji'
): Promise<IconEntry[]> {
  const q = query.toLowerCase().trim();
  const results: IconEntry[] = [];

  if (!set || set === 'lucide') {
    const lucide = await getLucideIcons();
    results.push(...lucide.filter((e) => e.searchTerms.includes(q)));
  }
  if (!set || set === 'heroicons') {
    const heroicons = await getHeroicons();
    results.push(...heroicons.filter((e) => e.searchTerms.includes(q)));
  }
  if (!set || set === 'emoji') {
    const emojis = searchEmojis(query);
    results.push(
      ...emojis.map((e) => ({
        set: 'emoji' as const,
        name: e.emoji,
        searchTerms: e.searchTerms,
        category: e.category,
      }))
    );
  }

  return results.slice(0, 200);
}
