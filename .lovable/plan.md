# PUBLIC RANKING ANTI-GAMING GATE — v1 (تصميم / بدون تنفيذ)

طبقة مستقلة تُقرر **الأهلية للظهور العام فقط**. لا تلمس المؤشر الداخلي ولا تعدّل نتيجة أي مكتب.

## CURRENT_ANTI_GAMING_CAPABILITIES
- استبعاد المهام قصيرة العمر (< ساعة بين الإنشاء والإنجاز) من البسط والمقام (`SHORT_LIVED_TASK_MS`).
- تصحيح الموعد المعتمد بأحداث `due_changed` المثبتة مع منع العقوبة المزدوجة (`resolveEffectiveDue`).
- `integrityFactor = 1.00` محايد ومحفوظ في العقد واللقطة (`integrity_factor`) بلا استخدام فعلي.
- بوابة أهلية أساسية: عمر 45 يوماً، تتبع 30 يوماً، 25 عملاً مؤهلاً، 5 مهل/جلسات.
- الجلسات `self_reported`، المهل والمهام `audited`.

## DATA AVAILABILITY AUDIT (متحقق فعلياً)
- `tasks` / `deadlines`: `created_at, due_date, completed_at, status`.
- `hearings`: `hearing_date, status, created_at` فقط — **لا سجل أحداث إطلاقاً** (تأكيد: لا يوجد أي صف بـ `item_type='hearing'` في `work_item_events`).
- `work_item_events` المتاحة فعلاً لـ task/deadline: `created, due_changed, completed, deleted, reopened, assigned, baseline` مع `occurred_at, from_due_date, to_due_date, seq`.
- `organizations.created_at` لعمر المكتب.
- لا قراءة لأي عنوان أو اسم عميل أو مستند أو محتوى قانوني.

## TASK_GAMING_SIGNALS (نِسَب لا أعداد خام)
- `SHORT_LIVED_TASK_RATIO`: مهام عمرها < 24 ساعة من إجمالي المستحقة.
- `SAME_DAY_CREATE_COMPLETE_RATIO`: أُنشئت وأُنجزت في نفس يوم الرياض.
- `POST_DUE_CREATION_RATIO`: أُنشئت بعد موعدها المعتمد.
- `PRE_QUALIFICATION_BURST`: نسبة العناصر المؤهلة المنشأة في آخر 7 أيام من النافذة.
- `SINGLE_DIMENSION_DEPENDENCE`: النتيجة تعتمد فعلياً على بعد واحد.

## DEADLINE_GAMING_SIGNALS (الوزن 45% — أعلى حساسية)
- `SHORT_LIVED_DEADLINE_RATIO`: مهل أُنشئت وأُكملت خلال < 24 ساعة.
- `POST_DUE_DEADLINE_CREATION_RATIO`: أُنشئت بعد/قرب موعدها ثم أُغلقت مباشرة.
- `LATE_DUE_EXTENSION_ON_EXPIRED`: `due_changed` بعد انقضاء الموعد الأصلي (دليل مثبت من السجل).
- `DEADLINE_DELETION_AFTER_DUE_RATIO`: أحداث `deleted` لمهل بعد استحقاقها داخل النافذة.
- حماية الترحيل: تركّز المهل ذات مواعيد قديمة أو في أول 14 يوماً من الاستخدام = `ONBOARDING_IMPORT` ويُعالَج REVIEW لا HARD_BLOCK.

## HEARING_GAMING_SIGNALS
لا يمكن إثبات واقعية الجلسة داخل مِهلة: لا سجل أحداث ولا timestamp موثوق لتغيّر الحالة (`updated_at` يتغير بأي تعديل). لذلك v1 تحفّظي فقط:
- استبعاد أي جلسة أُنشئت **بعد** `hearing_date` من بُعد الجلسات لأغراض الظهور العام.
- `MIN_HEARING_AGE`: تُحتسب للترتيب العام فقط إذا أُنشئت قبل موعدها بـ ≥ 24 ساعة.
- `HEARING_CONTRIBUTION_CAP`: لا تمنح الجلسات وحدها أهلية عامة عندما تكون أبعاد المهل/المهام غير مطبقة.
- تصنيف ثقة أدنى يُذكر داخلياً في لوحة المنصة فقط.

