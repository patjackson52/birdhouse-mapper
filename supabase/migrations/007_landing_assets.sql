-- Create landing-assets storage bucket for landing page images and documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('landing-assets', 'landing-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Note: The landing_page key is a NEW key in site_config, not part of the original seed.
-- Server actions use upsert (not update) since the row may not exist yet.
-- The site_config table has a unique constraint on the `key` column.

-- Public SELECT: anyone can view landing page images
CREATE POLICY "Public read access for landing assets"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'landing-assets');

-- Admin INSERT: only authenticated admin users can upload
CREATE POLICY "Admin users can upload landing assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'landing-assets'
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Admin DELETE: only authenticated admin users can delete
CREATE POLICY "Admin users can delete landing assets"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'landing-assets'
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
