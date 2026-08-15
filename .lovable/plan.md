# MEHLA OPERATIONAL SCORE — مؤشر الإنجاز التشغيلي (خطة فقط)

## 0. FINAL DATA INTEGRITY GATE (مُتحقَّق فعلياً)
قرارات v1 المعتمدة: المهل 45% / المهام 35% / الجلسات 20% — نافذة ROLLING_90_DAYS فقط — الحد الأدنى العام 78 — 25 عملاً مؤهلاً منها 5 مهل/جلسات — عمر المكتب 45 يوماً — 5 نتائج عامة — العنوان «الأكثر إنجازاً على مِهلة» — الموافقة إلزامية Default OFF — الأوزان في الكود — لا تعديل يدوي للنتيجة — الترتيب الشهري مؤجَّل بعد v1.

نتائج الفحص الفعلي للمخطط والبيانات:
- الالتقاط عبر مشغّل قاعدة بيانات `private.work_item_capture_events()` (SECURITY DEFINER) على `tasks` و`deadlines` لعمليات INSERT/UPDATE/DELETE، والفاعل من `auth.uid()`، والأحداث مشتقة من `OLD/NEW` لا من مدخلات العميل ⇒ لا يمكن تخطّيه بأي كتابة عبر Data API.
- الغلاف `EXCEPTION WHEN OTHERS` يمنع إفشال عملية المستخدم ويسجّل العطل في `system_failures` ⇒ الالتقاط **قد** يفشل بصمت لصف واحد. عدد أعطال `work_item_events.capture` حتى الآن: **0**.
- `hearings` **بلا** مشغّل التقاط ⇒ لا وجود لأي سجل أحداث للجلسات.
- أقدم حدث: 2026-08-10، وأقدم مهمة: 2026-07-31، وأقدم مهلة: 2026-08-01 ⇒ فترة سابقة بلا أحداث حقيقية، جُسِّرت بأحداث `baseline` (34 مهمة / 25 مهلة). حالياً 37/37 مهمة و38/38 مهلة تحمل `created` أو `baseline`.
- `work_item_events` غير قابل للتعديل أو الحذف (مشغّل `work_item_events_immutable` + غياب سياسات الكتابة) ⇒ الأحداث الموجودة موثوقة كدليل إيجابي.
- `completed_at` تفرضه قاعدة البيانات عبر `private.work_item_authoritative_completion()` ولا يقبل قيمة من العميل ⇒ وقت الإنجاز **مصدر حقيقة موثوق بذاته**.

**WORK_ITEM_EVENTS_RELIABILITY: PARTIAL** — مضمون هيكلياً لكل كتابة تمرّ على الجدولين، لكنه best-effort لكل صف بحكم غلاف الاستثناء، وغير موجود إطلاقاً للجلسات.
**HISTORICAL_COMPLETENESS: PARTIAL** — التاريخ الحقيقي يبدأ 2026-08-10؛ ما قبله `baseline` فقط ولا يحمل التغييرات الفعلية.
**CAN_USE_ORIGINAL_DUE_DATE_SAFELY: PARTIAL** — يمكن استخراجه بثقة عندما يوجد `created`/`baseline` أو أول `due_changed` داخل النافذة؛ وبما أن النافذة 90 يوماً ستشمل قريباً ما قبل 2026-08-10، يجب ألا يعتمد الحساب على وجوده.
**TASK_SCORING_SOURCE_OF_TRUTH:** `tasks` (الحالة و`due_date` و`completed_at` المفروض بالمشغّل) هي المرجع؛ و`work_item_events` طبقة تدقيق تُشدِّد فقط عند وجود دليل.
**DEADLINE_SCORING_SOURCE_OF_TRUTH:** `deadlines` بنفس المنطق.
**ANTI_GAMING_SAFE_SIGNALS:** `due_changed` مثبت بعد تجاوز الموعد؛ `reopened` مثبت بعد الإنجاز؛ `deleted` مثبت بعد الاستحقاق؛ `completed_at` المفروض خادمياً؛ إنشاء وإنجاز داخل نفس الساعة (محسوب من `tasks` نفسها).
**UNSAFE_SIGNALS:** غياب أي حدث؛ اكتمال `baseline` كدليل على الموعد الأصلي؛ أي دليل أحداث للجلسات (غير موجود)؛ `cases.last_activity_at` كمقياس متابعة.
**قاعدة السلامة:** غياب الحدث لا يُعدّ دليلاً سلبياً أبداً. `integrityFactor` يُخفَّض فقط بأحداث مثبتة، ويُثبَّت على 1.00 عند غياب الأدلة، ولا ينزل عن 0.85.
**V1_SCORE_ENGINE_READY: YES** (بالصيغة المحافظة أدناه).
**MIGRATION_REQUIRED_FOR_PUBLIC_RELEASE: YES** (الموافقة + اللقطات — راجع 8 و9).

