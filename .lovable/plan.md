# اكتشاف مصدر توقيت تذكير القضايا (قراءة فقط)

## CASE_TIMER_DISCOVERY

CASE_TIMING_FIELDS (من `public.cases` الفعلي):

| COLUMN | TYPE | NULLABLE | DEFAULT | MEANING_FROM_CODE | USER_EDITABLE | USED_BY_NOTIFICATIONS | USED_BY_UI |
|---|---|---|---|---|---|---|---|
| next_action_date | timestamptz | YES | — | "تاريخ الإجراء القادم" — يُقرأ فقط في ورقة الطباعة، MCP، بوابة العميل، KPI | لا (غير موجود في `caseSchema` ولا في `CaseDialog`) | لا | عرض فقط في جدول القضايا/الطباعة |
| next_action | text | YES | — | وصف نصي للإجراء القادم (قراءة فقط) | لا | لا | عرض فقط |
| last_activity_at | timestamptz | NO | now() | يُستخدم للترتيب "آخر نشاط" فقط | لا | لا | ترتيب/عرض |
| opened_at | date | YES | — | تاريخ فتح القضية (اختياري في النموذج) | نعم | لا | نعم |
| closed_at | date | YES | — | يُكتب آلياً عند الأرشفة | لا (آلي) | لا | لا |

نتائج مؤكدة بالكود لا بالأسماء:
- لا يوجد أي مسار كتابة لـ `next_action_date` / `next_action` في التطبيق؛ الكتابة الوحيدة في `scripts/e2e/qa-volume-fixture.ts`. القيم الـ26 الموجودة في الإنتاج من تجهيز QA وليست إدخال مشترك.
- لا يوجد Trigger يحدّث `last_activity_at` (المشغلات الموجودة: quota، notify_case_event، public_code، updated_at)، ولا يحدّثها كود التطبيق ⇒ قيمتها فعلياً = وقت الإنشاء، ولا تصلح كمصدر "خمول".

PRIMARY_USER_DEFINED_TIMING_SOURCE: لا يوجد
- UI_LABEL: غير موجود (لا حقل "عداد القضية" ولا "تاريخ الإجراء القادم" في نموذج الإنشاء/التعديل)
- DB_COLUMN: —
- VALUE_TYPE: —
- REQUIRED_OR_OPTIONAL: —
- EDITABLE_AFTER_CREATION: —

CASE_STATUS_MODEL (enum `case_status` الفعلي): draft, open, in_progress, waiting, judgment_issued, execution, closed, archived. الحالات المنتهية الفعلية للاستثناء: closed, archived (لا وجود لـ completed/cancelled).

CASE_RECIPIENT_SOURCE: `cases.assigned_lawyer_id` (وبديلاً `created_by`) — نفس نمط المستلم المستخدم في الجلسات/المهل.

INACTIVE_CASES_PREFERENCE_MEANING: UNDEFINED
- الإعداد ظاهر للمستخدم كـ "قضايا خاملة" (`settings.tsx`) ومربوط بحدث `case_inactive` في `reminders.shared.ts`، لكن `reminder-generator.server.ts` يعيد `inactiveCases: "THRESHOLD_MISSING"` ولا يولّد شيئاً. لا يمثل عدّاداً يحدده المشترك، ولا يمثل خمولاً محسوباً فعلياً.

EXISTING_CASE_NOTIFICATION_EVENTS: `notify_case_event` عند إنشاء القضية وعند تغيير الحالة (أحداث فورية لا تذكيرات)، وحدث تذكير معلّق `case_inactive` غير مُنفّذ.

REMINDER_ENGINE_REUSABLE: YES — عزل المكتب، حلّ المستلم، تفضيلات القنوات، `reminderDedupKey` (يدعم entity="case" أصلاً)، طابور البريد، ومساعدات توقيت الرياض كلها قابلة لإعادة الاستخدام بلا معمارية جديدة.

GLOBAL_FIXED_THRESHOLD_REQUIRED: NO — ولا يجوز اختراع 14/30/60 يوماً.

