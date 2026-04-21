import type { ReactNode } from 'react';

type Kind = 'native' | 'intro' | 'cavity';

const styles: Record<Kind, { bg: string; fg: string; dot: string }> = {
  native: { bg: 'bg-forest/10',       fg: 'text-forest-dark', dot: 'bg-forest' },
  intro:  { bg: 'bg-[#A03B1B]/10',    fg: 'text-[#A03B1B]',   dot: 'bg-[#C76142]' },
  cavity: { bg: 'bg-forest-dark/10',  fg: 'text-forest-dark', dot: 'bg-forest-dark' },
};

export function Tag({ kind = 'native', children }: { kind?: Kind; children: ReactNode }) {
  const s = styles[kind];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-[2px] text-[10.5px] font-medium tracking-[0.1px] whitespace-nowrap ${s.bg} ${s.fg}`}>
      <span className={`h-[5px] w-[5px] rounded-full ${s.dot}`} />
      {children}
    </span>
  );
}
