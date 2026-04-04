# Coding Patterns

Recurring patterns used across the codebase. Keep this updated as conventions evolve.

## Server Actions

- All server actions return `{ success: true, data }` or `{ error: string }`.
- Use `"use server"` directive at the top of action files.
- Validate inputs with Zod schemas before processing.
- Always check tenant context before mutating data.

## Client Components

- Mark with `"use client"` only when needed (event handlers, hooks, browser APIs).
- Prefer server components by default.
- Use Tailwind utility classes; project-specific custom classes live in `tailwind.config.ts`.
- Co-locate component-specific types in the same file.

## Testing

- **Framework:** Vitest + React Testing Library.
- Test files live next to source: `Component.test.tsx`.
- Use `describe` / `it` blocks with clear behavior descriptions.
- Mock Supabase client in tests using `vi.mock`.
- E2E tests in `e2e/` directory.
