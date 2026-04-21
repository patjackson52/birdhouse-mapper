import type { AuthorCard } from '@/lib/types';

type UpdateForAttribution = {
  anon_name: string | null;
  createdByProfile: AuthorCard | null;
};

export function Attribution({ update, compact = false }: { update: UpdateForAttribution; compact?: boolean }) {
  const isAnon = update.createdByProfile?.role === 'public_contributor' || !update.createdByProfile;
  const avatarSize = compact ? 20 : 32;

  if (isAnon) {
    const name = update.anon_name || (compact ? 'Anon' : 'Anonymous contributor');
    return (
      <div className={`flex items-center ${compact ? 'gap-[6px]' : 'gap-2'}`}>
        <div
          style={{ width: avatarSize, height: avatarSize }}
          className="flex shrink-0 items-center justify-center rounded-full border border-dashed border-forest-border bg-sage-light font-body text-sage"
        >
          <span className={compact ? 'text-[9px] font-semibold' : 'text-[12px] font-semibold'}>?</span>
        </div>
        {compact ? (
          <span className="text-[11.5px] font-medium text-sage">{name}</span>
        ) : (
          <div className="min-w-0">
            <div className="flex items-center gap-[6px] text-[13px] font-medium">
              {name}
              <span className="rounded-full bg-sage-light px-[6px] py-[1px] text-[10px] font-medium tracking-[0.3px] text-sage">ANON</span>
            </div>
            <div className="text-[11.5px] text-sage">submitted via public form</div>
          </div>
        )}
      </div>
    );
  }

  const u = update.createdByProfile!;
  const display = u.display_name ?? 'Unknown';
  return (
    <div className={`flex items-center ${compact ? 'gap-[6px]' : 'gap-2'}`}>
      <img
        src={u.avatar_url ?? ''}
        alt=""
        style={{ width: avatarSize, height: avatarSize }}
        className="shrink-0 rounded-full bg-sage-light object-cover"
      />
      {compact ? (
        <span className="text-[11.5px] font-medium">{display.split(' ')[0]}</span>
      ) : (
        <div className="min-w-0">
          <div className="text-[13px] font-semibold">{display}</div>
          <div className="text-[11.5px] text-sage">{u.role} · {u.update_count} updates</div>
        </div>
      )}
    </div>
  );
}
