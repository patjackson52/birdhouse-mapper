# Information Architecture Redesign

**Issue:** [#199 — Overall IA Plan and Organization](https://github.com/patjackson52/birdhouse-mapper/issues/199)
**Date:** 2026-04-04
**Status:** Draft

## Problem

The current IA has several pain points:

- Tapping "Settings" from a property context navigates to org settings — unintuitive
- The admin sidebar mixes org-level and property-level concerns
- "Manage" (field work at `/manage`) and "Admin" (`/admin`) are separate top-level areas with unclear boundaries
- No user-level settings exist (profile, notifications, inbox)
- Data concepts (Types, Entity Types, Vault) appear at both levels without clear ownership
- Mobile navigation is not first-class

## Design Decisions

- **Billing is per-org** (org admin pays for the subscription)
- **Single-org per user for now**, but the IA must be extensible for multi-org later
- **Mobile primary use case is field work**, with light admin support
- **Item Types and Entity Types are org-level resources** — properties reference them, don't own them
- **Public site is fully custom** (Puck site builder / custom nav) — the shell/context system is admin-only
- **Field mode and admin mode stay as distinct experiences** with a unified entry point — they serve different mental models

## Architecture: Three Contexts

The IA is organized around three contexts, each with its own navigation scope:

### 1. Property Context

Where most day-to-day work happens. Two modes:

**Field Mode** (contributors + admins in the field):
- Map, List, Add Item, Activity/Updates
- Lightweight top bar with property name + avatar menu
- Mobile bottom tabs; desktop can be a slim top nav

**Property Admin** (property managers + org admins):
- Dashboard, Data (items table), Data Vault, Landing Page, Site Builder, QR Codes, Members, Invites, Settings
- Desktop: left sidebar. Mobile: bottom tab bar with stacked sub-navigation.

### 2. Org Context

Org-wide management. Reached by navigating "up" from a property or directly.
- Dashboard, Properties list, Members, Roles, Item Types, Entity Types, Data Vault, AI Context, Geo Layers, Domains, Access & Tokens, Billing, Org Settings

### 3. User Context

Personal, not scoped to any org. Accessed via avatar menu everywhere.
- Profile, Notification Preferences, Inbox (future)
- Small surface area — a menu or single page, not a full shell

## Desktop Navigation

### Top Bar (always visible in admin)

- **Left:** Context bar breadcrumb (`Org Name > Property Name`)
- **Right:** Notification bell (future), Avatar menu (user context)

### Left Sidebar (adapts to context)

**Property Admin:**

```
[Property Name]
  Dashboard
  ── Field Work ──
  Map
  Data (items table)
  ── Content ──
  Data Vault
  ── Site ──
  Landing Page
  Site Builder
  QR Codes
  ── People ──
  Members
  Invites
  ── Config ──
  Settings

  ↑ Back to [Org Name]
```

**Org Admin:**

```
[Org Name]
  Dashboard
  Properties
  ── People ──
  Members
  Roles
  ── Data ──
  Item Types
  Entity Types
  Data Vault
  AI Context
  Geo Layers
  ── Config ──
  Domains
  Access & Tokens
  Billing (future — placeholder slot)
  Settings
```

### Avatar Menu (any context)

- Profile
- Notification Preferences
- Org Switcher (hidden for now — slot reserved for multi-org)
- Sign Out

## Mobile Navigation

### Bottom Tab Strategy

Max 5 bottom tabs per context. Sub-items accessed via stacked navigation.

**Field Mode:**

```
Map | List | Add | Activity | More
```

- "More" opens a sheet with: Profile, Admin (gear), Sign Out

**Property Admin:**

```
Dashboard | Content | People | Config
```

- Content → stacked list: Data, Data Vault, Landing Page, Site Builder, QR Codes
- People → stacked list: Members, Invites
- Config → Settings page directly

**Org Admin:**

```
Dashboard | Properties | People | Data | Config
```

- People → Members, Roles
- Data → Item Types, Entity Types, Data Vault, AI Context, Geo Layers
- Config → Domains, Access & Tokens, Billing (future), Settings

### Mobile Context Bar

- Compact single line: `← Org Name / Property Name`
- Back chevron navigates up one context level
- Tapping the property name shows a property switcher dropdown

## URL Structure

### Property Context

```
/p/[slug]                          → Field mode (map)
/p/[slug]/list                     → List view
/p/[slug]/add                      → Add item
/p/[slug]/activity                 → Activity feed
/p/[slug]/edit/[id]                → Edit item
/p/[slug]/admin                    → Property admin dashboard
/p/[slug]/admin/data               → Items table
/p/[slug]/admin/vault              → Data vault
/p/[slug]/admin/landing            → Landing page editor
/p/[slug]/admin/site-builder/*     → Site builder
/p/[slug]/admin/qr-codes           → QR codes
/p/[slug]/admin/members            → Property members
/p/[slug]/admin/invites            → Invites
/p/[slug]/admin/settings           → Property settings
```

### Org Context

```
/org                               → Org dashboard
/org/properties                    → Properties list
/org/members                       → Org members
/org/roles                         → Roles
/org/types                         → Item types
/org/entity-types                  → Entity types
/org/vault                         → Org-level data vault
/org/ai-context                    → AI context
/org/geo-layers                    → Geo layers
/org/domains                       → Custom domains
/org/access                        → Access & tokens
/org/billing                       → Billing (future)
/org/settings                      → Org settings
```

### User Context

```
/account                           → Profile
/account/notifications             → Notification preferences
/account/inbox                     → Inbox (future)
```

### Public (unchanged)

```
/                                  → Landing or map (based on config)
/map                               → Map
/list                              → List
/about                             → About
/setup                             → First-run setup wizard
/login, /signin, /signup           → Auth pages
```

Note: `/p/[slug]` routes are for authenticated users. Public visitors use the root public routes (`/`, `/map`, `/list`, `/about`) which render the property's custom site via Puck/custom nav.

### Migration

- `/manage/*` → redirects to `/p/[slug]/*` equivalents
- `/admin/*` → redirects to `/org/*` or `/p/[slug]/admin/*` equivalents

## Context Switching & Transitions

### Property → Org

- Sidebar "Back to [Org Name]" link at bottom of property nav
- Breadcrumb click on org name in context bar
- Mobile: back chevron in context bar

### Org → Property

- Click a property in `/org/properties` list
- Lands on `/p/[slug]/admin` (property admin dashboard) — stays in admin context since you're coming from admin
- "View Map" / "Field Mode" button to switch to field mode

### Field Mode ↔ Property Admin

- **Enter admin:** Gear icon in top bar → navigates to `/p/[slug]/admin`
- **Return to field:** "View Map" button at top of admin sidebar, or tap Map tab on mobile

### Visual Context Cues

- Property context: sidebar/header uses the property's theme color as an accent
- Org context: uses the org's brand color/logo
- Always clear where you are without reading breadcrumbs

### Types: Org-Owned, Property-Referenced

- Item Types and Entity Types are created/edited at org level (`/org/types`, `/org/entity-types`)
- Properties reference org types — they don't own or duplicate them
- Property data views can filter by type, but editing a type definition navigates up to org context
- Org-level data views (Vault, etc.) show aggregate data across properties; each row links down to its property for editing

## Future-Proofing

### Multi-Org

- Avatar menu gains an "Org Switcher" — currently hidden since users have one org
- `/org/*` routes already scope to the active org; adding a switcher is additive
- Inbox/notifications can aggregate across orgs

### Inbox & Notifications

- Notification bell in top bar (all contexts)
- `/account/inbox` for full inbox view
- Notifications are cross-context: "New member joined [Property]", "Billing due for [Org]"

### Public Authenticated Experience

- Orgs can opt to show a lightweight nav shell on the public site (future, org-configurable)
- Reuses the context bar component in a "public" variant
- Out of scope for this design

### New Modules

- Sidebar grouping pattern (section headers like "Data", "Content", "People") makes it easy to add items without restructuring
- New org-level features go in the appropriate section
- New property-level features likewise
