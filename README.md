# Field Mapper

[![CI](https://github.com/patjackson52/birdhouse-mapper/actions/workflows/ci.yml/badge.svg)](https://github.com/patjackson52/birdhouse-mapper/actions/workflows/ci.yml) [![Deploy](https://github.com/patjackson52/birdhouse-mapper/actions/workflows/deploy.yml/badge.svg)](https://github.com/patjackson52/birdhouse-mapper/actions/workflows/deploy.yml)

A generic, open-source point-of-interest mapper template. Fork it, run the setup wizard, and have a fully branded mapping app without touching code. Track bird boxes, bat houses, trail markers, monitoring stations — anything with a location.

## Features

- **Setup wizard** — configure your site name, theme, map center, and item types in minutes
- **Multiple item types** — define different categories (Bird Box, Bat House, Info Station) with custom fields per type
- **6 color themes** — Forest, Ocean, Desert, Urban, Arctic, Meadow
- **10 map tile styles** — OpenStreetMap, CartoDB, Stadia, ESRI Satellite, OpenTopoMap, and more
- **Custom map overlay** — upload a park map or trail map and align it on the base map
- **Admin settings UI** — edit all site config from the browser, no code changes needed
- **Role-based access** — public viewing, editor access for adding items, admin for full control
- **Mobile-friendly** — responsive design with bottom tab bar and swipe-to-dismiss panels

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS with CSS variable theming
- **Map:** Leaflet + React-Leaflet
- **Backend/DB:** Supabase (Postgres + Auth + Storage)
- **Testing:** Vitest
- **Hosting:** Vercel

## Getting Started

### Prerequisites

- Node.js 18+
- A Supabase project (free tier works)

### Setup

1. Clone and install:

```bash
git clone <your-fork-url>
cd field-mapper
npm install
```

2. Create `.env.local` with your Supabase credentials:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

3. Run the database migrations in your Supabase SQL editor:

```
supabase/migrations/001_initial_schema.sql    # Base tables
supabase/migrations/002_generic_schema.sql    # Generic field mapper schema
```

4. Start the dev server:

```bash
npm run dev
```

5. Visit `http://localhost:3000` — the setup wizard will guide you through configuration.

## Project Structure

```
src/
  app/              Next.js App Router pages
    setup/          Setup wizard
    admin/settings/ Admin settings UI
    manage/         Editor dashboard
  components/
    map/            MapView, ItemMarker, MapLegend
    item/           ItemCard, DetailPanel, StatusBadge, UpdateTimeline
    manage/         ItemForm, UpdateForm, LocationPicker, OverlayEditor
    layout/         Navigation, Footer, Header
    ui/             BottomSheet, LoadingSpinner
  lib/
    config/         SiteConfig types, defaults, server fetcher, themes, map styles
    supabase/       Browser client, server client, middleware
    types.ts        Database types
    utils.ts        Formatting helpers
supabase/
  migrations/       SQL migration files
  scripts/          Storage bucket migration script
```

## Routes

| Route | Description | Auth |
|-------|-------------|------|
| `/` | Interactive map with markers and detail panel | Public |
| `/list` | Filterable card grid of all items | Public |
| `/about` | Project info (markdown from config) | Public |
| `/setup` | First-run setup wizard | Public |
| `/login` | Sign in | Public |
| `/manage` | Dashboard with stats and item table | Editor+ |
| `/manage/add` | Add new item with type-specific custom fields | Editor+ |
| `/manage/update` | Add update/observation to an item | Editor+ |
| `/admin` | User and data management | Admin |
| `/admin/settings` | Site settings (General, Appearance, Custom Map, About, Footer) | Admin |

## Configuration

All config is stored in the `site_config` Supabase table and editable via `/admin/settings`:

- **General** — site name, tagline, location, default map view, map tile style
- **Appearance** — color theme preset
- **Custom Map** — image overlay with map-based corner placement
- **About Page** — markdown content
- **Footer** — footer text and links

## Deployment

1. Push to GitHub
2. Import in Vercel
3. Add environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
4. Deploy
