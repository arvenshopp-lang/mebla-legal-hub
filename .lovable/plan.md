# MEHLA OPERATIONAL SCORE — B1/B2 POST-BUILD REVIEW (READ-ONLY)

لم يُعدَّل أي كود. المراجعة على المصدر الحالي فقط.

## النتائج المطلوبة

TIMEZONE_IMPLEMENTATION: **NEEDS_FIX**

TIMEZONE_SOURCE: `RIYADH_OFFSET_MS = 3*60*60*1000` معرّف محلياً في `score.shared.ts:66` ويُستخدم داخل `riyadhDayStart`. لا استيراد لـ `RIYADH_TZ` من `src/lib/format.ts:10`. النتيجة صحيحة سلوكياً (الرياض بلا توقيت صيفي) لكنها نسخة رابعة من سياسة الوقت (`format.ts`, `support/sla.server.ts`, `kpi/kpi.shared.ts`) ولا تحقق Single Source of Truth.

INTEGRITY_DENOMINATOR: `countedItems = المهل + المهام + الجلسات` (`score.engine.ts:286`) بينما البسط من `[countedDeadlines, countedTasks]` فقط (`:287`).

INTEGRITY_DILUTION_RISK: **CONFIRMED** — الجلسات لا تملك `work_item_events`، فكل جلسة تُضاف للمقام تخفّف عقوبة تلاعب مثبت في المهام/المهل.
الصيغة الأدق (بدون تنفيذ): `ratio = itemsWithProvenSignals / (countedDeadlines + countedTasks)`، وعند غياب عناصر قابلة للتدقيق يبقى `integrityFactor = 1.00`.

DUE_CHANGED_RULE: **PASS** — الشرط الفعلي `to > from && at > from` (`score.engine.ts:105`) أي: الموعد السابق كان قد فات لحظة التغيير، والجديد لاحق له. التقديم والتعديل قبل الاستحقاق والتصحيح المبكر لا يُعاقب عليها.

REOPEN_RULE: **TOO_BROAD** — أي `reopened` بعد `completed_at` يُعدّ إشارة تلاعب (`:122-125`) بلا شرط علاقة بالموعد ولا أثر فعلي على النتيجة، فإعادة الفتح المشروعة تُعاقب.

DOUBLE_PENALTY_RISK: **CONFIRMED** في مسارين:
- `due_changed` المثبت يُرجع الموعد المعتمد إلى `from` فيخفض البسط `onTime` **و** يخفض `integrityFactor`.
- `reopened` يؤخّر/يمسح `completed_at` عملياً فيخفض `onTime` **و** يخفض `integrityFactor`.
القاعدة الصحيحة: الإشارة التي تُصحَّح داخل المقياس نفسه لا تُخصم ثانية في معامل النزاهة؛ يُحتفظ بالنزاهة للإشارات غير القابلة للتصحيح داخل البسط.

DELETED_EVENT_SUFFICIENCY: **INSUFFICIENT (LIMIT)** — `computeOrganizationScore` يبني `itemIds` من صفوف `tasks/deadlines` الموجودة فقط (`score.server.ts:96`)، فالصف المحذوف لا يظهر ولا تُقرأ أحداثه أبداً؛ أي أن قاعدة «الحذف بعد الاستحقاق» غير قابلة للتشغيل فعلياً في التنفيذ الحالي. كذلك تقييم الحدث يعتمد `effectiveDue` المشتق من الصف الحالي، وحدث `deleted` لا يضمن حمل `from_due_date`، مع أن الجدول يملك `metadata` غير مستخدم هنا.

HEARING_7_DAY_RULE: **NOT_PROVABLE**

HEARING_TIMESTAMP_SOURCE: `hearings.updated_at` فقط — عمود تحديث صف عام يتغير بأي تعديل (ملاحظات، قاعة، رابط)، ولا يوجد `completed_at` ولا `status_changed_at` في المخطط. وأيضاً `updatedAt === null ⇒ followedUp = true` (`score.engine.ts:194`).
Metric v1 محافظة مقترحة: «تحديث حالة الجلسات المنقضية» = الجلسات المنقضية داخل النافذة التي حالتها النهائية `completed` أو `postponed` ÷ الجلسات المنقضية (باستثناء `cancelled`)، بلا أي ادعاء زمني، مع إزالة عبارة «خلال 7 أيام» من الشرح والوثيقة حتى توفّر Timestamp حقيقي.

