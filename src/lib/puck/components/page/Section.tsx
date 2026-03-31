import { DropZone } from '@puckeditor/core';
import type { SectionProps } from '../../types';

const bgClasses = {
  default: '',
  primary: 'bg-[var(--color-primary)] text-white',
  accent: 'bg-[var(--color-accent)] text-white',
  surface: 'bg-[var(--color-surface-light)]',
  muted: 'bg-[var(--color-muted)]',
};

const paddingClasses = { small: 'py-4', medium: 'py-8', large: 'py-16' };

export function Section({ backgroundColor, backgroundImageUrl, paddingY }: SectionProps) {
  return (
    <section
      className={`w-full ${bgClasses[backgroundColor]} ${paddingClasses[paddingY]}`}
      style={backgroundImageUrl ? { backgroundImage: `url(${backgroundImageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
    >
      <DropZone zone="content" />
    </section>
  );
}
