import type { SiteTemplate } from '../types';

export const minimalTemplate: SiteTemplate = {
  id: 'minimal',
  name: 'Minimal',
  description: 'A clean, simple layout focused on content with minimal chrome.',
  root: {
    root: { props: {} },
    content: [
      {
        type: 'HeaderBar',
        props: {
          id: 'HeaderBar-1',
          layout: 'left-aligned',
          showTagline: false,
          backgroundColor: 'default',
        },
      },
      {
        type: 'SimpleFooter',
        props: {
          id: 'SimpleFooter-2',
          text: `© ${new Date().getFullYear()} FieldMapper`,
          links: [
            { label: 'Map', url: '/map' },
            { label: 'About', url: '/about' },
          ],
          showPoweredBy: true,
        },
      },
    ],
    zones: {},
  },
  pages: {
    '/': {
      root: { props: {} },
      content: [
        {
          type: 'RichText',
          props: {
            id: 'RichText-1',
            content: '<h1>Welcome</h1><p>Explore our interactive field map to discover local species and observations in your area.</p>',
            alignment: 'left',
            columns: 1,
          },
        },
        {
          type: 'ButtonGroup',
          props: {
            id: 'ButtonGroup-2',
            buttons: [
              { label: 'Explore Map', href: '/map', style: 'primary', size: 'large' },
            ],
          },
        },
        {
          type: 'MapPreview',
          props: {
            id: 'MapPreview-3',
            height: 300,
            zoom: 10,
            showControls: true,
          },
        },
      ],
      zones: {},
    },
  },
};
