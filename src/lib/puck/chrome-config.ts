import type { Config } from '@puckeditor/core';
import type {
  HeaderBarProps,
  NavBarProps,
  AnnouncementBarProps,
  FooterColumnsProps,
  SocialLinksProps,
  SimpleFooterProps,
} from './types';

import { HeaderBar } from './components/chrome/HeaderBar';
import { NavBar } from './components/chrome/NavBar';
import { AnnouncementBar } from './components/chrome/AnnouncementBar';
import { FooterColumns } from './components/chrome/FooterColumns';
import { SocialLinks } from './components/chrome/SocialLinks';
import { SimpleFooter } from './components/chrome/SimpleFooter';

type ChromeComponents = {
  HeaderBar: HeaderBarProps;
  NavBar: NavBarProps;
  AnnouncementBar: AnnouncementBarProps;
  FooterColumns: FooterColumnsProps;
  SocialLinks: SocialLinksProps;
  SimpleFooter: SimpleFooterProps;
};

export const chromeConfig: Config<ChromeComponents> = {
  components: {
    HeaderBar: {
      label: 'Header Bar',
      defaultProps: {
        layout: 'left-aligned',
        showTagline: false,
        backgroundColor: 'default',
      },
      fields: {
        layout: {
          type: 'radio',
          label: 'Layout',
          options: [
            { label: 'Left Aligned', value: 'left-aligned' },
            { label: 'Centered', value: 'centered' },
          ],
        },
        showTagline: {
          type: 'radio',
          label: 'Show Tagline',
          options: [
            { label: 'Yes', value: true },
            { label: 'No', value: false },
          ],
        },
        backgroundColor: {
          type: 'select',
          label: 'Background Color',
          options: [
            { label: 'Default', value: 'default' },
            { label: 'Primary', value: 'primary' },
            { label: 'Primary Dark', value: 'primary-dark' },
            { label: 'Surface', value: 'surface' },
          ],
        },
      },
      render: HeaderBar,
    },

    NavBar: {
      label: 'Nav Bar',
      defaultProps: {
        style: 'horizontal',
        position: 'below-header',
        showMobileBottomBar: false,
      },
      fields: {
        style: {
          type: 'select',
          label: 'Style',
          options: [
            { label: 'Horizontal', value: 'horizontal' },
            { label: 'Hamburger', value: 'hamburger' },
            { label: 'Tabs', value: 'tabs' },
          ],
        },
        position: {
          type: 'radio',
          label: 'Position',
          options: [
            { label: 'Below Header', value: 'below-header' },
            { label: 'Sticky', value: 'sticky' },
          ],
        },
        showMobileBottomBar: {
          type: 'radio',
          label: 'Show Mobile Bottom Bar',
          options: [
            { label: 'Yes', value: true },
            { label: 'No', value: false },
          ],
        },
      },
      render: NavBar,
    },

    AnnouncementBar: {
      label: 'Announcement Bar',
      defaultProps: {
        text: '',
        linkUrl: '',
        backgroundColor: 'primary',
      },
      fields: {
        text: { type: 'text', label: 'Text' },
        linkUrl: { type: 'text', label: 'Link URL' },
        backgroundColor: {
          type: 'select',
          label: 'Background Color',
          options: [
            { label: 'Primary', value: 'primary' },
            { label: 'Accent', value: 'accent' },
            { label: 'Surface', value: 'surface' },
          ],
        },
      },
      render: AnnouncementBar,
    },

    FooterColumns: {
      label: 'Footer Columns',
      defaultProps: {
        columns: [],
        showBranding: true,
        copyrightText: '',
      },
      fields: {
        columns: {
          type: 'array',
          label: 'Columns',
          arrayFields: {
            title: { type: 'text', label: 'Title' },
            links: {
              type: 'array',
              label: 'Links',
              arrayFields: {
                label: { type: 'text', label: 'Label' },
                url: { type: 'text', label: 'URL' },
              },
              defaultItemProps: {
                label: 'Link',
                url: '#',
              },
            },
          },
          defaultItemProps: {
            title: 'Column',
            links: [],
          },
        },
        showBranding: {
          type: 'radio',
          label: 'Show Branding',
          options: [
            { label: 'Yes', value: true },
            { label: 'No', value: false },
          ],
        },
        copyrightText: { type: 'text', label: 'Copyright Text' },
      },
      render: FooterColumns,
    },

    SocialLinks: {
      label: 'Social Links',
      defaultProps: {
        links: [],
        size: 'medium',
        alignment: 'left',
      },
      fields: {
        links: {
          type: 'array',
          label: 'Links',
          arrayFields: {
            platform: {
              type: 'select',
              label: 'Platform',
              options: [
                { label: 'Facebook', value: 'facebook' },
                { label: 'Twitter/X', value: 'twitter' },
                { label: 'Instagram', value: 'instagram' },
                { label: 'YouTube', value: 'youtube' },
                { label: 'GitHub', value: 'github' },
                { label: 'LinkedIn', value: 'linkedin' },
              ],
            },
            url: { type: 'text', label: 'URL' },
          },
          defaultItemProps: {
            platform: 'facebook',
            url: '',
          },
        },
        size: {
          type: 'radio',
          label: 'Size',
          options: [
            { label: 'Small', value: 'small' },
            { label: 'Medium', value: 'medium' },
            { label: 'Large', value: 'large' },
          ],
        },
        alignment: {
          type: 'radio',
          label: 'Alignment',
          options: [
            { label: 'Left', value: 'left' },
            { label: 'Center', value: 'center' },
            { label: 'Right', value: 'right' },
          ],
        },
      },
      render: SocialLinks,
    },

    SimpleFooter: {
      label: 'Simple Footer',
      defaultProps: {
        text: '',
        links: [],
        showPoweredBy: false,
      },
      fields: {
        text: { type: 'text', label: 'Text' },
        links: {
          type: 'array',
          label: 'Links',
          arrayFields: {
            label: { type: 'text', label: 'Label' },
            url: { type: 'text', label: 'URL' },
          },
          defaultItemProps: {
            label: 'Link',
            url: '#',
          },
        },
        showPoweredBy: {
          type: 'radio',
          label: 'Show Powered By',
          options: [
            { label: 'Yes', value: true },
            { label: 'No', value: false },
          ],
        },
      },
      render: SimpleFooter,
    },
  },
};
