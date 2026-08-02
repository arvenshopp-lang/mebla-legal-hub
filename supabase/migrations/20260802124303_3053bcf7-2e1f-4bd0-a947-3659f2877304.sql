-- ============================ Arabic text normalisation ============================

CREATE OR REPLACE FUNCTION public.normalize_ar(_input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT regexp_replace(
           translate(
             regexp_replace(coalesce(_input, ''), '[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]', '', 'g'),
             'أإآٱىئؤةڤگچپژ',
             'اااايياهفكجبز'
           ),
           '\s+', ' ', 'g')
$$;

COMMENT ON FUNCTION public.normalize_ar(text) IS
  'يوحّد أشكال الهمزات والألف والياء والتاء المربوطة ويحذف التشكيل والتطويل للبحث العربي.';

-- ================================ processing jobs ================================

CREATE TYPE public.document_job_status AS ENUM
  ('queued', 'extracting', 'ocr_processing', 'indexing', 'completed', 'failed');

CREATE TABLE public.document_processing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  status public.document_job_status NOT NULL DEFAULT 'queued',
  processing_type text NOT NULL DEFAULT 'text',
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  pages_total integer,
  pages_done integer NOT NULL DEFAULT 0,
  ocr_pages integer NOT NULL DEFAULT 0,
  attempts integer NOT NULL DEFAULT 0,
  error_code text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_processing_jobs_document_key UNIQUE (document_id)
);

GRANT SELECT, INSERT, UPDATE ON public.document_processing_jobs TO authenticated;
GRANT ALL ON public.document_processing_jobs TO service_role;
ALTER TABLE public.document_processing_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY jobs_select ON public.document_processing_jobs FOR SELECT TO authenticated
  USING (private.is_organization_member(organization_id, auth.uid()));
CREATE POLICY jobs_insert ON public.document_processing_jobs FOR INSERT TO authenticated
  WITH CHECK (private.has_organization_role(organization_id, auth.uid(),
    ARRAY['owner','admin','lawyer','legal_assistant']::app_role[]));
CREATE POLICY jobs_update ON public.document_processing_jobs FOR UPDATE TO authenticated
  USING (private.has_organization_role(organization_id, auth.uid(),
    ARRAY['owner','admin','lawyer','legal_assistant']::app_role[]))
  WITH CHECK (private.has_organization_role(organization_id, auth.uid(),
    ARRAY['owner','admin','lawyer','legal_assistant']::app_role[]));

CREATE INDEX document_processing_jobs_org_idx ON public.document_processing_jobs (organization_id, status);
CREATE TRIGGER document_processing_jobs_touch BEFORE UPDATE ON public.document_processing_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ================================ document pages ================================

