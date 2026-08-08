-- عزل المستأجر: التذكرة يجب أن تنتمي لمكتب المستخدم فعلياً
DROP POLICY IF EXISTS "users create own tickets" ON public.support_tickets;

CREATE POLICY "users create own tickets"
ON public.support_tickets
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (
    organization_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.organization_members m
      WHERE m.organization_id = support_tickets.organization_id
        AND m.user_id = auth.uid()
        AND m.status = 'active'
    )
  )
);