-- Create branding storage bucket for logos and icons
INSERT INTO storage.buckets (id, name, public)
VALUES ('branding', 'branding', true)
ON CONFLICT (id) DO NOTHING;

-- Public read: anyone can view branding assets
CREATE POLICY "Public read access for branding"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'branding');

-- Authenticated org admins can upload branding assets
CREATE POLICY "Org admins can upload branding assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'branding'
    AND (is_platform_admin() OR EXISTS (SELECT 1 FROM user_org_admin_org_ids()))
  );

-- Authenticated org admins can update branding assets
CREATE POLICY "Org admins can update branding assets"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'branding'
    AND (is_platform_admin() OR EXISTS (SELECT 1 FROM user_org_admin_org_ids()))
  );

-- Authenticated org admins can delete branding assets
CREATE POLICY "Org admins can delete branding assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'branding'
    AND (is_platform_admin() OR EXISTS (SELECT 1 FROM user_org_admin_org_ids()))
  );