## UNPROVABLE_SIGNALS (بصراحة)
- واقعية الجلسة قضائياً، ونية إنشاء المهمة أو المهلة.
- تعديل موعد غير مسجَّل في سجل الأحداث.
- حذف عناصر بلا حدث `deleted`.
- أي حكم على الجلسات مبني على وقت تغيير الحالة.

## RECOMMENDED_ACTIVITY_SPREAD_RULE
`MIN_ACTIVE_DAYS_IN_90 = 12`، واليوم النشط = يوم رياض فيه عنصر مؤهل واحد على الأقل (إنشاء أو إنجاز أو جلسة منقضية). المنطق: 25 عملاً موزعة على ≥ 12 يوماً = إيقاع تشغيلي أسبوعي حقيقي، ويستبعد «25 عنصراً في يومين» دون معاقبة المكتب الصغير المنتظم. الرقم يُعاد تقييمه على بيانات حقيقية بعد أول جولة لقطات.

## RECOMMENDED_CATEGORY_DIVERSITY
لا إلزام بالجلسات (يظلم مكاتب الاستشارات والتحكيم الكتابي). للترتيب العام:
- ≥ 25 عملاً مؤهلاً (كما هو)، و
- ≥ 2 أبعاد مطبَّقة فعلياً، أو بعد واحد مع ≥ 8 مهل مستحقة مؤهلة، و
- ≥ 5 مهل/جلسات مع اشتراط ألا تكون كلها جلسات مُنشأة بعد موعدها.

## BURST_DETECTION_MODEL (مفسَّر — لا ML)
- `TOP3_DAY_CONCENTRATION` = عناصر أكثر 3 أيام ÷ إجمالي المؤهلة؛ REVIEW عند > 0.60.
- `LAST7_PRE_QUALIFICATION_SHARE`؛ REVIEW عند > 0.50.
- كل مؤشر نسبة قابلة للعرض والشرح، ويُحسب من نفس الصفوف المحمّلة.

## HARD_BLOCK_SIGNALS (دليل مثبت أو بوابة أدلة)
- `LATE_DUE_EXTENSION_ON_EXPIRED` ≥ 3 عناصر داخل النافذة.
- `POST_DUE_DEADLINE_CREATION_RATIO` > 0.40.
- `SHORT_LIVED_DEADLINE_RATIO` > 0.40.
- `DEADLINE_DELETION_AFTER_DUE_RATIO` > 0.25.
- `INSUFFICIENT_ACTIVITY_SPREAD` (< 12 يوماً نشطاً).

## REVIEW_ONLY_SIGNALS
تركيز 3 أيام، Burst آخر 7 أيام، الاعتماد على بعد واحد، ارتفاع نسبة المهام قصيرة العمر، نمط ترحيل بيانات، اعتماد كبير على جلسات حديثة الإنشاء. أي إشارة إحصائية وحدها ليست Hard Block.

## FALSE_POSITIVE_PROTECTIONS
- نِسَب وتوزيع بدل الأعداد الخام: لا عقوبة على الحجم.
- استثناء نمط الترحيل من Hard Block.
- الموسمية: نافذة 90 يوماً + شرط أيام نشطة (لا انتظام يومي).
- المكتب قليل الجلسات: لا إلزام جلسات.
- كل حجب يخرج مع `reasonCodes` قابلة للتفسير، وبلا أي نص اتهامي في واجهة المكتب.

## RECOMMENDED_INTEGRITY_GATE + السلسلة
```text
Operational Score (لا تتغير)
  -> Base Eligibility (45d / 30d / 25 items / 5 D+H)
  -> Anti-Gaming Integrity Gate (PASS | REVIEW_REQUIRED | INELIGIBLE)
  -> Opt-in
  -> Public Ranking Eligibility (score >= 78 + اسم عام منشور + اشتراك نشط)
  -> Top 5
```
نؤكد صحة هذا التسلسل. الظهور العام يتطلب `PASS` فقط، و`REVIEW_REQUIRED` = لا ظهور مع بقاء النتيجة الداخلية كما هي.

