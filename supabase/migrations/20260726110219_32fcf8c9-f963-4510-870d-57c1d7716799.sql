
-- Restrict SECURITY DEFINER helpers to authenticated only
REVOKE EXECUTE ON FUNCTION public.is_organization_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_organization_role(uuid, uuid, public.app_role[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_access_case(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_organization_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_organization_role(uuid, uuid, public.app_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_case(uuid, uuid) TO authenticated;

-- Storage policies: documents bucket, path = <organization_id>/...
CREATE POLICY "docs_storage_select" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'documents'
  AND public.is_organization_member((storage.foldername(name))[1]::uuid, auth.uid())
);
CREATE POLICY "docs_storage_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND public.has_organization_role((storage.foldername(name))[1]::uuid, auth.uid(),
      ARRAY['owner','admin','lawyer','legal_assistant']::public.app_role[])
);
CREATE POLICY "docs_storage_update" ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'documents'
  AND public.has_organization_role((storage.foldername(name))[1]::uuid, auth.uid(),
      ARRAY['owner','admin','lawyer','legal_assistant']::public.app_role[])
);
CREATE POLICY "docs_storage_delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'documents'
  AND public.has_organization_role((storage.foldername(name))[1]::uuid, auth.uid(),
      ARRAY['owner','admin']::public.app_role[])
);
