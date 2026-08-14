# MEHLA-SALES-002 — تشخيص فشل حذف مسودة عرض سعر (تقرير جذري، بلا تنفيذ)

## MEHLA-SALES-002
P1 — حذف مستند بيع `kind=quotation` و`status=draft` يفشل دائماً برسالة عربية عامة مع مرجع تتبع.

## DELETE_FLOW
```text
زر «حذف» (يظهر فقط عند status==='draft' و can('sales_docs.delete'))
  src/routes/mehla-admin/sales/$id.tsx:541
useServerFn(salesDeleteDraft) → { id }
  src/lib/sales-docs.functions.ts:100-110
requireSupabaseAuth (جلسة + bearer)
requireStaff(context.supabase, userId, "sales_docs.delete")   ← فحص RBAC خادمي
engine.deleteDraft({ staff }, id)                              src/lib/sales-docs.server.ts:352
  1) select status → موجود
  2) status !== 'draft' ؟ لا → يتجاوز الفحص
  3) DELETE FROM sales_documents WHERE id = $1   (supabaseAdmin، يتجاوز RLS)
       ↳ CASCADE على sales_document_items   → مسموح (trigger الحماية يمرّر حالة draft)
       ↳ CASCADE على sales_document_signatures → لا صفوف للمسودة
       ↳ CASCADE على sales_document_events  → **BEFORE DELETE trigger يرفع استثناء**
  4) fail(error, "تعذّر حذف المسودة.")  ← يُغلّف الخطأ ويعيد مرجع SD-…
  5) writeAudit(...) لا يُنفَّذ أبداً (الكود يتوقف قبله)
```

## FIRST_FAILURE_POINT
الخطوة 3 — داخل PostgreSQL أثناء الحذف المتتالي (CASCADE) لصفوف `sales_document_events`.
`CREATE TRIGGER sales_events_no_delete BEFORE DELETE ON public.sales_document_events FOR EACH ROW EXECUTE FUNCTION deny_hard_delete()` والدالة تنفّذ حرفياً:
`RAISE EXCEPTION 'RECORD_DELETE_FORBIDDEN' USING ERRCODE = 'P0001'`.
الاستثناء داخل نفس المعاملة ⇒ يفشل حذف الصف الأصل كاملاً (rollback).

## ROOT_CAUSE
CONFIRMED.
تعارض معماري بين قاعدتين صحيحتين كلٌّ على حدة:
1. `sales_document_events` جدول **غير قابل للحذف** (append-only، حماية Auditability).
2. المفتاح الأجنبي من الأحداث إلى المستند هو **ON DELETE CASCADE**، أي أن حذف المستند يعني حذف أحداثه.
وبما أن `createDraft` يكتب دائماً حدث `created` عند الإنشاء (`sales-docs.server.ts:324`)، فإن **كل** مسودة تملك حدثاً واحداً على الأقل ⇒ الحذف الصلب لأي مسودة **مستحيل بنيوياً**، لا استثناء. الميزة معطّلة كلياً وليست حالة حدّية.

## CONFIDENCE
عالية — مثبت بالكود وبمخطط قاعدة البيانات وبنص دالة الـtrigger وببيانات فعلية (المسودة الحالية الوحيدة لها حدث واحد مرتبط).

## EVIDENCE
- FKs الفعلية على `sales_documents`: `sales_document_items`, `sales_document_events`, `sales_document_signatures` — الثلاثة `ON DELETE CASCADE` (`confdeltype='c'`).
- Triggers الفعلية: `sales_events_no_delete` (BEFORE DELETE → `deny_hard_delete`)، `sales_sig_no_delete`، `sales_items_locked_guard` (BEFORE INSERT/UPDATE/DELETE)، و`sales_doc_immutability` **على UPDATE فقط** (لا يوجد أي trigger DELETE على `sales_documents` نفسه — أي الخلل ليس في المستند بل في أحداثه).
- `deny_hard_delete()` = `RAISE EXCEPTION 'RECORD_DELETE_FORBIDDEN' ERRCODE P0001`.
- `sales_document_items_guard()` يسمح بالحذف عندما تكون الحالة `draft/pending_approval/approved` ⇒ البنود ليست العائق.
- استعلام قراءة فقط: صفوف الأحداث الحالية = مسودة واحدة بحدث واحد، ومستند مُرسل بحدثين.
- `dbReason()` لا يعالج كود `P0001` (`sales-docs.server.ts:47-66`) ⇒ يعود إلى النص العام + مرجع، وهو بالضبط ما ظهر في الاختبار.

