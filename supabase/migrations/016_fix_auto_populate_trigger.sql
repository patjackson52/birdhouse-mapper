-- Migration 016: Fix auto_populate_org_property trigger for org-scoped tables
-- 
-- In PostgreSQL PL/pgSQL, the expression `TG_ARGV[0] = 'property_scoped' AND NEW.property_id IS NULL`
-- may attempt to evaluate NEW.property_id even when the first condition is false, throwing
-- "record has no field property_id" for tables without that column (e.g. item_types).
-- 
-- Fix: use nested IF statements to ensure NEW.property_id is only accessed for property-scoped tables.

CREATE OR REPLACE FUNCTION auto_populate_org_property()
RETURNS trigger AS $$
BEGIN
  -- Auto-populate org_id from user's active org if not set
  IF NEW.org_id IS NULL THEN
    NEW.org_id := (SELECT last_active_org_id FROM public.users WHERE id = auth.uid());
  END IF;

  -- Auto-populate property_id from org's default property if not set.
  -- Use nested IF to ensure NEW.property_id is never accessed for org-scoped tables.
  IF TG_ARGV[0] = 'property_scoped' THEN
    IF NEW.property_id IS NULL THEN
      NEW.property_id := (SELECT default_property_id FROM public.orgs WHERE id = NEW.org_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
