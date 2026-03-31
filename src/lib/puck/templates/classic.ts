import type { SiteTemplate } from '../types';

export const classicTemplate: SiteTemplate = {
  id: 'classic',
  name: 'Classic',
  description: 'A full-featured layout with navigation, hero, stats, and gallery sections.',
  root: {
    root: { props: {} },
    content: [
      {
        type: 'HeaderBar',
        props: {
          id: 'HeaderBar-1',
          layout: 'left-aligned',
          showTagline: false,
          backgroundColor: 'primary',
        },
      },
      {
        type: 'NavBar',
        props: {
          id: 'NavBar-2',
          style: 'horizontal',
          position: 'below-header',
          showMobileBottomBar: true,
        },
      },
      {
        type: 'FooterColumns',
        props: {
          id: 'FooterColumns-3',
          columns: [
            {
              title: 'Explore',
              links: [
                { label: 'Map', url: '/map' },
                { label: 'Species', url: '/species' },
                { label: 'Observations', url: '/observations' },
              ],
            },
            {
              title: 'About',
              links: [
                { label: 'Mission', url: '/about' },
                { label: 'Team', url: '/team' },
                { label: 'Contact', url: '/contact' },
              ],
            },
            {
              title: 'Connect',
              links: [
                { label: 'Newsletter', url: '/newsletter' },
                { label: 'Volunteer', url: '/volunteer' },
                { label: 'Donate', url: '/donate' },
              ],
            },
          ],
          showBranding: true,
          copyrightText: `© ${new Date().getFullYear()} FieldMapper. All rights reserved.`,
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
          type: 'Hero',
          props: {
            id: 'Hero-1',
            title: 'Welcome to Our Field Map',
            subtitle: 'Discover species, track observations, and explore the natural world with your community.',
            backgroundImageUrl: '',
            overlay: 'primary',
            ctaLabel: 'Explore Map',
            ctaHref: '/map',
          },
        },
        {
          type: 'Stats',
          props: {
            id: 'Stats-2',
            source: 'auto',
            items: [],
          },
        },
        {
          type: 'RichText',
          props: {
            id: 'RichText-3',
            content: '<h2>About Our Project</h2><p>We are a dedicated team of conservationists and citizen scientists working to document and protect local biodiversity. Our platform makes it easy to record sightings, share knowledge, and collaborate with others who care about nature.</p>',
            alignment: 'left',
            columns: 1,
          },
        },
        {
          type: 'Gallery',
          props: {
            id: 'Gallery-4',
            images: [],
            columns: 3,
          },
        },
        {
          type: 'ButtonGroup',
          props: {
            id: 'ButtonGroup-5',
            buttons: [
              { label: 'Explore Map', href: '/map', style: 'primary', size: 'large' },
              { label: 'Learn More', href: '/about', style: 'outline', size: 'large' },
            ],
          },
        },
      ],
      zones: {},
    },
  },
};