## EXACT_FILES
- `src/routes/mehla-admin/sales/$id.tsx` (زر الحذف والتأكيد وعرض الخطأ)
- `src/lib/sales-docs.functions.ts` (`salesDeleteDraft`)
- `src/lib/sales-docs.server.ts` (`deleteDraft`, `fail`, `dbReason`, `logEvent`)
- قاعدة البيانات: `sales_document_events` (trigger + FK)

## AUTHORIZATION_RESULT
PASS — لا علاقة للصلاحيات بالعطل.
- مفتاح واحد متطابق في الطرفين: `sales_docs.delete` موجود في كتالوج الصلاحيات (`admin-permissions.ts:94/642/1006`)، ويُفحص في الواجهة (`$id.tsx:541`) وخادمياً عبر `requireStaff` (`sales-docs.functions.ts:108`). لا mismatch.
- الفشل يقع **بعد** الترخيص وبعد فحص الحالة، داخل قاعدة البيانات.
- المحرّك يستخدم `supabaseAdmin` ⇒ RLS ليس عاملاً؛ ولا يوجد كود `42501`.

## BUSINESS_RULE_RESULT
القاعدة الحالية في الكود واضحة وقصدها **السماح** بحذف المسودة فقط:
- `DRAFT` → مسموح بالحذف نظرياً (`sales-docs.server.ts:360` يمرّر الحالة draft فقط).
- `SENT`, `ACCEPTED`, `REJECTED`, `CANCELLED`, `EXPIRED`, `PENDING_APPROVAL`, `APPROVED` → ممنوع بالحذف برسالة «لا يمكن حذف إلا مسودة لم تُرسل بعد».
لا توجد قاعدة أعمال تمنع حذف المسودة. المنع غير مقصود ونابع من طبقة قاعدة البيانات، أي أن **النية والتنفيذ متعارضان**. لم أغيّر أي قاعدة.

## DATABASE_CONSTRAINT_RESULT
| العلاقة | السلوك | يمنع الحذف؟ |
|---|---|---|
| `sales_document_items.document_id` | CASCADE | لا |
| `sales_document_signatures.document_id` | CASCADE | لا (ولا صفوف للمسودة، لكنه كان سيمنع لو وُجدت — نفس النمط) |
| `sales_document_events.document_id` | CASCADE | **نعم — نقطة الفشل** |
لا FK بـ RESTRICT/NO ACTION/SET NULL نحو `sales_documents`. لا CHECK constraint متعلق بالحذف.

## TRIGGER_RESULT
- `sales_events_no_delete` = السبب المباشر (P0001).
- `sales_sig_no_delete` = قنبلة موقوتة مماثلة لأي مستند مسودة يملك توقيعاً.
- `sales_doc_immutability` على UPDATE فقط — البيانات السابقة كانت صحيحة وما زالت.
- `sales_items_locked_guard` يسمح بالحذف في حالة draft.

## AUDIT_EVENT_RESULT
العطل ليس في كتابة سجل التدقيق ولا في ترتيبه ولا في انتهاك FK للسجل، بل في **حذف** الأحداث:
- الأحداث تُكتب قبل الحذف (عند الإنشاء) وتبقى مرتبطة بـ`document_id`.
- `writeAudit` في `deleteDraft` يأتي **بعد** الحذف ولا يُنفَّذ لأن العملية تفشل قبله — أي أن محاولة الحذف الفاشلة لا تُترك لها أي أثر في `admin_audit_logs`، وهذه فجوة تدقيق ثانوية يجب معالجتها مع الإصلاح (تسجيل المحاولة والفشل أيضاً).
- `admin_audit_logs` نفسه append-only (`no_delete` + `immutable`) وهذا سليم ولا يُلمس.

## ERROR_WRAPPING_RESULT
- الخطأ الداخلي الحقيقي: `P0001 RECORD_DELETE_FORBIDDEN` (من trigger الأحداث عبر CASCADE).
- ما يظهر للمستخدم: «تعذّر حذف المسودة. (مرجع: SD-XXXX)» — لأن `dbReason` لا يعرف `P0001`.
- الخصوصية: سليمة — لا Stack Trace ولا أسماء جداول ولا تفاصيل Postgres للمستخدم؛ التفاصيل في سجل الخادم مع نفس المرجع.
- المرجع مفيد للدعم من ناحية الربط، لكن الرسالة **غير قابلة للتصرّف** ولا تشرح السبب. لم أغيّر أي شيء في تجربة الخطأ الآن.

## SHARED_OR_ISOLATED_DEFECT
نمط مشترك محتمل: أي جدول append-only مربوط بأصل بـ`ON DELETE CASCADE`. النطاق المؤكد الآن معزول في وحدة عروض الأسعار (`sales_document_events` + `sales_document_signatures`). التحقق من بقية الجداول append-only مسألة منفصلة لا تدخل هذا الإصلاح.

