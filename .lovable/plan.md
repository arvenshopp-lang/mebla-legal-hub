# مراجعة تطبيق هجرة حجب البريد (Read-only)

راجعت `supabase/migrations/20260816021500_email_suppressions.sql` ومستهلكيها المباشرين فقط. لم أطبّق أي هجرة، ولم أرسل بريداً، ولم أعدّل أي ملف.

## 1. جرد الهجرة

- **جدول**: `public.email_suppressions` (id, address, normalized_address, reason, source, created_by, created_at, updated_at, lifted_at, lifted_by, note).
- **قيود**: reason في (bounce_hard, complaint, manual, unsubscribe)؛ العنوان يحتوي `@`؛ `normalized_address = lower(btrim(...))`؛ `lifted_by` لا يوجد بلا `lifted_at`.
- **فهارس**: فهرس فريد جزئي `(normalized_address, reason) WHERE lifted_at IS NULL`؛ فهرس بحث جزئي على `normalized_address WHERE lifted_at IS NULL`؛ فهرس `created_at DESC`.
- **دوال/مشغّلات**: `public.email_suppressions_guard()` + مشغّل BEFORE UPDATE OR DELETE؛ ومشغّل `set_updated_at` القائم.
- **RLS/سياسات/صلاحيات**: RLS مفعّل؛ سياسة واحدة لدور الخدمة؛ REVOKE من PUBLIC/anon/authenticated؛ GRANT ALL لـ service_role فقط.

لا يعدّل `email_outbox` ولا `profiles` ولا `notifications` ولا Auth، ولا يرسل بريداً، ولا ينشئ Cron، ولا ينقل أي حجب قديم.

## 2. نتائج التحقق

| البند | النتيجة |
|---|---|
| تطبيع العنوان (trim + lowercase حتمي، مطبّق في الكود وقيد القاعدة) | PASS |
| البحث عن الحجب الفعّال مفهرس | PASS |
| تكرار حجب فعّال لنفس (العنوان، السبب) | NO |
| نموذج التاريخ: حجب → رفع → حجب جديد بلا حذف | PASS |
| تعديل حقول الحدث الأصلي | مرفوض بالمشغّل |
| ضبط lifted_at/lifted_by عبر المسار المعتمد | مسموح |
| منع رفع حجب الشكوى (في `liftRecipientBlock` خادمياً، لا في الواجهة فقط) | PASS |
| قيد الأسباب مطابق للكود المشترك | PASS |
| التقاط الارتداد الصلب: 5xx للمستلم فقط (4xx/مهلة/مصادقة/مُرسل/TLS لا تُنتج حجباً) | PASS |
| تفرّد الارتداد المتكرر (تصادم 23505 يُعامل كحالة قائمة، لا كعطل) | PASS |
| RLS + لا وصول من المتصفح (anon/authenticated) | PASS |
| حذف السجل | مرفوض؛ لا CASCADE يحذف صفوفاً |
| تقنيع البريد في السجلات | PASS |
| استيراد حجب المزوّد القديم | NO — يبدأ الجدول فارغاً (قيد مقبول) |
| نطاق الأثر | LOW (جدول جديد فقط، بلا Backfill ولا Cron ولا إرسال) |

## 3. إصلاحان مطلوبان قبل التطبيق

**أ. تعارض ON DELETE SET NULL مع مشغّل الحماية (هجرة):**
`created_by` و`lifted_by` معرّفان `REFERENCES auth.users(id) ON DELETE SET NULL`. عند حذف مستخدم فعلاً ستحاول القاعدة تنفيذ UPDATE يصفّر `created_by`، والمشغّل يرفض أي تغيير في `created_by` فترتفع استثناء ويفشل حذف المستخدم. الإصلاح: السماح داخل المشغّل بانتقال `created_by` من قيمة إلى NULL فقط (بلا أي تغيير آخر)، أو تحويل المرجعين إلى بلا قيد FK وتخزين المعرّف كبيانات تدقيق. يُنفَّذ داخل نفس ملف الهجرة قبل التطبيق لأنه أرخص الآن من تعديل مشغّل لاحقاً.

**ب. فئة الحجب في المسارات (كود فقط، بعد التطبيق):**
- `invitations.server.ts` يستدعي `recipientStates([email])` بالفئة الافتراضية `human_mail`، فيُمنع إرسال دعوة الفريق بسبب إلغاء اشتراك عادي — خلاف السياسة المعتمدة (دعوة الفريق تُمنع بالارتداد الصلب/الشكوى/الحجب اليدوي فقط). الصحيح تمرير `"team_invitation"`.
- مسارات الفواتير والمبيعات وتنبيهات النظام لا تفحص الحجب قبل الإرسال إطلاقاً؛ تعتمد على رفض SMTP فقط، فلا تُطبَّق دلالات `billing`/`sales`/`notification` الموجودة في `suppression.shared.ts`. يلزم فحص قبل الإرسال بالفئة الصحيحة لكل مسار.

بقية المستهلكين المباشرين (`suppression.server.ts`, `email.functions.ts`, `app-email.server.ts`, `workspace.server.ts`) ستعمل صحيحاً فور تطبيق الهجرة؛ وقبل التطبيق تعيد القراءة `unknown` بلا تعطيل واجهة، والكتابة تفشل بصمت مسجّلة فقط.

## 4. ترتيب النشر الآمن

1. إصلاح (أ) في ملف الهجرة.
2. تطبيق هجرة `email_suppressions`.
3. التحقق من الجدول وRLS والصلاحيات (linter + قراءة تعريف الجدول).
4. فحص قراءة فقط للبحث (بلا كتابة، بلا بريد).
5. إصلاح (ب) في الكود.
6. اختبارات بريد Hostinger محكومة لاحقاً.
7. متابعة أساس بريد التنبيهات ثم Cron.

الكود الحالي في الإنتاج لا يتعطّل قبل التطبيق (كل مسارات الحجب تتعامل مع الفشل كـ`unknown`)، لذا هذا الترتيب آمن.

## 5. الرجوع (Rollback)

- **قبل وجود أي صف**: يمكن إسقاط الجدول والمشغّل والدالة بهجرة عكسية بسيطة.
- **بعد وجود سجل حجب**: لا يُسقط الجدول. الرجوع يكون بإيقاف الكتابة والاعتماد عليه من طبقة الكود (رجوع إصدار) مع الإبقاء على الجدول والتاريخ كما هو؛ وإن لزم إيقاف تأثيره تشغيلياً يُرفع الحجب صفاً بصف عبر المسار المعتمد (`lifted_at`) لا بالحذف.

## القرار

- SUPPRESSION_MIGRATION: **FIX_REQUIRED** (إصلاح واحد: تعارض ON DELETE SET NULL مع المشغّل)
- DIRECT_DEPENDENCIES: PASS
- CATEGORY_POLICY: **FAIL** (فئة الدعوات + غياب فحص الفواتير/المبيعات/التنبيهات)
- EXISTING_DATA_SAFETY: PASS · SUPPRESSION_TABLE_STARTS_EMPTY: YES · LEGACY_SUPPRESSION_IMPORTED: NO
- BLAST_RADIUS: LOW · ROLLBACK: READY
- FINAL_APPLY_VERDICT: **FIX_REQUIRED** — بعد إصلاح (أ) تصبح الهجرة جاهزة للتطبيق، و(ب) إصلاح كود مستقل بعد التطبيق.
