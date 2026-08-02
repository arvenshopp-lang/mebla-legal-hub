-- هذه الدوال Triggers داخلية فقط: تنفيذها يتم بواسطة قاعدة البيانات نفسها
-- ولا يعتمد على صلاحية EXECUTE، لذا سحب الصلاحية العامة لا يعطّل أي وظيفة.
REVOKE ALL ON FUNCTION public.support_tickets_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.support_ticket_messages_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.support_ticket_messages_after_insert() FROM PUBLIC, anon, authenticated;