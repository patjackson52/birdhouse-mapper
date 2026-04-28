'use client';

import type { TypeLayout } from '@/lib/layout/types';
import type { TypeLayoutV2 } from '@/lib/layout/types-v2';
import type { ItemWithDetails, CustomField } from '@/lib/types';
import LayoutRenderer from './LayoutRenderer';
import LayoutRendererV2 from './LayoutRendererV2';
import type { DeletePermission } from '@/components/delete/DeleteConfirmModal';

interface Props {
  layout: TypeLayout | TypeLayoutV2;
  item: ItemWithDetails;
  mode: 'live' | 'preview';
  context: 'bottom-sheet' | 'side-panel' | 'preview';
  sheetState?: 'peek' | 'half' | 'full';
  customFields: CustomField[];
  canEdit?: boolean;
  canAddUpdate?: boolean;
  isAuthenticated?: boolean;
  canEditUpdate?: boolean;
  canDeleteUpdate?: boolean;
  currentUserId?: string | null;
  userRole?: 'admin' | 'coordinator' | 'member' | 'public_contributor' | null;
  propertySlug?: string | null;
  onDeleteUpdate?: (updateId: string, permission: DeletePermission) => void;
  onEditUpdate?: (updateId: string) => void;
}

export default function LayoutRendererDispatch({ layout, ...rest }: Props) {
  if (layout.version === 2) {
    return <LayoutRendererV2 layout={layout as TypeLayoutV2} {...rest} />;
  }
  return <LayoutRenderer layout={layout as TypeLayout} {...rest} />;
}
