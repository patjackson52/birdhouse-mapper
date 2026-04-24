import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MaintenancePublicViewer } from '@/app/p/[slug]/maintenance/[id]/MaintenancePublicViewer';
import type { MaintenanceProject } from '@/lib/maintenance/types';

interface Item {
  id: string;
  name: string;
  type_name: string | null;
  last_maintained_at: string | null;
}

interface Knowledge {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  visibility: 'org' | 'public';
  cover_image_url: string | null;
}

const project: MaintenanceProject = {
  id: 'p-1',
  org_id: 'o-1',
  property_id: 'prop-1',
  title: 'Spring cleaning protocol',
  description: 'Annual pre-nesting cleanout.',
  status: 'in_progress',
  scheduled_for: '2026-04-05',
  created_by: 'u-1',
  updated_by: 'u-1',
  created_at: '2026-04-01T00:00:00Z',
  updated_at: '2026-04-10T00:00:00Z',
};

const items: Item[] = [
  { id: 'i-1', name: 'BB-001 Cedar Loop', type_name: 'Bird Box', last_maintained_at: null },
  { id: 'i-2', name: 'BB-002 Cedar Loop', type_name: 'Bird Box', last_maintained_at: '2025-01-10T00:00:00Z' },
];

const knowledge: Knowledge[] = [
  {
    id: 'k-1',
    slug: 'spring-cleaning',
    title: 'Spring Cleaning Protocol',
    excerpt: 'Step-by-step cleaning.',
    visibility: 'public',
    cover_image_url: null,
  },
];

describe('MaintenancePublicViewer', () => {
  it('renders property name in the header', () => {
    render(
      <MaintenancePublicViewer
        project={project}
        propertySlug="default"
        propertyName="Discovery Park"
        items={items}
        knowledge={knowledge}
        progress={{ completed: 1, total: 2 }}
        isOrgMember={false}
      />,
    );
    expect(screen.getByText('Discovery Park')).toBeInTheDocument();
  });

  it('renders project title and description', () => {
    render(
      <MaintenancePublicViewer
        project={project}
        propertySlug="default"
        propertyName="Discovery Park"
        items={items}
        knowledge={[]}
        progress={{ completed: 0, total: 2 }}
        isOrgMember={false}
      />,
    );
    expect(
      screen.getByRole('heading', { name: 'Spring cleaning protocol' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Annual pre-nesting cleanout/)).toBeInTheDocument();
  });

  it('shows progress bar only when status is in_progress', () => {
    const { rerender, container } = render(
      <MaintenancePublicViewer
        project={project}
        propertySlug="default"
        propertyName="Discovery Park"
        items={items}
        knowledge={[]}
        progress={{ completed: 1, total: 2 }}
        isOrgMember={false}
      />,
    );
    expect(container.querySelector('[data-testid="mpv-progress"]')).not.toBeNull();

    rerender(
      <MaintenancePublicViewer
        project={{ ...project, status: 'planned' }}
        propertySlug="default"
        propertyName="Discovery Park"
        items={items}
        knowledge={[]}
        progress={{ completed: 0, total: 2 }}
        isOrgMember={false}
      />,
    );
    expect(container.querySelector('[data-testid="mpv-progress"]')).toBeNull();
  });

  it('lists items with names and types', () => {
    render(
      <MaintenancePublicViewer
        project={project}
        propertySlug="default"
        propertyName="Discovery Park"
        items={items}
        knowledge={[]}
        progress={{ completed: 0, total: 2 }}
        isOrgMember={false}
      />,
    );
    expect(screen.getByText('BB-001 Cedar Loop')).toBeInTheDocument();
    expect(screen.getByText('BB-002 Cedar Loop')).toBeInTheDocument();
  });

  it('hides Reference material section when no knowledge', () => {
    render(
      <MaintenancePublicViewer
        project={project}
        propertySlug="default"
        propertyName="Discovery Park"
        items={items}
        knowledge={[]}
        progress={{ completed: 0, total: 2 }}
        isOrgMember={false}
      />,
    );
    expect(screen.queryByText(/Reference material/i)).toBeNull();
  });

  it('shows Reference material with KnowledgePreviewCard when knowledge is linked', () => {
    render(
      <MaintenancePublicViewer
        project={project}
        propertySlug="default"
        propertyName="Discovery Park"
        items={items}
        knowledge={knowledge}
        progress={{ completed: 0, total: 2 }}
        isOrgMember={false}
      />,
    );
    expect(screen.getByText(/Reference material/i)).toBeInTheDocument();
    expect(screen.getByText('Spring Cleaning Protocol')).toBeInTheDocument();
  });
});
