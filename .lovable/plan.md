# MEHLA OPERATIONAL SCORE — PRE-APPLY MIGRATION REVIEW

مراجعة قراءة فقط. لم يُعدَّل أي ملف ولم تُطبَّق أي Migration.
النطاق: `20260815014500_operational_score_ranking.sql` + `ranking.server.ts` + `ranking.functions.ts` + `snapshot.server.ts` + `api/public/hooks/operational-score.ts`.

## 1. MIGRATION SAFETY
تحققت من التبعيات على الإنتاج الحالي: `private.is_platform_staff`, `private.has_platform_permission` (كلتاهما SECURITY DEFINER, search_path=public), `public.set_updated_at`, `public.deny_update` — كلها موجودة. الجدولان غير موجودين، ولا تعارض أسماء Triggers/Indexes. الأعمدة المرجعية موجودة: `organizations.is_active/suspended_at`, `organization_members.role/status` (enum), `office_public_pages.status/published/suspended_by_platform`, `subscriptions.status/ends_at/suspended_at`, `platform_settings.key/value`.
FK/NOT NULL/defaults/timestamps/indexes/RLS/GRANT سليمة. لا عبارة SQL متوقعة الفشل.

## 2. OPT-IN FIELD PROTECTION
- `private.ranking_settings_guard`: SECURITY DEFINER = YES، fixed search_path = YES (`public, private`)، owner/execute exposure = SAFE (دالة Trigger؛ الاستدعاء المباشر يفشل بلا سياق Trigger).
- الحقول `platform_excluded / exclusion_reason / excluded_at / excluded_by` محمية عبر Direct Data API: أي UPDATE من مستخدم غير موظف منصة يرفع استثناءً.
- **ملاحظة MEDIUM (ليست حاجزاً):** `GRANT UPDATE` ممنوح على كل الأعمدة، فمدير المكتب يستطيع كتابة `opted_in_at` / `opted_in_by` بقيم من عنده (تلويث حقول التوثيق فقط، بلا أثر على الأهلية).

## 3. SNAPSHOT WRITE SECURITY
`anon` بلا أي منح. `authenticated` لديه SELECT فقط وسياسة SELECT تقصره على موظفي المنصة → أعضاء المكتب لا يقرؤون الجدول مباشرة. لا INSERT/UPDATE/DELETE لأي دور غير `service_role`. الكتابة من `snapshot.server.ts` عبر `supabaseAdmin` فقط.
**SNAPSHOT_WRITE_BOUNDARY: PASS**

## 4. APPEND-ONLY SEMANTICS
UPDATE ممنوع بـ Trigger `deny_update` لكل الأدوار بما فيها `service_role`. DELETE غير ممنوح لأي دور مطبَّق عليه RLS. إعادة الحساب تُدرج صفاً جديداً (`insert`) ولا تعدّل التاريخ.
**APPEND_ONLY: PASS** (تحسين اختياري لاحقاً: Trigger `deny_hard_delete` لسدّ مسار الحذف بمفتاح الخدمة).

## 5. LATEST SNAPSHOT CORRECTNESS — المشكلة الحاسمة
المنطق الحالي في `latestSnapshotsByOrganization`: استعلام واحد `order computed_at desc` مع `limit organizationIds.length * 8`، ثم أول صف لكل مكتب داخل Map.
- لا تكرار لمكتب، ولا تفضيل لقطة قديمة على أحدث (لأن الترتيب تنازلي عالمياً) — سليم عند تجاوب متساوٍ.
- لكن السقف عالمي لا لكل مكتب: مكتب توقف حسابه لأيام (أو مكتب أنتج لقطات مكررة) يخرج من النافذة تماماً فيُحذف بصمت من الترتيب، ومع نمو التكرار قد تُقصّ مكاتب مؤهلة.
**LATEST_SNAPSHOT_PER_ORG: FAIL** (صحيح بالحظ لا بالتصميم)
**CURRENT_FORMULA_VERSION_FILTER: NO** — لا تصفية لـ `formula_version`، فأي لقطة بمعادلة قديمة قد تظهر عامّاً. نعم: يجب قصر Public v1 على `formula_version = 'v1'` (`OPERATIONAL_SCORE_FORMULA_VERSION`).

ROOT_CAUSE: انتقاء "الأحدث لكل مكتب" مُنفَّذ في الذاكرة على نتيجة استعلام مقصوصة عالمياً، بلا تصفية إصدار المعادلة.
MINIMAL_FIX: دالة SQL (`DISTINCT ON (organization_id) ... WHERE window_kind='rolling_90' AND formula_version='v1' ORDER BY organization_id, computed_at DESC`) تُستدعى من الخادم، أو استعلام لكل مكتب بـ `limit 1` مع `eq('formula_version','v1')`.
EXACT_FILES: `src/lib/operational-score/ranking.server.ts` (+ Migration لدالة SQL إن اختير هذا الطريق).