## 1. CURRENT_DATA_AVAILABILITY
مبني على فحص فعلي للمخطط ولمحرك KPI الحالي (`src/lib/kpi/*`, 1605 سطر) الذي يحسب أداء الأعضاء داخل المكتب على الخادم.

| Metric | المصدر | AVAILABLE | RELIABLE | PRIVACY_SAFE | GAMEABLE | RECOMMENDED |
|---|---|---|---|---|---|---|
| مهام منجزة في موعدها | `tasks.due_date, completed_at, status` | نعم | نعم | نعم (Metadata فقط) | متوسط (تغيير due / مهام سهلة) | نعم |
| معدل إنجاز المهام المستحقة | `tasks` | نعم | نعم | نعم | متوسط | نعم |
| الالتزام بالمهل | `deadlines.due_date, status, completed_at` | نعم | نعم | نعم | منخفض (المهل مرتبطة بالمحكمة) | نعم — أعلى وزن |
| متابعة الجلسات | `hearings.hearing_date, status` (`scheduled/completed/postponed/cancelled/missed`) | نعم | نعم | نعم | متوسط (تحديث الحالة يدوي) | نعم بوزن محدود |
| المتابعة التشغيلية للقضايا | `cases.status, last_activity_at, next_action_date` | نعم | جزئياً (`last_activity_at` يتحرك بأي تعديل) | نعم | مرتفع | لا للنسخة الأولى |
| سجل النزاهة | `work_item_events` (`due_changed`, `reopened`, `deleted`, `assigned`, `from/to_due_date`, `seq`) | نعم | نعم | نعم | — | نعم كطبقة مضادة للتلاعب |
| حالة الاشتراك | `subscriptions.status, ends_at` | نعم | نعم | داخلي | — | نعم للأهلية |
| الاسم العام | `organizations.name/legal_name` + `office_public_pages.published` | نعم | نعم | معتمد للنشر عبر الصفحة العامة | — | نعم |

غير مستخدم إطلاقاً: المستندات، العملاء، أطراف القضايا، الفواتير/المبالغ، محتوى المهام، نتائج الدعاوى.

## 2. RECOMMENDED_SCORE_FORMULA (v1)
ثلاثة أبعاد فقط + معامل نزاهة — نسب لا أحجام. N/A لا يُحسب صفراً بل يُعاد توزيع وزنه.

| البعد | الوزن | التعريف | المصدر | خطر التلاعب |
|---|---|---|---|---|
| الالتزام بالمهل | 45% | مهل مستحقة داخل النافذة أُنجزت قبل أول موعد مسجل | `deadlines` + `work_item_events` | منخفض |
| المهام في موعدها | 35% | مهام مستحقة أُنجزت قبل موعدها الأساسي | `tasks` + الأحداث | متوسط |
| متابعة الجلسات | 20% | جلسات مضت وحُدِّثت حالتها خلال 7 أيام (`completed/postponed`) وليست `missed` أو ما زالت `scheduled` | `hearings` | متوسط |

