CREATE OR REPLACE FUNCTION private.has_case_party_permission(_organization_id uuid, _user_id uuid, _permission text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _role app_role;
BEGIN
  IF _user_id IS NULL OR _organization_id IS NULL THEN
    RETURN false;
  END IF;

  -- لا يجوز التحقق بهوية مستخدم آخر عند وجود جلسة موقّعة.
  IF auth.uid() IS NOT NULL AND _user_id <> auth.uid() THEN
    RETURN false;
  END IF;

  SELECT m.role INTO _role
  FROM public.organization_members m
  WHERE m.organization_id = _organization_id
    AND m.user_id = _user_id
    AND m.status = 'active';

  IF _role IS NULL THEN
    RETURN false;
  END IF;

  IF _role IN ('owner','admin') THEN
    RETURN true;
  END IF;

  IF _permission = 'case_parties.read' AND _role IN ('lawyer','legal_assistant') THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.case_party_permissions p
    WHERE p.organization_id = _organization_id
      AND p.user_id = _user_id
      AND p.permission = _permission
      AND p.revoked_at IS NULL
      AND (p.expires_at IS NULL OR p.expires_at > now())
  );
END;
$function$;

CREATE OR REPLACE FUNCTION private.can_read_email_attachment(_object_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.email_attachments a
       JOIN public.email_messages m ON m.id = a.message_id
       LEFT JOIN public.email_threads t ON t.id = m.thread_id
       WHERE a.storage_path = _object_name
         AND coalesce(a.is_quarantined, false) = false
         AND coalesce(a.scan_status, 'clean') <> 'infected'
         AND (
           private.has_platform_permission(auth.uid(), 'email.read')
           OR EXISTS (
             SELECT 1
             FROM public.organization_members om
             WHERE om.user_id = auth.uid()
               AND om.status = 'active'
               AND om.organization_id = coalesce(m.organization_id, t.organization_id)
           )
         )
     );
$function$;