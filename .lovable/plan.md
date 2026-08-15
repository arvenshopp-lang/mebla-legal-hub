# MEHLA-SALES-002 — مراجعة أمان بعد التنفيذ (READ-ONLY)

لم يُعدَّل أي ملف، ولا Migration، ولا بيانات.

## نتائج المراجعة

ATOMIC_TRANSACTION: **NO**
- كل خطوة استدعاء PostgREST مستقل عبر `supabaseAdmin` في `cancelDraft` (src/lib/sales-docs.server.ts). لا وجود لـ transaction واحدة ولا RPC.

MUTATION_ORDER:
1. جلب المستند + التحقق (status=draft، غير locked، number IS NULL)
2. التحقق من غياب التوقيعات (`sales_document_signatures`)
3. `assertTransition(draft → cancelled)`
4. UPDATE status = cancelled (مع شرط `.eq("status","draft")`) — يُفحص خطؤه
5. INSERT حدث `draft_discarded` عبر `logEvent` — **لا يُفحص خطؤه إطلاقاً**
6. `writeAudit` سجل التدقيق الإداري — لا يُفحص خطؤه

PARTIAL_FAILURE_RISK: **مؤكد (سيناريو A و C)**
- A: الحالة صارت `cancelled` وفشل إدراج الحدث بصمت ⇒ المسودة **تبقى ظاهرة** في القوائم لكن بحالة «ملغاة» بلا أي أثر في سجل الأحداث ⇒ تناقض بين الحالة والسجل، والمستخدم يرى العملية «ناجحة» (لا يُرجع خطأ).
- C: الحالة والحدث نجحا وفشل `admin_audit_logs` بصمت ⇒ عملية بلا سجل إداري.
- B (حدث بلا تحديث حالة) غير ممكن بالترتيب الحالي، لكنه سيصبح ممكناً لو عُكس الترتيب — وهو الأخطر لأنه **يخفي مسودة ما زالت draft**.

SAFE_DISCRIMINATOR_LOGIC: **غير كافٍ**
- `discardedDraftIds()` تقرأ `sales_document_events` بشرط `event = 'draft_discarded'` فقط، وتعيد `document_id` المميّزة. الربط بالمستند صحيح (`document_id`)، لكن **لا يوجد أي شرط على `status = 'cancelled'`**، فالحدث وحده يخفي السجل — ما يعني أن حدثاً منفرداً (أو مستنداً أعيد إلى مسار آخر) قادر على إخفاء مستند حالته ليست ملغاة.

TENANT_ISOLATION: **PASS (بملاحظة)**
- المسار كله داخل `/mehla-admin` بصلاحية `sales_docs.read/delete` عبر `requireStaff`، والاستعلامات في `crm.functions.ts` (شركة/فرصة) مقيّدة أصلاً بـ `company_id` / `deal_id`، والاستبعاد يتم بمطابقة `id` داخل نفس النتيجة. لا يخرج أي محتوى مستند لمكتب آخر.
- ملاحظة: `discardedDraftIds` تُقرأ عبر admin client بلا أي حد أو نطاق، فتجلب معرّفات أحداث المنصة بالكامل — أوسع من المطلوب رغم أنها لا تُعرض.

QUERY_PATTERN: **DATABASE_FILTER + قائمة معرّفات غير محدودة**
- قائمة Sales تُطبّق `.in(...)` / `.not("id","in",(...))` على الخادم (وليس تصفية في JavaScript).
- CRM يجلب مجموعة المعرّفات ثم يصفّي في JavaScript على مصفوفة المستندات (استعلام واحد، لا استعلام لكل مستند).

N_PLUS_ONE_RISK: **لا** — استعلام واحد إضافي ثابت. المخاطرة الحقيقية هي نمو قائمة المعرّفات بلا حد (طول URL/ذاكرة) مع الوقت.

SERVER_AUTHORIZATION: **PASS** — `salesCancelDraft` تفرض `requireStaff(..., "sales_docs.delete")` داخل معالج الخادم قبل استدعاء المحرك، ومستقلة عن `sales_docs.decide`. الاستدعاء المباشر للدالة دون واجهة يخضع للفحص نفسه.

ELIGIBILITY_SERVER_SIDE: **PASS** — draft، number IS NULL، غير locked، لا توقيعات، وانتقال حالة مُتحقق — كلها خادمية، مع شرط تنافسي `.eq("status","draft")` في UPDATE.

OLD_HARD_DELETE_CALLERS: **PASS** — لا يوجد أي `.delete()` على `sales_documents` في الكود، ولا دالة خادمية قديمة للحذف الصلب؛ الواجهة في `sales/$id.tsx` تستدعي `salesCancelDraft` فقط.

EVENT_SERVER_CONTROLLED: **PASS** — اسم الحدث ثابت `DISCARD_EVENT` في الخادم، لا يأتي من المدخلات (المُدخل معرّف المستند فقط)، ولم تُمس حمايات Append-Only.

DEPLOYMENT_RECOMMENDATION: **FIX_REQUIRED_BEFORE_DEPLOY**

ATOMICITY_GAP_CONFIRMED

## أصغر إصلاح ممكن (بدون Migration — غير منفَّذ)

1. `logEvent`: إرجاع خطأ الإدراج بدل تجاهله (أو نسخة تتحقق منه في مسار الإلغاء فقط).
2. في `cancelDraft`: إذا فشل إدراج `draft_discarded` ⇒ تعويض فوري بإرجاع الحالة إلى `draft` (`update status='draft' where id and status='cancelled'`) ثم رفع خطأ عربي بمرجع تتبع — فلا تبقى حالة متناقضة ولا نجاح كاذب.
3. تقوية المُميِّز: أن يُبنى الاستبعاد على **status = 'cancelled' مع وجود الحدث لنفس المستند**، لا على الحدث وحده (مثلاً تقييد `discardedDraftIds` بمعرّفات المستندات الملغاة المعروضة فعلاً، أو التحقق من الحالة عند التصفية).
4. `writeAudit`: تسجيل فشله كخطأ خادمي صريح (لا كتم صامت) دون التراجع عن العملية.

لا شيء منها يحتاج تغييراً في المخطط أو الـ Triggers. STOP.
