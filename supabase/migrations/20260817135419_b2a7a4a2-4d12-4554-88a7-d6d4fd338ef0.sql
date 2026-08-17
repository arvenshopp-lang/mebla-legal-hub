-- 1) Explicit per-bucket server-only enforcement for private buckets.
DROP POLICY IF EXISTS "documents bucket is server only" ON storage.objects;
CREATE POLICY "documents bucket is server only"
  ON storage.objects
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (bucket_id <> 'documents')
  WITH CHECK (bucket_id <> 'documents');

DROP POLICY IF EXISTS "office public media bucket is server only" ON storage.objects;
CREATE POLICY "office public media bucket is server only"
  ON storage.objects
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (bucket_id <> 'office-public-media')
  WITH CHECK (bucket_id <> 'office-public-media');

-- 2) office_leads: least privilege. Inserts/deletes are server-only (service_role).
REVOKE ALL ON public.office_leads FROM anon;
REVOKE ALL ON public.office_leads FROM authenticated;
GRANT SELECT, UPDATE ON public.office_leads TO authenticated;
GRANT ALL ON public.office_leads TO service_role;

-- Belt-and-braces: no browser role may write leads even if a grant is re-added.
DROP POLICY IF EXISTS "office leads are server only for writes" ON public.office_leads;
CREATE POLICY "office leads are server only for writes"
  ON public.office_leads
  AS RESTRICTIVE
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "office leads deny anon reads" ON public.office_leads;
CREATE POLICY "office leads deny anon reads"
  ON public.office_leads
  AS RESTRICTIVE
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);