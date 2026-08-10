-- ضمان ترتيب زمني دقيق للأحداث المتقاربة داخل نفس المعاملة:
-- now() ثابت على مستوى المعاملة، أما clock_timestamp() فيتقدم لكل صف.
ALTER TABLE public.work_item_events ALTER COLUMN occurred_at SET DEFAULT clock_timestamp();