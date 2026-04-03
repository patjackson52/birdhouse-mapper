import { describe, it, expect } from 'vitest';
import { pageConfig } from '../config';

describe('pageConfig', () => {
  it('registers all expected page components', () => {
    const componentNames = Object.keys(pageConfig.components);
    expect(componentNames).toContain('Hero');
    expect(componentNames).toContain('RichText');
    expect(componentNames).toContain('ImageBlock');
    expect(componentNames).toContain('ButtonGroup');
    expect(componentNames).toContain('LinkList');
    expect(componentNames).toContain('Stats');
    expect(componentNames).toContain('Gallery');
    expect(componentNames).toContain('Spacer');
    expect(componentNames).toContain('Columns');
    expect(componentNames).toContain('Section');
    expect(componentNames).toContain('Card');
    expect(componentNames).toContain('MapPreview');
    expect(componentNames).toContain('Testimonial');
    expect(componentNames).toContain('Embed');
    expect(componentNames).toContain('KnowledgeEmbed');
    expect(componentNames).toContain('KnowledgeList');
    expect(componentNames.length).toBe(16);
  });

  it('each component has a render function', () => {
    for (const [name, component] of Object.entries(pageConfig.components)) {
      expect(typeof component.render, `${name} missing render`).toBe('function');
    }
  });

  it('each component has default props', () => {
    for (const [name, component] of Object.entries(pageConfig.components)) {
      expect(component.defaultProps, `${name} missing defaultProps`).toBeDefined();
    }
  });
});
