-- Migration 018: Replace invites.role text with role_id UUID FK
--
-- The old role column stored 'admin' or 'editor' text. This replaces it
-- with a direct FK to the roles table, enabling custom role selection
-- when creating invites and eliminating mapping logic in the claim flow.

-- Step 1: Add role_id column (nullable for backfill)
ALTER TABLE invites ADD COLUMN role_id uuid REFERENCES roles(id);

-- Step 2: Backfill existing invites
UPDATE invites SET role_id = (
  SELECT r.id FROM roles r
  WHERE r.org_id = invites.org_id
    AND r.base_role = CASE invites.role WHEN 'admin' THEN 'org_admin' ELSE 'contributor' END
  LIMIT 1
);

-- Step 3: Make NOT NULL
ALTER TABLE invites ALTER COLUMN role_id SET NOT NULL;

-- Step 4: Drop old text column (also drops the CHECK constraint)
ALTER TABLE invites DROP COLUMN role;
