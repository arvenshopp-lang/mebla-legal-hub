-- 1) حالة الدور
ALTER TABLE public.platform_roles ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- الدور المعطّل لا يمنح أي صلاحية
CREATE OR REPLACE FUNCTION private.base_platform_permissions(_user_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT coalesce(
    (SELECT array_agg(DISTINCT p) FROM (
       SELECT unnest(coalesce(s.permissions, '{}'::text[])) AS p
       FROM public.platform_staff s WHERE s.user_id = _user_id AND s.status = 'active'
       UNION
       SELECT unnest(coalesce(r.permissions, '{}'::text[])) AS p
       FROM public.platform_staff s
       JOIN public.platform_roles r ON r.id = s.role_id AND r.is_active
       WHERE s.user_id = _user_id AND s.status = 'active'
     ) x), '{}'::text[])
$function$;

-- 2) مرجع/تذكرة للمنح
ALTER TABLE public.platform_permission_grants ADD COLUMN IF NOT EXISTS reference text;

-- 3) توسيع قيود الوصول
ALTER TABLE public.platform_staff_restrictions
  ADD COLUMN IF NOT EXISTS denied_ips text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS blocked_devices text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS effective_from timestamptz,
  ADD COLUMN IF NOT EXISTS effective_to timestamptz;

-- 4) إصلاح أمني: بنود الفاتورة تتبع صلاحية قراءة الفاتورة نفسها
DROP POLICY IF EXISTS "invoice items readable with invoice" ON public.platform_invoice_items;
CREATE POLICY "invoice items follow invoice access"
ON public.platform_invoice_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.platform_invoices i
    WHERE i.id = platform_invoice_items.invoice_id
      AND (
        private.has_platform_permission(auth.uid(), 'billing.read')
        OR (
          i.status <> 'draft'
          AND (
            i.user_id = auth.uid()
            OR private.is_organization_member(i.organization_id, auth.uid())
          )
        )
      )
  )
);