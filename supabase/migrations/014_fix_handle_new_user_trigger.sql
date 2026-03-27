-- Migration 014: Fix handle_new_user trigger for robust signup
-- Wraps the insert in an EXCEPTION block to prevent auth failures
-- from database-level errors, and uses INSERT ... ON CONFLICT DO NOTHING
-- to handle race conditions or re-runs.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  -- Skip anonymous users; claim server action handles their profiles.
  IF new.is_anonymous = true THEN
    RETURN new;
  END IF;

  BEGIN
    INSERT INTO users (id, display_name, email, email_verified, full_name, role)
    VALUES (
      new.id,
      new.raw_user_meta_data->>'display_name',
      new.email,
      (new.email_confirmed_at IS NOT NULL),
      COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
      'editor'
    )
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      email_verified = EXCLUDED.email_verified,
      full_name = COALESCE(EXCLUDED.full_name, users.full_name),
      display_name = COALESCE(EXCLUDED.display_name, users.display_name);
  EXCEPTION WHEN OTHERS THEN
    -- Log the error but don't fail the auth signup.
    -- The user record can be backfilled later.
    RAISE WARNING 'handle_new_user: failed to upsert user record for %, error: %', new.id, SQLERRM;
  END;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
