import { describe, it, expect } from 'vitest';
import { templates, getTemplate } from '../index';
import { puckDataSchema } from '../../schemas';

describe('templates', () => {
  it('has 3 templates', () => {
    expect(templates.length).toBe(3);
  });

  it.each(['classic', 'minimal', 'showcase'])('template "%s" has valid root data', (id) => {
    const template = getTemplate(id);
    expect(template).toBeDefined();
    expect(() => puckDataSchema.parse(template!.root)).not.toThrow();
  });

  it.each(['classic', 'minimal', 'showcase'])('template "%s" has valid landing page data', (id) => {
    const template = getTemplate(id);
    expect(template!.pages['/']).toBeDefined();
    expect(() => puckDataSchema.parse(template!.pages['/'])).not.toThrow();
  });

  it.each(['classic', 'minimal', 'showcase'])('template "%s" has landing page with at least one component', (id) => {
    const template = getTemplate(id);
    expect(template!.pages['/'].content.length).toBeGreaterThan(0);
  });

  it.each(['classic', 'minimal', 'showcase'])('template "%s" has at least one header component in root', (id) => {
    const template = getTemplate(id);
    const hasHeader = template!.root.content.some((c: { type: string }) =>
      ['HeaderBar', 'NavBar', 'AnnouncementBar'].includes(c.type)
    );
    expect(hasHeader).toBe(true);
  });
});
