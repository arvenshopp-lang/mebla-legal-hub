-- 1) Defense-in-depth: never allow browser roles to touch objects in the
--    server-only buckets, regardless of future permissive policies or a
--    public-bucket toggle. Restrictive policies are ANDed, so other buckets
--    (email-attachments, office-media-draft) keep their existing behaviour.
DROP POLICY IF EXISTS "server only buckets block browser roles" ON storage.objects;
CREATE POLICY "server only buckets block browser roles"
  ON storage.objects
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (bucket_id NOT IN ('documents', 'office-public-media'))
  WITH CHECK (bucket_id NOT IN ('documents', 'office-public-media'));

-- 2) Recipient PII in sales documents is staff-only. External recipients are
--    served through signed server routes, never the Data API. Block anon hard.
DROP POLICY IF EXISTS "sales documents deny anonymous" ON public.sales_documents;
CREATE POLICY "sales documents deny anonymous"
  ON public.sales_documents
  AS RESTRICTIVE
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON public.sales_documents FROM anon;
REVOKE ALL ON public.sales_document_items FROM anon;
REVOKE ALL ON public.sales_document_signatures FROM anon;
REVOKE ALL ON public.sales_document_events FROM anon;