`raw = Σ(value×weight)/Σ(weights المطبقة)` → `score = round(raw×100×integrityFactor)`، والنتيجة 0–100.

**REVISED_V1_FORMULA (محافظة بعد بوابة النزاهة):** الأوزان كما اعتُمدت 45/35/20، مع تعديلين:
1. الاستحقاق يقاس بـ `due_date` الحالي في الجدول، ويُستبدل بأول موعد مسجّل **فقط** عندما يوجد حدث `due_changed` مثبت يظهر تمديداً بعد تجاوز الموعد.
2. بعد الجلسات يُحسب من `hearings` وحدها (لا سجل أحداث لها)، ولذلك يُصنَّف `metric_quality = self_reported` ويُوثَّق في اللقطة، ويُعامل كـ N/A عند غياب جلسات مستحقة بدل صفر.
سبب الاختلاف عن 35/30/20/15: المهل هي الالتزام القانوني الأصعب تلاعباً؛ ومتابعة القضايا عبر `last_activity_at` قابلة للتضخيم بأي تعديل صوري فتُستثنى من v1.

## 3. ELIGIBILITY_RULES
- اشتراك `active` وغير موقوف، والمكتب `is_active`.
- عمر المكتب ≥ 45 يوماً.
- ≥ 25 عملاً مؤهلاً فريداً (مهل + مهام + جلسات مستحقة) خلال النافذة، منها ≥ 5 مهل أو جلسات — يمنع مكتب المهام الصورية.
- ≥ 30 يوم تتبع فعلي.
- `public_ranking_opt_in = true` (افتراضي OFF).
- اسم عام معتمد موجود.
- `score ≥ MINIMUM_PUBLIC_SCORE` (مقترح 78).
- غير مستبعد إدارياً، وصفحته العامة غير موقوفة (`suspended_by_platform`).
- بيانات غير كافية ⇒ «بيانات غير كافية»، ولا 0%، ولا دخول للترتيب.

## 4. PRIVACY_MODEL
- **عام:** الترتيب، الاسم العام، النسبة، شعار اختياري، Badge. لا `organization_id` (يُستخدم مفتاح مبهم/مؤقت أو لا مفتاح).
- **خاص بالمكتب:** نتيجته وأبعادها + «أنت ضمن أفضل X%» كشرائح خمسية فقط (25/50/75) وبحد أدنى 8 مكاتب مؤهلة قبل إظهار الشريحة.
- **مالك المنصة:** Top 50 داخلياً، الأبعاد، الأهلية، سبب الاستبعاد، آخر حساب، الاتجاه.
- **ممنوع في كل الطبقات:** عملاء، قضايا، مستندات، مبالغ، موظفون، وسائل تواصل، نتائج قضايا، أعداد خام تكشف حجم المكتب.

## 5. ANTI_GAMING_MODEL
- تمديد الموعد بعد تجاوزه لا ينفع **عندما يوجد حدث `due_changed` مثبت** (PROVEN_MANIPULATION_SIGNAL)؛ وغياب الحدث لا يُعاقب عليه (MISSING_AUDIT_EVIDENCE).
- الحذف لا يُنجي عندما يوجد حدث `deleted` مثبت بعد الاستحقاق؛ العناصر المحذوفة بلا حدث لا تُفترض ولا تُحتسب.
- `reopened` بعد الإنجاز يُلغي احتساب الإنجاز في موعده.
- المهام المُنشأة ومُنجزة داخل نفس الساعة تُستثنى من البسط والمقام.
- سقف مساهمة المهام: لا يمكن أن يتجاوز وزنه المقرر حتى مع أحجام ضخمة.
- معامل نزاهة (0.85–1.00) ينخفض **بأحداث مثبتة فقط**؛ 1.00 عند غياب أي دليل.
- التمييز بين PROVEN_MANIPULATION_SIGNAL و MISSING_AUDIT_EVIDENCE مُصرَّح به في الكود وفي اللقطة.
- التصنيف بلا أي قراءة لمحتوى قانوني.

