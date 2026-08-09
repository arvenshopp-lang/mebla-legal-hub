-- إزالة أي تكرار قائم قبل فرض التفرّد (يُبقى الأقدم فقط)
WITH dupes AS (
  SELECT id, row_number() OVER (PARTITION BY correlation_id ORDER BY created_at, id) AS rn
  FROM public.platform_payments
  WHERE correlation_id IS NOT NULL
)
UPDATE public.platform_payments p
SET correlation_id = p.correlation_id || ':dup-' || p.id::text
FROM dupes d
WHERE p.id = d.id AND d.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS platform_payments_correlation_uidx
  ON public.platform_payments (correlation_id)
  WHERE correlation_id IS NOT NULL;