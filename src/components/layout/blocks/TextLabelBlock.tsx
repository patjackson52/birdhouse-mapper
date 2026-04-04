import type { TextLabelConfig } from '@/lib/layout/types';

interface TextLabelBlockProps {
  config: TextLabelConfig;
}

const styleClasses: Record<TextLabelConfig['style'], string> = {
  heading: 'text-lg font-semibold text-forest-dark leading-snug',
  subheading: 'text-[15px] font-medium text-forest-dark leading-snug',
  body: 'text-sm text-forest-dark/80 leading-relaxed',
  caption: 'text-xs text-sage leading-snug',
};

export default function TextLabelBlock({ config }: TextLabelBlockProps) {
  return <p className={styleClasses[config.style]}>{config.text}</p>;
}
