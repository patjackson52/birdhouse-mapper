import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Render } from '@puckeditor/core';
import { pageConfig } from '../config';
import { classicTemplate } from '../templates/classic';
import { minimalTemplate } from '../templates/minimal';
import { showcaseTemplate } from '../templates/showcase';
import { puckDataSchema } from '../schemas';

describe('Template rendering integration', () => {
  it('Classic template renders without errors', () => {
    const data = classicTemplate.pages['/'];
    const validated = puckDataSchema.parse(data);
    const { container } = render(<Render config={pageConfig} data={validated} />);
    expect(container.innerHTML).not.toBe('');
    expect(screen.getByText('Welcome to Our Field Map')).toBeDefined();
  });

  it('Minimal template renders without errors', () => {
    const data = minimalTemplate.pages['/'];
    const validated = puckDataSchema.parse(data);
    const { container } = render(<Render config={pageConfig} data={validated} />);
    expect(container.innerHTML).not.toBe('');
  });

  it('Showcase template renders without errors', () => {
    const data = showcaseTemplate.pages['/'];
    const validated = puckDataSchema.parse(data);
    const { container } = render(<Render config={pageConfig} data={validated} />);
    expect(container.innerHTML).not.toBe('');
    expect(screen.getByText('Mapping Nature Together')).toBeDefined();
  });

  it('renders components with manual stats data', () => {
    const data = {
      root: { props: {} },
      content: [
        { type: 'Hero', props: { title: 'Integration Test', subtitle: '', backgroundImageUrl: '', overlay: 'none', ctaLabel: '', ctaHref: '' } },
        { type: 'Stats', props: { source: 'manual', items: [{ label: 'Birds', value: '42' }] } },
      ],
    };
    render(<Render config={pageConfig} data={data} />);
    expect(screen.getByText('Integration Test')).toBeDefined();
    expect(screen.getByText('42')).toBeDefined();
    expect(screen.getByText('Birds')).toBeDefined();
  });
});
