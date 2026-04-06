# Map Display Configuration

Configurable map controls and legend content per property/org, with org-level defaults that cascade to all properties unless overridden.

## Configurable Controls

Five map controls can be toggled on/off:

| Control | Component | Default |
|---------|-----------|---------|
| Legend | `MapLegend.tsx` (in `MapView.tsx`) | On |
| Layer Selector | `LayerControlPanel.tsx` (in `MapView.tsx`) | On |
| Current Position (Locate Me) | `LocateButton.tsx` (in `MapView.tsx`) | On |
| View as List | `<Link>` in `HomeMapView.tsx` | On |
| Quick Add FAB | FAB button in `MapView.tsx` | On |

## Legend Detail Config

When the legend is enabled, admins can further control what appears in it:

- **Statuses**: Which status colors to show (Active, Planned, Needs Repair, Removed). If set, only listed statuses appear. If unset, all statuses shown.
- **Item Types**: Which item types to show by ID. If set, only listed types appear in the legend. If unset, all types shown.

Note: hiding a status or item type from the legend does not hide the items from the map — it only affects the legend display.

## Data Model

### TypeScript Interface

```typescript
interface MapDisplayConfig {
  controls?: {
    legend?: boolean;
    layerSelector?: boolean;
    locateMe?: boolean;
    viewAsList?: boolean;
    quickAdd?: boolean;
  };
  legend?: {
    statuses?: string[];      // e.g. ['active', 'planned', 'damaged', 'removed']
    itemTypeIds?: string[];   // UUIDs of item types to show
  };
}
```

### Database

New `map_display_config JSONB` column on both `orgs` and `properties` tables. Nullable — `null` means "use defaults (everything visible)."

Migration adds the column to both tables with `DEFAULT NULL`.

## Config Cascade

Follows the existing org → property cascade pattern used by theme, map style, and logo.

### Control toggles (per-key merge)

```
resolved.controls.legend =
  property.map_display_config?.controls?.legend
  ?? org.map_display_config?.controls?.legend
  ?? true
```

Each of the five control keys resolves independently. Unset at property level falls through to org. Unset at both levels defaults to `true`.

### Legend detail lists (full replacement)

```
resolved.legend.statuses =
  property.map_display_config?.legend?.statuses   // full replacement if set
  ?? org.map_display_config?.legend?.statuses      // fall through to org
  ?? undefined                                     // undefined = show all
```

If a property sets `legend.statuses`, that is the complete list — org's list is ignored for that property. Same for `legend.itemTypeIds`.

### Integration with buildSiteConfig

`buildSiteConfig` gains a new `mapDisplayConfig` field on `SiteConfig`. The merge logic described above runs inside `buildSiteConfig`, accepting the raw JSONB from both org and property rows.

Components access the resolved config via `useConfig().mapDisplayConfig`.

## Component Changes

### MapView.tsx

Conditionally render based on `mapDisplayConfig.controls`:

- `<MapLegend>` — wrapped in `controls.legend` check
- `<LocateButton>` — wrapped in `controls.locateMe` check
- `<LayerControlPanel>` — wrapped in `controls.layerSelector` check
- Quick Add FAB — wrapped in `controls.quickAdd` check

### HomeMapView.tsx

- "View as List" `<Link>` — wrapped in `controls.viewAsList` check

### MapLegend.tsx

- Filter `statusItems` array by `legend.statuses` (if set)
- Filter `itemTypes` array by `legend.itemTypeIds` (if set)

## Admin UI

### Layout: Card-per-control with toggle switches

Each control is a card with an icon, name, description, and toggle switch. The Legend card expands when enabled to show the status and item type checkboxes.

### Org Settings (Appearance section)

- Shows the five control cards with toggle switches
- Legend card expands to show status checkboxes and item type checkboxes
- Helper text: "These defaults apply to all properties unless overridden."

### Property Settings (Appearance tab)

- Same card layout as org settings
- Each card shows "Org default: On/Off" beneath the control name
- When a property's value differs from the org default, the card gets a yellow highlight (amber border + background) and a "Reset" link to revert to org default
- Clicking "Reset" removes the property-level override for that control, falling back to org

### Legend detail at property level

When the property's legend card is expanded:
- Status checkboxes and item type checkboxes work the same as org level
- If the property has set its own statuses/itemTypeIds list, that's a full replacement of the org list
- A "Reset to org default" option clears the property-level legend config

### Server Actions

- `updateOrgMapDisplayConfig(orgId, config: MapDisplayConfig)` — updates org's `map_display_config` column
- `updatePropertyMapDisplayConfig(propertyId, config: MapDisplayConfig)` — updates property's `map_display_config` column

Both actions validate the input shape and check permissions (org admin / property admin).

## Scope

This feature only configures visibility of existing map controls and legend content. It does not:
- Add new map controls
- Change the behavior of existing controls
- Affect which items appear on the map (only the legend display)
- Modify the list view page itself (only the link to it)