CREATE TABLE public.document_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  page_number integer NOT NULL CHECK (page_number > 0),
  extracted_text text NOT NULL DEFAULT '',
  original_text text,
  ocr_used boolean NOT NULL DEFAULT false,
  ocr_confidence numeric(4,3),
  language text,
  is_blank boolean NOT NULL DEFAULT false,
  edited_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  edited_at timestamptz,
  search_vector tsvector GENERATED ALWAYS AS
    (to_tsvector('simple'::regconfig, public.normalize_ar(extracted_text))) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_pages_unique UNIQUE (document_id, page_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_pages TO authenticated;
GRANT ALL ON public.document_pages TO service_role;
ALTER TABLE public.document_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY pages_select ON public.document_pages FOR SELECT TO authenticated
  USING (private.is_organization_member(organization_id, auth.uid()));
CREATE POLICY pages_insert ON public.document_pages FOR INSERT TO authenticated
  WITH CHECK (private.has_organization_role(organization_id, auth.uid(),
    ARRAY['owner','admin','lawyer','legal_assistant']::app_role[]));
CREATE POLICY pages_update ON public.document_pages FOR UPDATE TO authenticated
  USING (private.has_organization_role(organization_id, auth.uid(),
    ARRAY['owner','admin','lawyer','legal_assistant']::app_role[]))
  WITH CHECK (private.has_organization_role(organization_id, auth.uid(),
    ARRAY['owner','admin','lawyer','legal_assistant']::app_role[]));
CREATE POLICY pages_delete ON public.document_pages FOR DELETE TO authenticated
  USING (private.has_organization_role(organization_id, auth.uid(),
    ARRAY['owner','admin']::app_role[]));

CREATE INDEX document_pages_search_idx ON public.document_pages USING GIN (search_vector);
CREATE INDEX document_pages_doc_idx ON public.document_pages (document_id, page_number);
CREATE INDEX document_pages_org_idx ON public.document_pages (organization_id);
CREATE TRIGGER document_pages_touch BEFORE UPDATE ON public.document_pages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- كل تعديل يدوي يحفظ النسخة الأصلية مرة واحدة فقط.
CREATE OR REPLACE FUNCTION public.document_pages_track_edit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.extracted_text IS DISTINCT FROM OLD.extracted_text THEN
    IF OLD.original_text IS NULL THEN
      NEW.original_text := OLD.extracted_text;
    END IF;
    NEW.edited_by := auth.uid();
    NEW.edited_at := now();
  END IF;
  NEW.organization_id := OLD.organization_id;
  NEW.document_id := OLD.document_id;
  NEW.page_number := OLD.page_number;
  RETURN NEW;
END;
$$;

CREATE TRIGGER document_pages_edit_guard BEFORE UPDATE ON public.document_pages
  FOR EACH ROW EXECUTE FUNCTION public.document_pages_track_edit();

-- ============================== document search API ==============================

CREATE OR REPLACE FUNCTION public.search_document_pages(
  _query text,
  _case_id uuid DEFAULT NULL,
  _client_id uuid DEFAULT NULL,
  _file_type text DEFAULT NULL,
  _ocr_only boolean DEFAULT false,
  _from date DEFAULT NULL,
  _to date DEFAULT NULL,
  _limit integer DEFAULT 20,
  _offset integer DEFAULT 0
)
RETURNS TABLE(
  document_id uuid,
  page_id uuid,
  page_number integer,
  file_name text,
  file_type text,
  document_created_at timestamptz,
  case_id uuid,
  case_title text,
  client_id uuid,
  client_name text,
  ocr_used boolean,
  snippet text,
  rank real,
  total_count bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH q AS (
    SELECT websearch_to_tsquery('simple'::regconfig, public.normalize_ar(_query)) AS tsq
  ), matched AS (
    SELECT p.id AS page_id, p.document_id, p.page_number, p.ocr_used, p.extracted_text,
           d.file_name, d.file_type, d.created_at AS document_created_at,
           d.case_id, c.case_title, d.client_id, cl.full_name AS client_name,
           ts_rank(p.search_vector, (SELECT tsq FROM q)) AS rank
    FROM public.document_pages p
    JOIN public.documents d ON d.id = p.document_id
    LEFT JOIN public.cases c ON c.id = d.case_id
    LEFT JOIN public.clients cl ON cl.id = d.client_id
    WHERE (SELECT tsq FROM q) IS NOT NULL
      AND p.search_vector @@ (SELECT tsq FROM q)
      AND (_case_id IS NULL OR d.case_id = _case_id)
      AND (_client_id IS NULL OR d.client_id = _client_id)
      AND (_file_type IS NULL OR coalesce(d.file_type, '') ILIKE '%' || _file_type || '%')
      AND (_ocr_only IS NOT TRUE OR p.ocr_used)
      AND (_from IS NULL OR d.created_at >= _from)
      AND (_to IS NULL OR d.created_at < (_to + 1))
  )
  SELECT m.document_id, m.page_id, m.page_number, m.file_name, m.file_type, m.document_created_at,
         m.case_id, m.case_title, m.client_id, m.client_name, m.ocr_used,
         ts_headline('simple'::regconfig, public.normalize_ar(m.extracted_text), (SELECT tsq FROM q),
                     'StartSel=<mark>,StopSel=</mark>,MaxWords=32,MinWords=12,MaxFragments=2,FragmentDelimiter= … ') AS snippet,
         m.rank,
         (SELECT count(*) FROM matched) AS total_count
  FROM matched m
  ORDER BY m.rank DESC, m.document_created_at DESC, m.page_number
  LIMIT greatest(1, least(coalesce(_limit, 20), 50))
  OFFSET greatest(0, coalesce(_offset, 0))
$$;

REVOKE ALL ON FUNCTION public.search_document_pages(text, uuid, uuid, text, boolean, date, date, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_document_pages(text, uuid, uuid, text, boolean, date, date, integer, integer) TO authenticated;
REVOKE ALL ON FUNCTION public.normalize_ar(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalize_ar(text) TO authenticated, service_role;

-- ============================== OCR quota accounting ==============================

CREATE OR REPLACE FUNCTION public.consume_ocr_pages(_organization_id uuid, _pages integer)
RETURNS TABLE(allowed boolean, used integer, monthly_limit integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_period date := date_trunc('month', now())::date;
  v_limit integer;
  v_used integer;
BEGIN
  IF NOT private.is_organization_member(_organization_id, auth.uid()) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  SELECT p.ocr_pages_monthly INTO v_limit
  FROM private.org_effective_plan(_organization_id) p;

  SELECT coalesce(uc.used, 0) INTO v_used
  FROM public.usage_counters uc
  WHERE uc.organization_id = _organization_id
    AND uc.metric = 'ocr_pages'
    AND uc.period_start = v_period;

  v_used := coalesce(v_used, 0);

  IF v_limit IS NOT NULL AND v_used + greatest(_pages, 0) > v_limit THEN
    RETURN QUERY SELECT false, v_used, v_limit;
    RETURN;
  END IF;

  INSERT INTO public.usage_counters (organization_id, metric, period_start, used)
  VALUES (_organization_id, 'ocr_pages', v_period, greatest(_pages, 0))
  ON CONFLICT (organization_id, metric, period_start)
  DO UPDATE SET used = public.usage_counters.used + greatest(_pages, 0), updated_at = now()
  RETURNING public.usage_counters.used INTO v_used;

  RETURN QUERY SELECT true, v_used, v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_ocr_pages(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_ocr_pages(uuid, integer) TO authenticated;

-- ======================= platform-side aggregate metrics only ======================

CREATE OR REPLACE FUNCTION public.admin_service_usage_summary()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT CASE WHEN private.has_platform_permission(auth.uid(), 'analytics.view') THEN jsonb_build_object(
    'ocr_pages_month', (SELECT coalesce(sum(used), 0) FROM public.usage_counters
                        WHERE metric = 'ocr_pages' AND period_start = date_trunc('month', now())::date),
    'ocr_pages_total', (SELECT coalesce(sum(used), 0) FROM public.usage_counters WHERE metric = 'ocr_pages'),
    'indexed_documents', (SELECT count(DISTINCT document_id) FROM public.document_pages),
    'indexed_pages', (SELECT count(*) FROM public.document_pages),
    'jobs_completed', (SELECT count(*) FROM public.document_processing_jobs WHERE status = 'completed'),
    'jobs_failed', (SELECT count(*) FROM public.document_processing_jobs WHERE status = 'failed'),
    'jobs_running', (SELECT count(*) FROM public.document_processing_jobs
                     WHERE status IN ('queued','extracting','ocr_processing','indexing')),
    'avg_processing_seconds', (SELECT coalesce(round(avg(extract(epoch FROM (completed_at - started_at)))::numeric, 1), 0)
                               FROM public.document_processing_jobs
                               WHERE status = 'completed' AND started_at IS NOT NULL AND completed_at IS NOT NULL),
    'error_codes', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
                      SELECT coalesce(error_code, 'UNKNOWN') AS code, count(*) AS count
                      FROM public.document_processing_jobs WHERE status = 'failed'
                      GROUP BY 1 ORDER BY 2 DESC LIMIT 10) x)
  ) ELSE NULL::jsonb END
$$;

REVOKE ALL ON FUNCTION public.admin_service_usage_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_service_usage_summary() TO authenticated;