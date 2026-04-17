import type { CustomField, Entity, EntityType, ItemType, ItemUpdate, ItemWithDetails, Photo, UpdateType, IconValue } from '@/lib/types';

const MOCK_ORG_ID = 'mock-org';
const MOCK_PROPERTY_ID = 'mock-property';
const MOCK_ITEM_ID = 'mock-item';

function dateOffset(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
}

function today(): string {
  return new Date().toISOString().split('T')[0];
}

function getMockFieldValue(field: CustomField): unknown {
  switch (field.field_type) {
    case 'text':
      return 'Sample text';
    case 'number':
      return 42;
    case 'dropdown':
      return Array.isArray(field.options) && field.options.length > 0 ? field.options[0] : '';
    case 'date':
      return today();
    default:
      return null;
  }
}

const MOCK_UPDATE_TYPE: UpdateType = {
  id: 'mock-update-type',
  name: 'Inspection',
  icon: '🔍',
  is_global: true,
  item_type_id: null,
  sort_order: 0,
  org_id: MOCK_ORG_ID,
  min_role_create: null,
  min_role_edit: null,
  min_role_delete: null,
};

const MOCK_ENTITY_TYPE: EntityType = {
  id: 'mock-entity-type',
  org_id: MOCK_ORG_ID,
  name: 'Volunteer',
  icon: { set: 'emoji', name: '👤' } as IconValue,
  color: '#4A90D9',
  link_to: ['items'],
  sort_order: 0,
  api_source: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const MOCK_ENTITY: Entity & { entity_type: EntityType } = {
  id: 'mock-entity',
  entity_type_id: 'mock-entity-type',
  org_id: MOCK_ORG_ID,
  name: 'Jane Smith',
  description: null,
  photo_path: null,
  external_link: null,
  external_id: null,
  custom_field_values: {},
  sort_order: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  entity_type: MOCK_ENTITY_TYPE,
};

function makeMockUpdate(id: string, daysAgo: number): ItemUpdate & { update_type: UpdateType; photos: Photo[]; entities: (Entity & { entity_type: EntityType })[] } {
  const ts = dateOffset(daysAgo);
  return {
    id,
    item_id: MOCK_ITEM_ID,
    update_type_id: 'mock-update-type',
    content: 'Routine check completed. Everything looks good.',
    update_date: ts.split('T')[0],
    created_at: ts,
    created_by: null,
    org_id: MOCK_ORG_ID,
    property_id: MOCK_PROPERTY_ID,
    custom_field_values: {},
    update_type: MOCK_UPDATE_TYPE,
    photos: [],
    entities: [],
  };
}

export function generateMockItem(itemType: ItemType, fields: CustomField[]): ItemWithDetails {
  const customFieldValues: Record<string, unknown> = {};
  for (const field of fields) {
    customFieldValues[field.id] = getMockFieldValue(field);
  }

  const photos: Photo[] = [
    {
      id: 'mock-photo-1',
      item_id: MOCK_ITEM_ID,
      update_id: null,
      storage_path: 'mock/placeholder.jpg',
      caption: 'Sample photo',
      is_primary: true,
      created_at: '2026-01-01T00:00:00Z',
      org_id: MOCK_ORG_ID,
      property_id: MOCK_PROPERTY_ID,
    },
  ];

  const updates = [
    makeMockUpdate('mock-update-1', 0),
    makeMockUpdate('mock-update-2', 7),
    makeMockUpdate('mock-update-3', 30),
  ];

  return {
    id: MOCK_ITEM_ID,
    name: `Sample ${itemType.name}`,
    description: 'This is a sample item for layout preview.',
    latitude: 51.505,
    longitude: -0.09,
    item_type_id: itemType.id,
    custom_field_values: customFieldValues,
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    created_by: null,
    org_id: MOCK_ORG_ID,
    property_id: MOCK_PROPERTY_ID,
    item_type: itemType,
    updates,
    photos,
    custom_fields: fields,
    entities: [MOCK_ENTITY],
  };
}
