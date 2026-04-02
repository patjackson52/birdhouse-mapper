import type { Config } from '@puckeditor/core';
import { imagePickerField, iconPickerField, linkField } from './fields';
import { fetchLandingAssets } from './fields/fetch-assets';
import type {
  HeroProps,
  RichTextProps,
  ImageBlockProps,
  ButtonGroupProps,
  LinkListProps,
  StatsProps,
  GalleryProps,
  SpacerProps,
  ColumnsProps,
  SectionProps,
  CardProps,
  MapPreviewProps,
  TestimonialProps,
  EmbedProps,
} from './types';

import { Hero } from './components/page/Hero';
import { RichText } from './components/page/RichText';
import { ImageBlock } from './components/page/ImageBlock';
import { ButtonGroup } from './components/page/ButtonGroup';
import { LinkList } from './components/page/LinkList';
import { Stats } from './components/page/Stats';
import { Gallery } from './components/page/Gallery';
import { Spacer } from './components/page/Spacer';
import { Columns } from './components/page/Columns';
import { Section } from './components/page/Section';
import { Card } from './components/page/Card';
import { MapPreview } from './components/page/MapPreview';
import { Testimonial } from './components/page/Testimonial';
import { Embed } from './components/page/Embed';

type PageComponents = {
  Hero: HeroProps;
  RichText: RichTextProps;
  ImageBlock: ImageBlockProps;
  ButtonGroup: ButtonGroupProps;
  LinkList: LinkListProps;
  Stats: StatsProps;
  Gallery: GalleryProps;
  Spacer: SpacerProps;
  Columns: ColumnsProps;
  Section: SectionProps;
  Card: CardProps;
  MapPreview: MapPreviewProps;
  Testimonial: TestimonialProps;
  Embed: EmbedProps;
};

const themeColorOptions = [
  { label: 'Default', value: 'default' },
  { label: 'Primary', value: 'primary' },
  { label: 'Accent', value: 'accent' },
  { label: 'Surface', value: 'surface' },
  { label: 'Muted', value: 'muted' },
];

