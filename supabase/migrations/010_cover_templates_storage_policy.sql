-- Falls 009 schon ohne Storage-Policy ausgeführt wurde: Policy für Edge Function (service_role) nachtragen.
DROP POLICY IF EXISTS "cover_templates_service_role_all" ON storage.objects;
CREATE POLICY "cover_templates_service_role_all"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'cover-templates')
  WITH CHECK (bucket_id = 'cover-templates');