## 6. SCORE_WINDOW
**ROLLING_90_DAYS فقط** لـ v1 كما اعتُمد. الترتيب الشهري **DEFERRED_AFTER_V1** (تبقى بنية اللقطة تحمل `window_kind` ليُضاف لاحقاً بلا كسر).

## 7. SCORE_UPDATE_ARCHITECTURE
حساب مجدول (Cron) عبر مسار `POST /api/public/hooks/operational-score` محمي بـ `guardCronRequest` — نفس نمط `notifications-dispatch`. الدورة: كل 6 ساعات (وشهرياً لإغلاق الشهر). الناتج لقطة واحدة مخزّنة (rank + name + score + badge + computed_at + formula_version). الصفحة العامة تقرأ اللقطة فقط: استعلام واحد، بلا أي aggregate لكل زيارة.

## 8. DATABASE IMPACT
**MIGRATION_REQUIRED** للنسخة الكاملة. الحد الأدنى المطلوب:
1. `organization_ranking_settings` (أو أعمدة مكافئة): `organization_id`, `public_opt_in bool default false`, `opted_in_at/by`, `platform_excluded bool`, `exclusion_reason` + GRANT + RLS (المكتب يقرأ/يعدّل خاصته، منصة تقرأ الكل).
2. `operational_score_snapshots`: `organization_id`, `window_kind` (rolling_90/month), `period_start/end`, `score`, `dimensions jsonb`, `eligible bool`, `ineligibility_reason`, `sample_items`, `integrity_factor`, `formula_version`, `computed_at`.
3. مفتاح إعدادات في `platform_settings` (`operational_score`) — بلا Migration للجدول، لكن قراءته العامة تحتاج توسيع سياسة `anyone reads public settings` (قائمة المفاتيح مقيدة حالياً بـ general/seo/public_site) أو قراءة اللقطة خادمياً.
4. سجل تدقيق: يُعاد استخدام `admin_audit_logs` و`activity_logs` — لا جداول جديدة.
لا يوجد حل نظيف بلا Migration: لا يوجد أي حقل موافقة عام حالياً، وحقن العلم داخل `office_public_pages.draft/published` يربط الموافقة بنشر الصفحة ويلوّث لقطة مُصمَّمة لمحتوى الصفحة — مرفوض كـ workaround.

## 9. RECOVERY_GATE_STATUS
- B1 محرك الحساب (كود فقط، بلا تخزين) — قابل للتنفيذ.
- B3 عرض المكتب الخاص لنتيجته (حساب لحظي) — قابل للتنفيذ.
- B2 الموافقة + B4 اللقطات/الإدارة + B5 القسم العام — **IMPLEMENTATION_BLOCKED_BY_RECOVERY_GATE** حتى إثبات Backup/Restore.

## 10. PUBLIC API/RPC DESIGN
`getPublicOperationalRanking()` — Server Function عام، قراءة فقط، بلا مدخلات (أو `window: rolling_90 | month` فقط).
يُعيد: `{ enabled, computedAt, window, items: [{ rank, publicName, score, badge?, logoUrl? }] }`.
لا `organization_id`، لا أبعاد، لا أعداد خام، لا استعلام لمكتب محدد، لا تعداد للمؤسسات، ولا تجاوز للموافقة.

## 11. HOMEPAGE UX
قسم في `src/routes/index.tsx` بعد المميزات وقبل الأسعار: عنوان **«الأكثر إنجازاً على مِهلة»** (بديل مقترح: «مكاتب متميزة في الالتزام التشغيلي»)، وصف سطر واحد، ثم 5 صفوف: رقم `01–05` بخط العرض الذهبي الخفيف، اسم المكتب، نسبة مئوية tabular-nums، شريط تقدّم رقيق بلون الهوية، وسم «مؤشر الإنجاز التشغيلي». تمييز المركز الأول بحدّ ذهبي رقيق فقط — بلا ذهب/فضة/برونز ولا Gamification. حركة Reveal واحدة تحترم `prefers-reduced-motion`. RTL بالكامل، بطاقات متراكمة على الجوال، أهداف لمس ≥44px. Disclaimer: «يعكس المؤشر مستوى الإنجاز التشغيلي داخل مِهلة ولا يمثل تقييماً لجودة الخدمات القانونية أو نتائج القضايا.»

