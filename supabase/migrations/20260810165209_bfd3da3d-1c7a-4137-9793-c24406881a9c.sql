CREATE TRIGGER design_versions_no_update BEFORE UPDATE ON public.design_versions FOR EACH ROW EXECUTE FUNCTION public.deny_update();
CREATE TRIGGER design_versions_no_delete BEFORE DELETE ON public.design_versions FOR EACH ROW EXECUTE FUNCTION public.deny_hard_delete();
CREATE TRIGGER design_audit_logs_no_update BEFORE UPDATE ON public.design_audit_logs FOR EACH ROW EXECUTE FUNCTION public.deny_update();
CREATE TRIGGER design_audit_logs_no_delete BEFORE DELETE ON public.design_audit_logs FOR EACH ROW EXECUTE FUNCTION public.deny_hard_delete();