USER_CONTROLS_CASE_TIMING: NO — لا يملك المشترك حالياً أي حقل يحدد "متى تحتاج هذه القضية انتباهاً".

## PRODUCT_DECISION_REQUIRED: YES

المعلومة الناقصة بالضبط: مصدر توقيت للقضية يحدده المشترك. أصغر مدخل ممكن يستخدم ما هو موجود بالفعل في المخطط دون هجرة:

- تفعيل `next_action_date` (+ `next_action`) كحقلين ظاهرين في نموذج القضية: "الإجراء القادم" و"تاريخ الإجراء القادم" (اختياري، قابل للتعديل بعد الإنشاء، تُحفظ بتوقيت الرياض عبر `RIYADH_TZ`). هذا يجعل التوقيت مملوكاً للمشترك ويلغي الحاجة لأي عتبة عالمية.

البديل الوحيد الآخر هو تعريف "الخمول" رسمياً كسلوك منصة بعتبة يحددها المكتب — وهو يخالف المبدأ المعتمد، لذا لا يُنفّذ إلا بقرار صريح منك.

## PROPOSED_CASE_REMINDER_MODEL (بشرط اعتماد القرار أعلاه)

- TRIGGER_SOURCE: `cases.next_action_date` بعد أن يصبح حقلاً يُدخله المشترك.
- TRIGGER_MEANING: التاريخ الذي حدده المشترك للإجراء القادم في القضية.
- ELIGIBLE_CASE_STATES: draft, open, in_progress, waiting, judgment_issued, execution (استثناء closed, archived).
- RECIPIENT: `assigned_lawyer_id` وإن غاب `created_by`.
- TIMEZONE: حدود أيام الرياض عبر مساعدات `Asia/Riyadh` القائمة، بعتبات 7/3/1/0 المطابقة للجلسات والمهل.
- CHANNEL_PREFERENCE: إعادة استخدام إعداد "قضايا خاملة" الحالي كمفتاح واحد للقضايا، أو إضافة مفاتيح 7/3/1/0 للقضايا — قرار منتج مطلوب (بلا هجرة إذا اكتفينا بالمفتاح الحالي).
- DEDUPE_KEY: `rem:{organizationId}:case:{caseId}:next_action_{7d|3d|1d|same_day}:{YYYY-MM-DD}` بتاريخ الرياض للهدف، ليسمح بتذكير جديد عند تعديل التاريخ ويمنع التكرار لنفس العتبة والتاريخ.
- REPEAT_BEHAVIOR: مرة واحدة لكل (قضية، عتبة، تاريخ هدف) — Episode مرتبط بالتاريخ المحدد.
- EMAIL_COPY_SENSITIVITY: نص عربي آمن بلا اسم عميل ولا رقم قضية ولا تفاصيل، على نمط `REMINDER_COPY` الحالي.

## MIGRATION / CHANGES

- MIGRATION_REQUIRED: NO لتفعيل `next_action_date` (العمود موجود ومفهرس). YES فقط إذا طُلبت مفاتيح تفضيل جديدة للقضايا.
- CODE_CHANGES_REQUIRED: YES (نموذج القضية + مولّد التذكيرات + قالب البريد) — لم يُنفّذ شيء في هذه الخطوة.

OPEN_GAPS: `last_activity_at` لا يُحدَّث فعلياً؛ إعداد "قضايا خاملة" ظاهر للمستخدم بلا أثر (وعد غير محقق في الواجهة).

RECOMMENDED_NEXT_STEP: اعتماد `next_action_date` كمصدر توقيت يملكه المشترك، ثم دفعة واحدة: إظهار الحقلين في نموذج القضية، ثم دفعة ثانية لتوليد التذكيرات.

FILES_CHANGED: NONE — DB_WRITES: NO — MIGRATION_APPLIED: NO — DEPLOY: NO — TESTS: NOT_REQUIRED_FOR_PLAN

FINAL_STATUS: DECISION_REQUIRED