TRACKING_PERIOD_DEFINITION: **NOT_DETERMINISTIC_AS_CLAIMED** — `trackingDays = min(90, organizationAgeDays)` مشتق من `organizations.created_at` فقط (`:296`)، فهو عمر المكتب لا فترة تتبع؛ وشرط `MIN_TRACKING_DAYS = 30` مستهلَك تلقائياً بشرط العمر 45 يوماً فلا يفحص شيئاً. التعريف القطعي المقترح: عدد أيام الرياض بين أقدم عمل مؤهل داخل النافذة (`created_at`) وحد النافذة النهائي، بحدٍّ أقصى 90.

QUERY_SCALE_RISK: **MEDIUM** — لا `limit` ولا Pagination على الاستعلامات الثلاثة، و`.in("item_id", itemIds)` بلا حد أقصى (`score.server.ts:105`). مكتب كبير (≈50 عملاً/يوم) ≈ 4–5 آلاف معرف ⇒ سلسلة استعلام تتجاوز حدود طول URL في PostgREST/الوسيط، مع نمو ذاكرة خطي. لا N+1 ولا Explosion تربيعية، لذا الخطر متوسط، ويصبح HIGH فوق ≈3000 معرف.

TENANT_AUTHORIZATION: **PASS (بملاحظة)** — `organizationId` القادم من العميل يُتحقق منه عبر `requireActiveMembership` بعميل المستخدم (RLS) وبشرط `status === "active"` قبل أي قراءة إدارية، والقراءة الإدارية مقيدة بـ `eq("organization_id", organizationId)`. لا تسريب بين المكاتب. الملاحظة: العضو في أكثر من مكتب يستطيع طلب نتيجة أي مكتب هو عضو نشط فيه حتى لو لم يكن هو المكتب النشط في جلسته — مصرّح به لكنه لا يطابق دلالة Active organization حرفياً.

UI_ELIGIBILITY_BEHAVIOR: **PASS** — عند `eligible = false` تُعرض «بيانات غير كافية» مع سبب عربي ولا تُعرض أي نسبة كلية، والبعد غير المتوفر يعرض «بيانات غير كافية» لا 0%. ملاحظة صغيرة: نسب الأبعاد تظهر حتى مع عدم الأهلية وقد تُقرأ كنتيجة جزئية معتمدة.

B1_B2_CORRECTNESS: **FIX_REQUIRED_BEFORE_DEPLOY**

## الإصلاحات المطلوبة (تشخيص فقط — غير منفَّذة)

1) ROOT_CAUSE: إزاحة زمنية مكرّرة داخل المحرك. MINIMAL_FIX: حذف `RIYADH_OFFSET_MS` المحلي واستخدام سياسة الوقت المركزية من `src/lib/format.ts`. EXPECTED_FILES: `src/lib/operational-score/score.shared.ts`.
2) ROOT_CAUSE: مقام النزاهة يشمل الجلسات غير القابلة للتدقيق. MINIMAL_FIX: قصر المقام على المهام والمهل المحتسبة. EXPECTED_FILES: `score.engine.ts` + اختبارات المحرك.
3) ROOT_CAUSE: عقوبة مزدوجة على `due_changed` و`reopened`. MINIMAL_FIX: خصم النزاهة فقط للإشارات غير المصحَّحة داخل البسط، وتقييد `reopened` بالنمط ذي الأثر (إعادة فتح بعد الاستحقاق). EXPECTED_FILES: `score.engine.ts`, `docs/operational-score-architecture.md`.
4) ROOT_CAUSE: قاعدة الحذف بعد الاستحقاق غير قابلة للتشغيل لأن المعرفات تُشتق من الصفوف الباقية. MINIMAL_FIX: قراءة أحداث `deleted` للمكتب داخل النافذة مباشرة اعتماداً على `from_due_date`/`metadata`، أو إسقاط القاعدة صراحةً من v1. EXPECTED_FILES: `score.server.ts`, `score.engine.ts`, الوثيقة.
5) ROOT_CAUSE: ادعاء «7 أيام» غير قابل للإثبات من `updated_at`. MINIMAL_FIX: اعتماد Metric الحالة النهائية المحافظة وتصحيح نص الشرح. EXPECTED_FILES: `score.engine.ts`, `score.shared.ts`, `src/components/dashboard/operational-score-card.tsx`, الوثيقة.
6) ROOT_CAUSE: `trackingDays` = عمر المكتب. MINIMAL_FIX: اشتقاقه من أقدم عمل مؤهل داخل النافذة. EXPECTED_FILES: `score.engine.ts`.
7) ROOT_CAUSE: `.in(itemIds)` بلا حد. MINIMAL_FIX: تقسيم قراءة الأحداث إلى دفعات ثابتة، أو استعلام أحداث المكتب بالنافذة الزمنية دون قائمة معرفات. EXPECTED_FILES: `score.server.ts`.

STOP.