-- تقوية الصلاحيات: الصلاحيات الافتراضية الواسعة تُلغى صراحة كما في بقية جداول المنصة.
REVOKE ALL ON TABLE public.organization_ranking_settings FROM anon;
REVOKE ALL ON TABLE public.operational_score_snapshots FROM anon;

REVOKE ALL ON TABLE public.organization_ranking_settings FROM authenticated;
REVOKE ALL ON TABLE public.operational_score_snapshots FROM authenticated;

GRANT SELECT, INSERT, UPDATE ON public.organization_ranking_settings TO authenticated;
GRANT SELECT ON public.operational_score_snapshots TO authenticated;

GRANT ALL ON public.organization_ranking_settings TO service_role;
GRANT ALL ON public.operational_score_snapshots TO service_role;