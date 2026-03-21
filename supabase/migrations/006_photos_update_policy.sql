-- 006_photos_update_policy.sql — Add missing UPDATE policy for photos table
-- The edit form needs to reassign is_primary when the primary photo is removed

create policy "Authenticated users can update photos"
  on photos for update
  to authenticated
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role in ('admin', 'editor')
    )
  );
