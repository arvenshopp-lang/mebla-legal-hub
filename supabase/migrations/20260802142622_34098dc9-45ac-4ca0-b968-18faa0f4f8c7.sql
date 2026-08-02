REVOKE EXECUTE ON FUNCTION public.consume_ocr_pages(uuid, integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_service_usage_summary() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.consume_ocr_pages(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_service_usage_summary() TO authenticated, service_role;

DROP POLICY IF EXISTS "staff write audit log" ON public.admin_audit_logs;
CREATE POLICY "staff write audit log" ON public.admin_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    private.is_platform_staff(auth.uid())
    AND actor_id = auth.uid()
    AND (
      actor_email IS NULL
      OR lower(actor_email) = lower(coalesce((SELECT p.email FROM public.profiles p WHERE p.id = auth.uid()), actor_email))
    )
  );

DROP POLICY IF EXISTS "support staff add messages" ON public.support_ticket_messages;
CREATE POLICY "support staff add messages" ON public.support_ticket_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND is_staff = true
    AND private.has_platform_permission(auth.uid(), 'tickets.reply')
  );