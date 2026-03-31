import type { SocialLinksProps } from '../../types';

const platformLabels: Record<string, string> = { facebook: 'Facebook', twitter: 'Twitter/X', instagram: 'Instagram', youtube: 'YouTube', github: 'GitHub', linkedin: 'LinkedIn' };
const sizeClasses = { small: 'text-sm gap-3', medium: 'text-base gap-4', large: 'text-lg gap-5' };
const alignClasses = { left: 'justify-start', center: 'justify-center', right: 'justify-end' };

export function SocialLinks({ links, size, alignment }: SocialLinksProps) {
  if (!links?.length) return <></>;
  return (
    <div className={`flex flex-wrap items-center px-4 py-2 ${sizeClasses[size]} ${alignClasses[alignment]}`}>
      {links.map((link, i) => (
        <a key={i} href={link.url} target="_blank" rel="noopener noreferrer" className="opacity-70 transition hover:opacity-100" aria-label={platformLabels[link.platform] ?? link.platform}>
          {platformLabels[link.platform] ?? link.platform}
        </a>
      ))}
    </div>
  );
}
