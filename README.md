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

### Option A: Local Development (Recommended)

Prerequisites: Node.js 18+, Docker, [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)

```bash
git clone <your-fork-url>
cd field-mapper
npm install
npm run dev:local         # starts local Supabase + Next.js in one command
```

Local services:
- **App:** http://localhost:3000
- **Supabase Studio:** http://localhost:54323
- **Mailpit (email testing):** http://localhost:54324

**Test accounts** (created by setup script):

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@test.fieldmapper.org | test-admin-password-123 |
| Editor | editor@test.fieldmapper.org | test-editor-password-123 |

> First run pulls Docker images and may take a few minutes. Subsequent starts are fast.

### Option B: Cloud Supabase

```bash
cp supabase/scripts/env.dev.cloud.example .env.dev.cloud
# Edit .env.dev.cloud with your Supabase project credentials
npm run dev:cloud         # copies config and starts Next.js
```

### Dev commands

| Command | Description |
|---------|-------------|
| `npm run dev:local` | Start local Supabase + Next.js (full local stack) |
| `npm run dev:cloud` | Start Next.js against cloud Supabase |
| `npm run dev` | Start Next.js with current `.env.local` (no env switching) |
| `npm run supabase:setup` | Start local Supabase + seed data (no Next.js) |
| `npm run supabase:reset` | Wipe local DB and re-seed from scratch |
| `npm run supabase:stop` | Stop local Supabase Docker containers |
| `npm run test:e2e` | Run E2E tests against local Supabase |

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

## Google OAuth (optional)

Users can sign in with Google in addition to email/password. To enable it:

### 1. Get Google OAuth credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create an **OAuth 2.0 Client ID** (Web application)
3. Add an **Authorized redirect URI**:
   ```
   https://your-project.supabase.co/auth/v1/callback
   ```

### 2. Configure Supabase

1. **Supabase Dashboard → Authentication → Providers → Google**
   - Enable the Google provider
   - Paste your Client ID and Client Secret

2. **Supabase Dashboard → Authentication → URL Configuration → Redirect URLs**
   - Add your app callback URL(s):
     ```
     http://localhost:3000/api/auth/callback
     https://your-app.vercel.app/api/auth/callback
     ```

No additional environment variables are needed in `.env.local` — credentials live in Supabase.

New users who sign in with Google are automatically assigned the `editor` role via the database trigger. An admin can promote them to `admin` via `/admin`.

## Deployment

1. Push to GitHub
2. Import in Vercel
3. Add environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
4. Deploy
