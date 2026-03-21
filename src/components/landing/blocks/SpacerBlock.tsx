import type { SpacerBlock as SpacerBlockType } from '@/lib/config/landing-types';
const sizeClasses = { small: 'py-4', medium: 'py-8', large: 'py-16' };
export function SpacerBlock({ block }: { block: SpacerBlockType }) {
  return <div data-block-type="spacer" className={sizeClasses[block.size]} />;
}
