import type { SiteTemplate } from '../types';

export const showcaseTemplate: SiteTemplate = {
  id: 'showcase',
  name: 'Showcase',
  description: 'A bold, feature-rich layout designed to highlight your project\'s impact and community.',
  root: {
    root: { props: {} },
    content: [
      {
        type: 'HeaderBar',
        props: {
          id: 'HeaderBar-1',
          layout: 'left-aligned',
          showTagline: true,
          backgroundColor: 'primary-dark',
        },
      },
      {
        type: 'NavBar',
        props: {
          id: 'NavBar-2',
          style: 'horizontal',
          position: 'sticky',
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
              ],
            },
            {
              title: 'Community',
              links: [
                { label: 'Observations', url: '/observations' },
                { label: 'Contributors', url: '/contributors' },
              ],
            },
            {
              title: 'About',
              links: [
                { label: 'Mission', url: '/about' },
                { label: 'Team', url: '/team' },
              ],
            },
            {
              title: 'Get Involved',
              links: [
                { label: 'Volunteer', url: '/volunteer' },
                { label: 'Donate', url: '/donate' },
              ],
            },
          ],
          showBranding: true,
          copyrightText: `© ${new Date().getFullYear()} FieldMapper. All rights reserved.`,
        },
      },
      {
        type: 'SocialLinks',
        props: {
          id: 'SocialLinks-4',
          links: [],
          size: 'medium',
          alignment: 'center',
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
            title: 'Mapping Nature Together',
            subtitle: 'Join our community of field researchers documenting biodiversity and protecting ecosystems.',
            backgroundImageUrl: '',
            overlay: 'dark',
            ctaLabel: 'Start Exploring',
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
          type: 'Gallery',
          props: {
            id: 'Gallery-3',
            images: [],
            columns: 3,
          },
        },
        {
          type: 'RichText',
          props: {
            id: 'RichText-4',
            content: '<h2>Our Mission</h2><p>We believe that citizen science has the power to transform conservation. By connecting passionate observers with researchers and policymakers, we amplify the impact of every sighting, every photo, and every data point contributed to the map.</p>',
            alignment: 'center',
            columns: 1,
          },
        },
        {
          type: 'Testimonial',
          props: {
            id: 'Testimonial-5',
            quote: 'This platform has completely changed how our team tracks migratory patterns. The data quality and community engagement are unmatched.',
            attribution: 'Field Researcher',
            photoUrl: '',
            style: 'accent',
          },
        },
        {
          type: 'ButtonGroup',
          props: {
            id: 'ButtonGroup-6',
            buttons: [
              { label: 'Explore Map', href: '/map', style: 'primary', size: 'large' },
              { label: 'View All Species', href: '/species', style: 'outline', size: 'large' },
            ],
          },
        },
      ],
      zones: {},
    },
  },
};