## PUBLIC_INTEGRITY_STATUS_MODEL
```ts
type PublicIntegrityStatus = "pass" | "review_required" | "ineligible";
type PublicIntegrityAssessment = {
  status: PublicIntegrityStatus;
  reasonCodes: string[];            // رموز فقط، لا محتوى
  signals: Record<string, number>;  // نِسَب 0–1 وأعداد إشارات
  evaluatedAt: string;
};
```

## DATABASE_MIGRATION_REQUIRED
**NO** — يُحسب وقت توليد اللقطة ويُخزَّن في `operational_score_snapshots.dimensions` (jsonb قائم) تحت مفتاح مستقل `integrity`، مع بقاء `integrity_factor = 1.00` كما هو. لا حقول جديدة ولا حل هش: الحقل jsonb مخصص أصلاً لبيانات اللقطة، والقراءة العامة خادمية فقط.

## SNAPSHOT_STORAGE_MODEL
`dimensions = { deadlines, tasks, hearings, integrity }`. اختيار أحدث لقطة لكل مكتب واستبعاد ما ليس `pass` يحدث في `ranking.server.ts`، ولا يُسرَّب أي `reasonCode` للعامة.

## PERFORMANCE_IMPACT
**LOW** — كل الإشارات من نفس الصفوف المحمّلة في `score.server.ts` بمرور واحد إضافي في الذاكرة. لا استعلام إضافي، لا N+1، لا تغيير في حدود الصفوف.

## EXACT_FILES_EXPECTED (عند البناء)
- `src/lib/operational-score/integrity.shared.ts` (جديد): العتبات والأنواع ورموز الأسباب والنصوص المحايدة.
- `src/lib/operational-score/integrity.engine.ts` (جديد): `assessPublicIntegrity(input)` دالة نقية قطعية.
- `src/lib/operational-score/score.server.ts`: تمرير نفس الصفوف للمحرك بلا تغيير النتيجة.
- `src/lib/operational-score/snapshot.server.ts`: كتابة `dimensions.integrity`.
- `src/lib/operational-score/ranking.server.ts`: اشتراط `pass` + سبب أهلية محايد.
- `scripts/operational-score-integrity.test.ts` (جديد).
- `docs/operational-score.md`: توثيق البوابة.

## OFFICE UX (نص محايد فقط)
- غير مؤهل: «يتطلب التأهل للظهور العام توفر نشاط تشغيلي منتظم وبيانات كافية عبر فترة القياس.»
- قيد المراجعة: «الظهور العام قيد المراجعة.»
- لا إشارة إلى تلاعب أو اشتباه في أي واجهة مكتب.

## PLATFORM ADMIN
قراءة فقط: النتيجة، الأهلية الأساسية، حالة النزاهة، `reasonCodes`، ملخص الإشارات الرقمية، تاريخ اللقطة. لا محتوى قضايا أو مهام، ولا تعديل يدوي للنتيجة.

## TARGETED_TEST_CASES
1. مكتب صغير منتظم (28 عنصراً على 20 يوماً) = PASS.
2. مكتب كبير (400 عنصر على 70 يوماً) = PASS.
3. 25 عنصراً في يومين = INELIGIBLE (`INSUFFICIENT_ACTIVITY_SPREAD`).
4. 60% من المهل أُنشئت بعد موعدها ثم أُكملت = INELIGIBLE.
5. تمديد 4 مواعيد بعد انقضائها = INELIGIBLE.
6. ترحيل بيانات عند البدء = REVIEW_REQUIRED لا INELIGIBLE.
7. مكتب بلا جلسات = PASS.
8. كل الجلسات أُنشئت بعد موعدها = مستبعدة من البعد + REVIEW.
9. ذروة موسمية داخل 90 يوماً = PASS.
10. تركيز 70% في 3 أيام = REVIEW_REQUIRED.

## FINAL_VERDICT
**READY_FOR_BUILD** (v1، NO_MIGRATION، والميزة العامة تبقى DISABLED حتى مرحلة تالية).