## 12. OFFICE SETTINGS UX
قسم «الظهور في مؤشر الإنجاز» داخل إعدادات المكتب: ما يظهر (الاسم، النسبة، الترتيب) وما لا يظهر (عملاء/قضايا/مستندات/أرقام)، اختيارية الانضمام، أن النسبة تشغيلية لا نتائج قضايا، وإمكانية التعطيل في أي وقت مع الاختفاء في الدورة التالية. مفتاح واحد Default OFF + CTA «السماح بالظهور في قائمة المكاتب المتميزة». مقصور على مالك/مدير المكتب ويُدقَّق في `activity_logs`.

## 13. OFFICE PRIVATE SCORE UX
بطاقة في لوحة المكتب: النتيجة الكلية + الأبعاد الثلاثة + الاتجاه مقابل الفترة السابقة + سبب عدم الأهلية إن وُجد + شريحة «أنت ضمن أفضل X%» بشروط المادة 4. لا أسماء منافسين إطلاقاً. تظهر بلا علاقة بالموافقة العامة.

## 14. PLATFORM ADMIN UX
`/mehla-admin/operational-score` (يُضاف إلى `src/lib/admin-nav.ts`): جدول Top 50 (الترتيب، المكتب، النتيجة، الأبعاد، الأهلية/السبب، حالة الموافقة، آخر حساب، الاتجاه)، بطاقات إعدادات، ومعاينة القسم العام. محمي بصلاحية منصة مخصصة، وكل قراءة تُتحقق خادمياً.

## 15. ADMIN CONTROLS
تشغيل/إيقاف القسم العام، الحد الأدنى للنسبة، الحد الأدنى للنشاط، عدد النتائج (افتراضي 5)، نافذة القياس، استبعاد/إعادة إدراج مكتب بسبب مسجّل، معاينة، وإعادة حساب يدوية. **لا تعديل يدوي للنتيجة — Score = CALCULATED ONLY** ولا واجهة ولا دالة تسمح بذلك.

## 16. FORMULA VERSIONING
الأوزان **CODE CONTROLLED** في v1 داخل ملف مشترك مع `FORMULA_VERSION = "v1"` مخزّن في كل لقطة، فلا تُقارن نتائج بصيغتين مختلفتين. تعديل الأوزان من الإدارة يؤجَّل حتى تتوفر Draft/Publish وتاريخ سريان وسجل تدقيق.

## 17. SECURITY / TENANT_ISOLATION
المسار العام قراءة فقط للقطة المؤهلة. نتيجة المكتب تُحسب عبر `requireSupabaseAuth` وتقتصر على مؤسسة العضو. لوحة المنصة تتحقق من الصلاحية على الخادم. الحساب الدوري بمفتاح الخدمة داخل مسار Cron محمي بسر بمقارنة ثابتة الزمن. تُدقَّق: opt-in/out، استبعاد/إدراج إداري، تغيير الإعدادات — بلا أي بيانات عملاء أو قضايا.

## 18. PERFORMANCE
الزيارة العامة = قراءة لقطة واحدة + كاش استعلام. الحساب الدوري بدُفعات لكل مؤسسة مع فهارس الاستخدام الحالية. لا aggregate عند الطلب على الصفحة العامة، ولا N+1، والمكوّن مُقسَّم كسولاً.

## 19. FAILURE / FALLBACK BEHAVIOR
فشل الحساب ⇒ تبقى آخر لقطة صالحة معروضة مع حد أقصى للعمر (72 ساعة)، وبعده يُخفى القسم بصمت. لا نتائج جزئية، لا 0%، لا بيانات وهمية، ولا كسر للصفحة الرئيسية.

