import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Puck renderer client directives', () => {
  it('PuckPageRenderer has "use client" directive', () => {
    const content = fs.readFileSync(
      path.join(__dirname, '..', 'PuckPageRenderer.tsx'),
      'utf-8'
    );
    expect(content.trimStart()).toMatch(/^['"]use client['"]/);
  });

  it('PuckRootRenderer has "use client" directive', () => {
    const content = fs.readFileSync(
      path.join(__dirname, '..', 'PuckRootRenderer.tsx'),
      'utf-8'
    );
    expect(content.trimStart()).toMatch(/^['"]use client['"]/);
  });
});
