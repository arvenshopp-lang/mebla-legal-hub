-- حوكمة الفهرسة — أرشفة صفحات المكاتب التجريبية (QA)
-- تُطبَّق خارج بيئة Lovable (Stage H) بعد دمج الفرع والنشر.
--
-- الهدف: إخراج ثلاث صفحات مكاتب أُنشئت لأغراض الاختبار من الفضاء العام نهائياً،
-- باستخدام آلية الإيقاف الموجودة أصلاً في المخطط (status = 'unpublished')
-- دون إضافة أي حالة جديدة ودون حذف بيانات تشغيلية أو سجلات تدقيق.
--
-- قيد المخطط الحالي:
--   office_pages_status_check CHECK (status = ANY (ARRAY['draft','published','unpublished']))
-- لذلك لا توجد حالة 'archived'، و'unpublished' هي آلية الأرشفة المعتمدة.
--
-- الأثر الوظيفي: loadPublishedOfficePage تعتبر أي صفحة غير 'published' أو بلا
-- لقطة منشورة غير متاحة، فيعود المسار /office/<slug> بصفحة "غير متاحة"
-- مع HTTP 404 و X-Robots-Tag: noindex (مُثبت في تقرير التحقق).
--
-- العملية قابلة للعكس (إعادة النشر من واجهة المكتب) ولا تمسّ المكاتب ولا
-- الاشتراكات ولا أي بيانات مشترك حقيقي.

UPDATE public.office_public_pages
SET
  status = 'unpublished',
  published = NULL,
  published_at = NULL,
  suspension_reason = 'archived_qa_page_seo_governance',
  updated_at = now()
WHERE slug IN (
  'qa-f01-alpha',
  'qa-live-20260809-mktb-alrshyd-llmhamah-w',
  'qa-plan2-20260809-mktb-b'
);

-- تحقق بعد التطبيق (يجب أن تعود الحالات الثلاث 'unpublished' وبلا لقطة منشورة):
-- SELECT slug, status, published IS NULL AS published_cleared
-- FROM public.office_public_pages
-- WHERE slug IN ('qa-f01-alpha','qa-live-20260809-mktb-alrshyd-llmhamah-w','qa-plan2-20260809-mktb-b');