## 20. EXACT FILES / ROUTES EXPECTED
- `src/lib/operational-score/score.shared.ts` (الأوزان، النسخة، العتبات، الصياغات)
- `src/lib/operational-score/score.engine.ts` (حساب نقي قابل للاختبار)
- `src/lib/operational-score/score.server.ts` (قراءات + أهلية + لقطات)
- `src/lib/operational-score/score.functions.ts` (خاص بالمكتب + إدارة المنصة)
- `src/lib/operational-score/public.functions.ts` + `public.server.ts` (قراءة عامة)
- `src/routes/api/public/hooks/operational-score.ts` (Cron)
- `src/components/marketing/top-offices.tsx` + إدراج في `src/routes/index.tsx`
- `src/components/office/ranking-consent.tsx` داخل إعدادات المكتب
- `src/components/dashboard/operational-score-card.tsx`
- `src/routes/mehla-admin/operational-score.tsx` + `src/lib/admin-nav.ts` + `src/lib/admin-permissions.ts`
- `docs/operational-score-architecture.md`

## 21. IMPLEMENTATION BATCHES
- **B1 — محرك النتيجة (بلا تخزين):** shared + engine + اختبارات وحدة للأهلية والنزاهة و N/A. غير محجوب.
- **B2 — نتيجة المكتب الخاصة:** server fn + بطاقة اللوحة، بلا شريحة مقارنة. غير محجوب.
- **B3 — الموافقة والاستبعاد الإداري:** يحتاج Migration ⇒ محجوب.
- **B4 — اللقطات + Cron:** يحتاج Migration ⇒ محجوب.
- **B5 — لوحة مالك المنصة + الإعدادات + المعاينة:** بعد B3/B4.
- **B6 — القسم العام في الصفحة الرئيسية + الشريحة المئوية:** بعد B4/B5.
- **B7 — QA وتحقق الخصوصية والاستجابة ثم النشر.**

## 22. LIVE RELEASE CHECKLIST
Type Check + ESLint + Build؛ تحقق يدوي أن المخرج العام لا يحمل إلا 5 حقول؛ إثبات أن مكتباً بلا موافقة لا يظهر؛ إثبات أن مكتباً بعمل واحد لا يدخل؛ إثبات أن تأجيل موعد متأخر لا يرفع النتيجة؛ إثبات أن حذف عنصر متأخر لا يرفعها؛ عزل المستأجرين؛ سلوك Fallback عند فشل الحساب؛ جوال/تابلت/سطح مكتب؛ سجلات التدقيق؛ ثم النشر.

## 23. RISKS
تفاوت جودة إدخال حالات الجلسات؛ عدد المكاتب المؤهلة قد يقل عن 5 عند الإطلاق؛ حساسية تسويقية للترتيب العام؛ خطر تفسير النسبة كتقييم مهني (يخفّفه الاسم والتنبيه)؛ اعتماد النزاهة على اكتمال `work_item_events` للفترات القديمة.

## 24. ITEMS REQUIRING USER DECISION
كل قرارات v1 اعتُمدت (راجع القسم 0). المتبقي للاعتماد فقط: نص OPT_IN_COPY النهائي، وهل يُظهر بعد الجلسات كبعد مستقل في واجهة المكتب مع وسم «مُدخَل من المكتب» بسبب غياب سجل أحداث الجلسات.

## 25. FINAL VERDICT
**PARTIAL** — المحرك ونتيجة المكتب الخاصة قابلان للبناء نظيفاً من المعمارية الحالية فوراً. الموافقة العامة واللقطات المخزّنة والقسم العام **تحتاج Migration** ⇒ `IMPLEMENTATION_BLOCKED_BY_RECOVERY_GATE`.

MEHLA_OPERATIONAL_SCORE_PLAN_READY
USER_APPROVAL_REQUIRED
