export type TextSize = 'small' | 'medium' | 'large' | 'xl';

/** Prose-based components: RichText, Card body, Testimonial quote */
export const proseSizeClasses: Record<TextSize, string> = {
  small: 'prose-sm',
  medium: 'prose-base',
  large: 'prose-lg',
  xl: 'prose-xl',
};

/** Hero title */
export const heroTitleClasses: Record<TextSize, string> = {
  small: 'text-2xl md:text-3xl',
  medium: 'text-3xl md:text-4xl',
  large: 'text-4xl md:text-5xl',
  xl: 'text-5xl md:text-6xl',
};

/** Hero subtitle */
export const heroSubtitleClasses: Record<TextSize, string> = {
  small: 'text-base',
  medium: 'text-lg md:text-xl',
  large: 'text-xl md:text-2xl',
  xl: 'text-2xl md:text-3xl',
};

/** Stats value number */
export const statValueClasses: Record<TextSize, string> = {
  small: 'text-xl',
  medium: 'text-2xl',
  large: 'text-3xl',
  xl: 'text-4xl',
};

/** LinkList label text */
export const linkLabelClasses: Record<TextSize, string> = {
  small: 'text-sm',
  medium: 'text-base',
  large: 'text-lg',
  xl: 'text-xl',
};

/** Reusable Puck field definition for text size */
export function textSizeField(label = 'Text Size') {
  return {
    type: 'select' as const,
    label,
    options: [
      { label: 'Small', value: 'small' as const },
      { label: 'Medium', value: 'medium' as const },
      { label: 'Large', value: 'large' as const },
      { label: 'XL', value: 'xl' as const },
    ],
  };
}
