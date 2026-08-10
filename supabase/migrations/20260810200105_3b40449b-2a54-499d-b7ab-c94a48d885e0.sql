REVOKE ALL ON TABLE public.work_item_events FROM anon;
REVOKE ALL ON TABLE public.work_item_events FROM authenticated;

GRANT SELECT ON TABLE public.work_item_events TO authenticated;
GRANT ALL ON TABLE public.work_item_events TO service_role;