## 6. PUBLIC ELIGIBILITY
كل الشروط خادمية في `getPublicRanking`: مفتاح الميزة (Fail-closed)، `public_opt_in = true`، `platform_excluded = false`، مكتب نشط وغير موقوف، اشتراك `active` غير موقوف ولم ينته، صفحة عامة `published` غير موقوفة باسم معتمد غير فارغ، أهلية اللقطة، والنتيجة ≥ 78. لا شرط Client-side.
**PUBLIC_ELIGIBILITY: PASS** — مع تنبيه توثيقي: التعليق يذكر "تجريبي" بينما الشرط يقبل `active` فقط؛ السلوك أضيق من التعليق (آمن).

## 7. PUBLIC RESPONSE
`sanitizePublicRankingItems` تُعيد `rank / publicName / score / badge / logoUrl` فقط؛ لا `organizationId` ولا أبعاد ولا أعداد ولا اشتراك ولا أسباب داخلية. الدالة العامة بلا وسائط (لا سطح تعداد).
**PUBLIC_DATA_MINIMIZATION: PASS**

## 8. TIE BREAK
الحالي: `score DESC`, `computed_at ASC`, ثم الاسم. `computed_at ASC` استُخدم كفاصل قطعي، لكنه بعد اختيار "أحدث لقطة لكل مكتب" يمنح أفضلية لمن حُسب أولاً في دورة الـ Cron — أفضلية غير منطقية ومتغيرة بترتيب المعالجة، كما يعرّض توقيت الحساب كعامل ترتيب عام.
اقتراح (بلا تنفيذ): `score DESC` ثم `publicName.localeCompare(name, 'ar')` فقط — قطعي، مستقر، ولا يعتمد على بيانات داخلية.
**TIE_BREAK: NEEDS_FIX** — EXACT_FILES: `src/lib/operational-score/ranking.server.ts`.

## 9. CRON IDEMPOTENCY
المسار Insert-only بلا تعديل يدوي للنتيجة وبلا قفل. تشغيلان متقاربان يُنتجان لقطتين شبه متطابقتين لنفس المكتب: لا إفساد بيانات ولا تعديل تاريخ، لكن تكرار الصفوف يستهلك نافذة القصّ في البند 5 ويزيد احتمال اختفاء مكاتب من الترتيب.
**CRON_CONCURRENCY_RISK: MEDIUM** (يهبط إلى LOW بعد إصلاح البند 5، ويُغلق تماماً بقفل استشاري أو فريد على (organization_id, window_kind, فترة زمنية)).

## 10. ROLLBACK PLAN (وصف فقط)
1. تعطيل فوري بلا DDL: إيقاف مفتاح `platform_settings.operational_score` (`enabled=false`) → الترتيب العام يعود فارغاً ومعطّلاً، وإيقاف نداء الـ Cron.
2. رجوع جزئي: `DROP TRIGGER` الثلاثة، ثم `DROP FUNCTION private.ranking_settings_guard()`.
3. رجوع كامل: `DROP TABLE public.operational_score_snapshots;` ثم `DROP TABLE public.organization_ranking_settings;` (لا جدول آخر يعتمد عليهما؛ الحذف لا يمس بيانات إنتاج قائمة).
4. ملاحظة: `activity_logs` قد يحتوي أحداث `ranking.opt_in` — لا تُحذف (سجل تدقيق).
**ROLLBACK_PLAN: READY**

## OUTPUT
- MIGRATION_SQL: PASS
- RLS: PASS
- RANKING_SETTINGS_GUARD: PASS (ملاحظة MEDIUM على أعمدة opted_in_*)
- SNAPSHOT_WRITE_BOUNDARY: PASS
- APPEND_ONLY: PASS
- LATEST_SNAPSHOT_PER_ORG: FAIL
- FORMULA_VERSION_FILTER: NEEDS_FIX
- PUBLIC_ELIGIBILITY: PASS
- PUBLIC_DATA_MINIMIZATION: PASS
- TIE_BREAK: NEEDS_FIX
- CRON_CONCURRENCY_RISK: MEDIUM
- ROLLBACK_PLAN: READY

**PRE_APPLY_VERDICT: FIX_REQUIRED_BEFORE_APPLY**
السبب محصور في الكود الخادمي (البنود 5 و8) لا في SQL: Migration نفسها آمنة للتطبيق، لكن الترتيب العام لا يجب تشغيله قبل إصلاح انتقاء أحدث لقطة + تصفية إصدار المعادلة + الفاصل القطعي.
