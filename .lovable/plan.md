# MEHLA OPERATIONAL SCORE — FINAL B1/B2 ACCEPTANCE (READ-ONLY)

نطاق هذا التقرير: نقطتان فقط (تفويض المكتب النشط + عقد الخصوصية). لم تُعَد مراجعة الصيغة أو المنطقة الزمنية أو النزاهة أو الجلسات أو أداء الاستعلامات.

## 1. ACTIVE ORGANIZATION AUTHORIZATION

**هل العميل يرسل organization_id؟** نعم. `src/lib/operational-score/score.functions.ts` يستقبل `{ organizationId: uuid }` من الواجهة، ويمرره لـ `computeOrganizationScore` بعد الحارس.

**الحارس الفعلي:** `requireActiveMembership(context.supabase, organizationId, context.userId)` — استعلام على `organization_members` بـ `organization_id = X` و `user_id = auth.uid()` و `status = 'active'`، ويُرفَض الطلب إن لم يوجد صف. يعمل بجلسة المستخدم (RLS سارية) لا بالدور الإداري، ودالة الخادم محمية بـ `requireSupabaseAuth` (JWT حقيقي)، وكل استعلامات القياس مقيّدة بـ `.eq("organization_id", organizationId)`. قراءة `work_item_events` إدارية لكنها تحدث **بعد** الحارس ومقيّدة بنفس المكتب.

**الشرط الحالي هو:** `user is an active member of organization X` — وليس `X = current active organization`.

**قراءة المعمارية:** «المكتب النشط» في مِهلة مفهوم واجهة فقط: `src/hooks/use-auth.tsx` يبني `activeOrgId` من عضويات المستخدم النشطة ويخزّنه في `localStorage` (`mehla_active_org`)، فلا وجود لمكتب نشط خادمي يمكن التحقق منه. وهذا هو النمط الموحد في كل الدوال المستأجَرة (`subscription.functions.ts`, `pii.functions.ts`, `document-ai.functions.ts`): `organizationId` جزء موثّق من Context الطلب، والحماية = عضوية نشطة (+ دور/استحقاق عند الحاجة). لذلك إرسال معرّف مكتب آخر يملك المستخدم فيه عضوية نشطة يعرض **نتيجته الخاصة بذلك المكتب** فقط، وهو سلوك مقصود لا تصعيد صلاحيات ولا اختراق عزل مستأجرين.

**ACTIVE_ORG_ENFORCEMENT:** NOT_APPLICABLE_BY_CURRENT_ARCHITECTURE (لا مفهوم خادمي لمكتب نشط؛ المستوى المطبَّق هو عضوية نشطة مثبتة خادمياً — مطابق للمعمارية المعتمدة، ولم يُعدَّل شيء).

**AUTHORIZATION_PATTERN:** `requireSupabaseAuth` (JWT) → `requireActiveMembership` (صف عضوية `status = active` بجلسة المستخدم فوق RLS) → كل استعلام مقيّد بـ `organization_id` → قراءة إدارية واحدة للأحداث بعد الحارس ومقيّدة بنفس المكتب.

## 2. FINAL CONTRACT CHECK

شكل الاستجابة `OperationalScoreResult` (`score.shared.ts`) يحتوي حصراً: `score`, `formulaVersion`, `windowStart`, `windowEnd`, `computedAt`, `eligible`, `eligibilityReason`, `eligibilityMessage`, `eligibleItems`, `deadlinesAndHearings`, `trackingDays`, `integrityFactor`, و`dimensions` (مفتاح، عنوان بعد ثابت، نسبة، وزن، applied، quality، sampleSize).

- لا بيانات عملاء ولا قضايا ولا مستندات ولا عناوين/أوصاف مهام أو مهل — الأعمدة المقروءة أصلاً هي Metadata فقط (`id, created_at, due_date, completed_at, status`, و`hearing_date, status, created_at`).
- لا معرّفات أعمال ولا معرّفات مكاتب ولا أي محتوى قانوني خام في المخرجات؛ المعرّفات تبقى داخل المحرك ولا تُسرَّب.
- لا أي بيانات عن مكاتب أخرى ولا مقارنة ولا ترتيب.

**PRIVATE_RESPONSE_PRIVACY:** PASS

عند `eligible = false`: المحرك يعيد `score: eligible ? score : null` (`score.engine.ts`)، فلا نسبة إجمالية تُنقل عبر الشبكة أصلاً. والواجهة (`operational-score-card.tsx`) تعرض «بيانات غير كافية» بدل النسبة الإجمالية، وتُخفي نسب الأبعاد كذلك عندما `eligible = false`.

**INELIGIBLE_SCORE_EXPOSURE:** PASS

## 3. الحكم

- **SOURCE_CHANGED_SINCE_CORRECTION:** NO (المصادر المفحوصة مطابقة لحالة ما بعد Correction Batch: 26 اختباراً ناجحاً، TypeCheck وESLint نظيفان).
- **FINAL_B1_B2_VERDICT:** READY_FOR_PREVIEW_QA

لم يُعدَّل أي كود، ولا Deploy، ولا Migration.