export const pageConfig: Config<PageComponents> = {
  components: {
    Hero: {
      label: 'Hero',
      defaultProps: {
        title: 'Welcome',
        subtitle: '',
        backgroundImageUrl: '',
        overlay: 'primary',
        ctaLabel: '',
        ctaHref: '',
      },
      fields: {
        title: { type: 'text', label: 'Title' },
        subtitle: { type: 'text', label: 'Subtitle' },
        backgroundImageUrl: imagePickerField('Background Image', fetchLandingAssets),
        overlay: {
          type: 'select',
          label: 'Overlay',
          options: [
            { label: 'Primary', value: 'primary' },
            { label: 'Dark', value: 'dark' },
            { label: 'None', value: 'none' },
          ],
        },
        ctaLabel: { type: 'text', label: 'CTA Label' },
        ctaHref: linkField('CTA Link'),
        icon: iconPickerField('Icon'),
      },
      render: Hero,
    },

    RichText: {
      label: 'Rich Text',
      defaultProps: {
        content: '',
        alignment: 'left',
        columns: 1,
      },
      fields: {
        content: { type: 'richtext', label: 'Content', contentEditable: true },
        alignment: {
          type: 'radio',
          label: 'Alignment',
          options: [
            { label: 'Left', value: 'left' },
            { label: 'Center', value: 'center' },
          ],
        },
        columns: {
          type: 'radio',
          label: 'Columns',
          options: [
            { label: '1', value: 1 },
            { label: '2', value: 2 },
          ],
        },
      },
      render: RichText,
    },

    ImageBlock: {
      label: 'Image',
      defaultProps: {
        url: '',
        alt: '',
        caption: '',
        width: 'full',
        linkHref: '',
      },
      fields: {
        url: imagePickerField('Image', fetchLandingAssets),
        alt: { type: 'text', label: 'Alt Text' },
        caption: { type: 'text', label: 'Caption' },
        width: {
          type: 'select',
          label: 'Width',
          options: [
            { label: 'Small', value: 'small' },
            { label: 'Medium', value: 'medium' },
            { label: 'Full', value: 'full' },
          ],
        },
        linkHref: linkField('Link URL'),
      },
      render: ImageBlock,
    },

    ButtonGroup: {
      label: 'Button Group',
      defaultProps: {
        buttons: [],
      },
      fields: {
        buttons: {
          type: 'array',
          label: 'Buttons',
          arrayFields: {
            label: { type: 'text', label: 'Label' },
            href: linkField('Link'),
            style: {
              type: 'select',
              label: 'Style',
              options: [
                { label: 'Primary', value: 'primary' },
                { label: 'Outline', value: 'outline' },
              ],
            },
            size: {
              type: 'select',
              label: 'Size',
              options: [
                { label: 'Default', value: 'default' },
                { label: 'Large', value: 'large' },
              ],
            },
          },
          defaultItemProps: {
            label: 'Button',
            href: '#',
            style: 'primary',
            size: 'default',
          },
        },
      },
      render: ButtonGroup,
    },

    LinkList: {
      label: 'Link List',
      defaultProps: {
        items: [],
        layout: 'stacked',
      },
      fields: {
        items: {
          type: 'array',
          label: 'Links',
          arrayFields: {
            label: { type: 'text', label: 'Label' },
            url: linkField('URL'),
            description: { type: 'text', label: 'Description' },
          },
          defaultItemProps: {
            label: 'Link',
            url: '#',
            description: '',
          },
        },
        layout: {
          type: 'radio',
          label: 'Layout',
          options: [
            { label: 'Inline', value: 'inline' },
            { label: 'Stacked', value: 'stacked' },
          ],
        },
      },
      render: LinkList,
    },

    Stats: {
      label: 'Stats',
      defaultProps: {
        source: 'manual',
        items: [],
      },
      fields: {
        source: {
          type: 'radio',
          label: 'Source',
          options: [
            { label: 'Auto', value: 'auto' },
            { label: 'Manual', value: 'manual' },
          ],
        },
        items: {
          type: 'array',
          label: 'Items',
          arrayFields: {
            label: { type: 'text', label: 'Label' },
            value: { type: 'text', label: 'Value' },
          },
          defaultItemProps: {
            label: 'Stat',
            value: '0',
          },
        },
      },
      render: Stats,
    },

    Gallery: {
      label: 'Gallery',
      defaultProps: {
        images: [],
        columns: 3,
      },
      fields: {
        images: {
          type: 'array',
          label: 'Images',
          arrayFields: {
            url: imagePickerField('Image', fetchLandingAssets),
            alt: { type: 'text', label: 'Alt Text' },
            caption: { type: 'text', label: 'Caption' },
          },
          defaultItemProps: {
            url: '',
            alt: '',
            caption: '',
          },
        },
        columns: {
          type: 'select',
          label: 'Columns',
          options: [
            { label: '2', value: 2 },
            { label: '3', value: 3 },
            { label: '4', value: 4 },
          ],
        },
      },
      render: Gallery,
    },

    Spacer: {
      label: 'Spacer',
      defaultProps: {
        size: 'medium',
      },
      fields: {
        size: {
          type: 'radio',
          label: 'Size',
          options: [
            { label: 'Small', value: 'small' },
            { label: 'Medium', value: 'medium' },
            { label: 'Large', value: 'large' },
          ],
        },
      },
      render: Spacer,
    },

    Columns: {
      label: 'Columns',
      defaultProps: {
        columnCount: 2,
      },
      fields: {
        'column-0': { type: 'slot' },
        'column-1': { type: 'slot' },
        'column-2': { type: 'slot' },
        'column-3': { type: 'slot' },
        columnCount: {
          type: 'select',
          label: 'Column Count',
          options: [
            { label: '2', value: 2 },
            { label: '3', value: 3 },
            { label: '4', value: 4 },
          ],
        },
      } as any,
      render: Columns as any,
    },

    Section: {
      label: 'Section',
      defaultProps: {
        backgroundColor: 'default',
        backgroundImageUrl: '',
        paddingY: 'medium',
      },
      fields: {
        content: { type: 'slot' },
        backgroundColor: {
          type: 'select',
          label: 'Background Color',
          options: themeColorOptions,
        },
        backgroundImageUrl: imagePickerField('Background Image', fetchLandingAssets),
        paddingY: {
          type: 'radio',
          label: 'Vertical Padding',
          options: [
            { label: 'Small', value: 'small' },
            { label: 'Medium', value: 'medium' },
            { label: 'Large', value: 'large' },
          ],
        },
      } as any,
      render: Section as any,
    },

    Card: {
      label: 'Card',
      defaultProps: {
        imageUrl: '',
        title: '',
        text: '',
        linkHref: '',
        linkLabel: '',
      },
      fields: {
        imageUrl: imagePickerField('Image', fetchLandingAssets),
        title: { type: 'text', label: 'Title' },
        text: { type: 'richtext', label: 'Text' },
        linkHref: linkField('Link URL'),
        linkLabel: { type: 'text', label: 'Link Label' },
        icon: iconPickerField('Icon'),
      },
      render: Card,
    },

    MapPreview: {
      label: 'Map Preview',
      defaultProps: {
        height: 300,
        zoom: 10,
        showControls: true,
      },
      fields: {
        height: {
          type: 'select',
          label: 'Height',
          options: [
            { label: '200px', value: 200 },
            { label: '300px', value: 300 },
            { label: '400px', value: 400 },
          ],
        },
        zoom: {
          type: 'number',
          label: 'Zoom Level',
          min: 1,
          max: 18,
        },
        showControls: {
          type: 'radio',
          label: 'Show Controls',
          options: [
            { label: 'Yes', value: true },
            { label: 'No', value: false },
          ],
        },
      },
      render: MapPreview,
    },

    Testimonial: {
      label: 'Testimonial',
      defaultProps: {
        quote: '',
        attribution: '',
        photoUrl: '',
        style: 'default',
      },
      fields: {
        quote: { type: 'richtext', label: 'Quote' },
        attribution: { type: 'text', label: 'Attribution' },
        photoUrl: imagePickerField('Photo', fetchLandingAssets),
        style: {
          type: 'radio',
          label: 'Style',
          options: [
            { label: 'Default', value: 'default' },
            { label: 'Accent', value: 'accent' },
          ],
        },
      },
      render: Testimonial,
    },

    Embed: {
      label: 'Embed',
      defaultProps: {
        url: '',
        title: '',
        height: 400,
      },
      fields: {
        url: { type: 'text', label: 'URL' },
        title: { type: 'text', label: 'Title' },
        height: {
          type: 'number',
          label: 'Height',
          min: 100,
          max: 800,
        },
      },
      render: Embed,
    },
  },
};
