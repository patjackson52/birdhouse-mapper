# IslandWood Birdhouses

An Eagle Scout project website for tracking birdhouses built and installed at IslandWood camp on Bainbridge Island, Washington.

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Map:** Leaflet + React-Leaflet with OpenStreetMap tiles
- **Backend/DB:** Supabase (Postgres + Auth + Storage)
- **Hosting:** Vercel

## Getting Started

### Prerequisites

- Node.js 18+
- A Supabase project (free tier)

### Setup

1. Clone the repository and install dependencies:

```bash
npm install
```

2. Copy the environment file and fill in your Supabase credentials:

```bash
cp .env.local.example .env.local
```

3. Run the database migration in your Supabase SQL editor:

```
supabase/migrations/001_initial_schema.sql
```

This creates all tables, RLS policies, storage buckets, and seed data.

4. Create your first admin user in the Supabase dashboard under Authentication > Users. Then update their profile role to 'admin' in the profiles table.

5. Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
src/
  app/           - Next.js App Router pages
  components/    - React components (map, birdhouse, birds, manage, ui, layout)
  lib/           - Supabase clients, types, utilities
  styles/        - Global CSS with Tailwind
supabase/
  migrations/    - SQL migration files
```

## Pages

| Route | Description |
|-------|-------------|
| `/` | Interactive map with birdhouse markers |
| `/list` | Card grid list view of all birdhouses |
| `/birds` | Bird species gallery |
| `/about` | Eagle Scout project information |
| `/login` | Authentication page |
| `/manage` | Management dashboard (auth required) |
| `/manage/add` | Add new birdhouse with map location picker |
| `/manage/update` | Add update/observation to a birdhouse |
| `/admin` | Admin panel for user and data management |

## Deployment

Deploy to Vercel:

1. Push to GitHub
2. Import the repository in Vercel
3. Add environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
4. Deploy
