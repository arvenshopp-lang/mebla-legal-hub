# MEHLA — تنفيذ حماية المستندات (Defense-in-Depth) داخل البنية الحالية

## الوضع المُثبت الآن (قراءة فعلية)
- `public.documents` لا يحمل حالة أمنية حقيقية: الأعمدة الموجودة `file_status` (قيمها اليوم: `AVAILABLE` 40 صف، `UNCHECKED` 2)، `storage_verified_at`، بلا `sha256` ولا نتيجة فحص ولا حالة حجر.
- `public.email_attachments` يحمل بالفعل `sha256`, `scan_status`, `scan_detail`, `is_quarantined` — لكن لا يوجد فرض لها قبل إصدار Signed URL أو بناء MIME.
- لا توجد وحدة تحقق ملفات مركزية (لا كشف magic bytes ولا polyglot) في `src/lib`.
- `/api/public/doc/$token` بتذكرة `kind=process` يعيد البايتات الأصلية بلا أي بوابة (CF-21).
- `secure-view/cleanup.server.ts` يحسب orphan عالمياً ثم يحذف بمفتاح خدمة بلا نطاق مكتب (CF-20).
- أسرار توقيع بنمط `SECRET || fallback` في مسار العقود والروابط.

## ما سأنفذه (كله additive وقابل للـ Rollback)

### 1. Migration واحدة آمنة (بلا حذف بيانات)
- جدول `document_security_state`: `document_id`, `organization_id`, `state` (enum: `uploaded, quarantined, scanning, clean, malicious, unscannable, failed, released`), `sha256`, `bytes`, `declared_mime`, `detected_mime`, `decision_id`, `decided_at`, `reason`, `correlation_id`.
- جدول `document_security_events` (append-only، تُمنع UPDATE/DELETE بـ trigger) لكل: upload/scan/decision/release/denial/cross-tenant attempt/cleanup/reclassification.
- Trigger `document_security_transition_guard`: يرفض أي `UPDATE` لا يطابق الانتقالات المسموحة، ويرفض `state='released'` إن لم يوجد قرار موقّع + تطابق `sha256`.
- RPC واحدة مُحصّنة `security.transition_document_state(...)`: `SECURITY DEFINER`, `SET search_path`, `REVOKE EXECUTE FROM PUBLIC`, تحقق مكتب + غرض + حالة.
- Backfill غير مدمّر: الصفوف الأربعون الحالية `AVAILABLE` تُنقل إلى `released` (grandfathered، مع سبب `legacy_grandfathered` في السجل) حتى لا تنكسر مكاتب الإنتاج؛ الصفان `UNCHECKED` → `quarantined`.
- GRANTs صريحة لكل جدول جديد + RLS بعزل مكتب.

### 2. بوابة إفراج مركزية واحدة
`src/lib/file-security/release-gate.server.ts` — دالة واحدة `assertReleasable(documentId, purpose)` تُستدعى إلزامياً من كل مسار: download, preview, print, OCR, AI, email attachment, public media, share, background processing. **Fail closed**: أي خطأ/timeout/حالة مجهولة = منع + حدث تدقيق `denied`.

### 3. تحقق فعلي من الملف قبل القبول
`src/lib/file-security/validate.server.ts`: امتداد + MIME معلن + MIME مكتشف من magic bytes، بنية PDF/OOXML/الصور، مؤشرات polyglot، امتداد مزدوج، أسماء خطرة، path traversal، ملفات مشفّرة/غير قابلة للفحص. أي عدم تطابق ⇒ `quarantined` لا `clean`.

### 4. حدود استهلاك صارمة
`src/lib/file-security/limits.ts`: حجم، حجم مفكوك، نسبة الضغط، عمق الأرشيف، صفحات PDF، أبعاد/بكسلات الصورة، مهلة، سقف ذاكرة، قرص مؤقت. التجاوز يوقف معالجة الملف فقط ويعيده إلى `unscannable` — لا يسقط المنصة.

### 5. إصلاح Secure View و kind=process
- المعاينة تُخدم فقط من مشتق آمن (PDF مُعاد بناؤه/مختوم)، لا من الأصل.
- `kind=process` يمر عبر `assertReleasable(..., 'process')` ولا يُصدر بايتات خام إلا لحالة `clean/released`، وبمعرّف ارتباط مسجّل.

### 6. البريد والوسائط العامة وOCR/AI
- كل Signed URL / حذف / بناء MIME في `email/attachments.server.ts` يمر بالبوابة + فحص `organization_id` صريح (مفقود اليوم).
- `office-page.ops.server.ts`: `draft → validate → release → publish`؛ يستحيل النشر بلا `released`.
- `document-ai.server.ts` / `document-pipeline.ts`: لا قراءة بايتات قبل البوابة، وتسجيل صريح لأي خروج بيانات إلى مزود خارجي.

### 7. سلامة المحتوى وحجب رجعي
SHA-256 يُثبَّت مع القرار. أي اختلاف في البصمة عند التسليم ⇒ `SECURITY DECISION INVALID` + إعادة حجر فوري. إعادة تصنيف ملف إلى `malicious` تمنع فوراً التنزيل/المعاينة/OCR/المشاركة.

### 8. Cleanup آمن (CF-20)
إعادة كتابة منطق orphan: نطاق لكل مكتب، حد أدنى لعمر الكائن (grace window) يمنع حذف رفع قيد التنفيذ، مطابقة مزدوجة قبل الحذف، ومنع الحذف إذا فشل بناء مجموعة المراجع (fail closed بدل حذف).

### 9. الأسرار
إزالة كل `SECRET || SERVICE_ROLE_KEY` / `|| URL` / `|| hardcoded` واستبدالها بفشل عند بدء التشغيل عند غياب السر.

### 10. حرّاس CI واختبارات
- `scripts/security/file-guards.mjs` (يُضاف إلى `security:check`): يمنع مستقبلاً أي storage delivery مباشر، مسار ملف غير موقّع، parser خام جديد، مسار رفع عام جديد، أو UPDATE مباشر لحالة أمنية.
- اختبارات آمنة (بلا malware حقيقي وبلا اختبار تدميري على الإنتاج): MIME spoofing، امتداد مزدوج، محاكاة polyglot، PDF/OOXML تالف، صور ضخمة، محاكاة قنبلة ضغط آمنة، إعادة استخدام رمز، عبور مكاتب، تسابق، تجاوز حالة، فشل الماسح/التخزين/قاعدة البيانات.

## ما يتطلب بنية خارج Lovable (لن أخفض المستوى بصمت)
AV/YARA حقيقي، MicroVM/sandbox للتفجير الديناميكي، KMS بمفاتيح غير قابلة للتصدير، Object Lock للحجر. سأنفّذ داخلياً: فحص بنيوي + validation + حدود + عزل منطقي + بوابة fail-closed، وأحدد هذه الأربعة كمتطلبات بنية خارجية صريحة في التقرير النهائي.

## ملاحظة تنفيذية
لا حذف لأي مستند عميل، ولا اختبار تدميري على الإنتاج. كل Migration additive؛ الـ Rollback = إسقاط الجداول/التريجرات الجديدة وتعطيل استدعاء البوابة عبر مفتاح واحد، فتعود المسارات إلى سلوكها الحالي دون فقدان بيانات.
