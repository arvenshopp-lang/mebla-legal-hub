-- (1) إلغاء تنفيذ public.recalc_invoice عن الزوّار و PUBLIC
REVOKE ALL ON FUNCTION public.recalc_invoice(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recalc_invoice(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.recalc_invoice(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalc_invoice(uuid) TO service_role;

-- (2) سياسات صريحة لدلو email-attachments على storage.objects
CREATE OR REPLACE FUNCTION private.can_read_email_attachment(_object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
  SELECT auth.uid() IS NOT NULL
     AND private.has_platform_permission(auth.uid(), 'email.read')
     AND EXISTS (
       SELECT 1 FROM public.email_attachments a
       WHERE a.storage_path = _object_name
         AND coalesce(a.is_quarantined, false) = false
     );
$$;

REVOKE ALL ON FUNCTION private.can_read_email_attachment(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_read_email_attachment(text) TO authenticated, service_role;

DROP POLICY IF EXISTS mail_attachments_select ON storage.objects;
CREATE POLICY mail_attachments_select
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'email-attachments'
  AND private.can_read_email_attachment(name)
);

DROP POLICY IF EXISTS mail_attachments_insert ON storage.objects;
CREATE POLICY mail_attachments_insert
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'email-attachments'
  AND auth.uid() IS NOT NULL
  AND private.has_platform_permission(auth.uid(), 'email.manage')
);

DROP POLICY IF EXISTS mail_attachments_update ON storage.objects;
CREATE POLICY mail_attachments_update
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'email-attachments'
  AND auth.uid() IS NOT NULL
  AND private.has_platform_permission(auth.uid(), 'email.manage')
)
WITH CHECK (
  bucket_id = 'email-attachments'
  AND auth.uid() IS NOT NULL
  AND private.has_platform_permission(auth.uid(), 'email.manage')
);

DROP POLICY IF EXISTS mail_attachments_delete ON storage.objects;
CREATE POLICY mail_attachments_delete
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'email-attachments'
  AND auth.uid() IS NOT NULL
  AND private.has_platform_permission(auth.uid(), 'email.manage')
);