## MINIMAL_FIX_RECOMMENDATION
لا تعطيل الـtrigger ولا إسقاط FK. المسار المقترح (بانتظار الاعتماد):
1. تحويل حذف المسودة إلى **دالة قاعدة بيانات واحدة** `security definer` (مثل `sales_delete_draft(_id uuid)`) تعمل داخل معاملة واحدة وبالترتيب الآمن:
   أ. التحقق من الحالة = `draft` ومن عدم وجود توقيعات، وإلا استثناء واضح.
   ب. كتابة سجل تدقيق **قبل** الحذف في `admin_audit_logs` يحمل نسخة (snapshot) من صفوف `sales_document_events` وبيانات المستند الأساسية — فتُحفظ قابلية التدقيق بعد زوال الأصل.
   ج. السماح بحذف صفوف الأحداث لهذه العملية فقط عبر مفتاح معاملة صريح (`set local`) يقرؤه `deny_hard_delete` (أو دالة حماية مخصّصة للأحداث)، بحيث يبقى الحذف ممنوعاً في كل المسارات الأخرى.
   د. حذف المستند.
2. `deleteDraft` في الخادم يستدعي هذه الدالة بدل `.delete()` المباشر، ويسجّل الفشل أيضاً لا النجاح فقط.
3. إضافة تعريف عربي دقيق لكود `P0001` داخل `dbReason` حتى لا تعود أي رسالة غامضة مستقبلاً.
بديل أخف لو رُفض تعديل قاعدة البيانات: اعتماد **إلغاء المسودة** (`cancelled`) بدل الحذف الصلب وتغيير الزر ونصّه وفقاً لذلك — لكن هذا **تغيير قاعدة أعمال** يحتاج قراراً منك، لا إصلاحاً تقنياً.

## CHANGED_FILES_EXPECTED
`src/lib/sales-docs.server.ts`، `src/routes/mehla-admin/sales/$id.tsx` (نص/حالة الخطأ فقط إن لزم)، + Migration واحدة (دالة الحذف وتعديل حماية الأحداث). لا ملفات أخرى.

## MIGRATION_REQUIRED
YES (للمسار المقترح رقم 1؛ لا Migration للبديل الأخف)

## DATABASE_CHANGE_REQUIRED
YES — دالة جديدة + تحديث منطق حماية `sales_document_events` بحيث تظل append-only خارج مسار حذف المسودة. بلا تغيير مخطط الأعمدة وبلا إسقاط FK.

## PRODUCTION_DATA_IMPACT
NONE — لم يُنفَّذ أي mutation، ولم يُقرأ سوى المخطط وعدّاد صفوف. السجل `QA-E2E-QUOTE-20260814-537738` لم يُلمس ولم يُستخدم كتجربة حذف.
ملاحظة سلامة: المعاينة وقاعدة البيانات هدف واحد، لذلك لم أُجرِ أي إعادة إنتاج حية للحذف.

## REGRESSION_RISK
متوسط ومحدود إن نُفّذ كما هو مقترح:
- الخطر الحقيقي هو توسيع إذن حذف الأحداث خارج مسار المسودة ⇒ يجب أن يكون المفتاح على مستوى المعاملة داخل الدالة وحدها، مع اختبار يثبت أن الحذف المباشر للأحداث ما زال ممنوعاً.
- مسارات يجب اختبارها بعد الإصلاح: إنشاء/تعديل المسودة، الإرسال، طلب الاعتماد والاعتماد (Four-Eyes)، القبول والقفل، قائمة المستندات، وسجل `admin_audit_logs`.

## TARGETED_ACCEPTANCE_TESTS
1. مسودة جديدة (بحدث `created` واحد) → حذف → نجاح، وتختفي من القائمة بعد Refresh.
2. مسودة بعدة أحداث → حذف → نجاح.
3. مستند `sent` أو `accepted` → زر الحذف مخفي، ونداء الخادم المباشر يُرفض برسالة الحالة.
4. مستخدم بلا `sales_docs.delete` → رفض خادمي، لا حذف.
5. بعد كل حذف ناجح: وجود سجل في `admin_audit_logs` يحمل snapshot الأحداث؛ وبعد كل فشل: وجود سجل محاولة فاشلة.
6. `DELETE` مباشر على `sales_document_events` خارج الدالة → ما زال يفشل بـ`RECORD_DELETE_FORBIDDEN`.
7. `DELETE` مباشر على `sales_document_signatures` → ما زال ممنوعاً؛ ومسودة تملك توقيعاً تُرفض برسالة واضحة لا برسالة عامة.
8. لا رسالة خطأ عامة بلا سبب: أي فشل يظهر بنص عربي يشرح السبب + مرجع.

## الحالة
ROOT_CAUSE_CONFIRMED
READY_FOR_FIX_REVIEW
