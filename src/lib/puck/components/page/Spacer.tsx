import type { SpacerProps } from '../../types';

const sizeClasses: Record<SpacerProps['size'], string> = {
  small: 'h-4',
  medium: 'h-8',
  large: 'h-16',
};

export function Spacer({ size }: SpacerProps) {
  return <div className={sizeClasses[size]} aria-hidden="true" />;
}
