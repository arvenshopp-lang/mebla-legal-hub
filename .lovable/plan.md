# نظام الباقات والاشتراكات والتسعير — معمارية وخطة تنفيذ (خطة فقط)

> **APPROVED_DESIGN_BASELINE — لا تنفيذ.** هذه الخطة محفوظة كخط أساس تصميمي معتمد فقط: لا Migration، لا تعديل كود، لا تغيير على الإنتاج.

## 0. SAFETY AMENDMENT (قيود ملزِمة قبل أي تنفيذ)
**0.1 RECOVERY GATE** — كل Batch يحتاج Migration أو جداول/أعمدة جديدة أو ترحيل استحقاقات أو ترحيل إصدارات باقات حالته: `DESIGN_APPROVED` + `IMPLEMENTATION_BLOCKED_BY_RECOVERY_GATE` حتى إثبات Backup/Restore على بيئة الإنتاج وفق مسار الاستعادة المعتمد. ممنوع أي Migration على الإنتاج قبل ذلك. المعني: B1، B2، B5، B7 (وB3/B6 عند اعتمادهما على أعمدة جديدة).
**0.2 FEATURE TRUTH / RELEASE GATE** — لا تُصنَّف ميزة `AVAILABLE` في الكتالوج إلا بتحقق الثلاثة: `FEATURE_IMPLEMENTED = TRUE` و`PRODUCTION_ACCEPTANCE_TEST = PASS` و`NO_OPEN_P0_P1_BLOCKER_FOR_FEATURE = TRUE`؛ وإلا فهي `LIMITED` / `COMING_SOON` / `NOT_IMPLEMENTED` / `DEFERRED_PROVIDER`. حالياً: الدفع = DEFERRED_PROVIDER، WhatsApp/WhatsLine = DEFERRED_PROVIDER، SMS OTP = DEFERRED_PROVIDER، API = COMING_SOON، وأي قدرة عروض أسعار/عقود لديها Finding مفتوح لا تُسوَّق كجاهزة حتى الإغلاق المستقل.
**0.3 EXPIRED/SUSPENDED POLICY** — السلوك الحالي (`private.org_effective_plan` يرجع إلى `free` عند عدم كون الحالة active/trial) يبقى **كما هو دون أي تغيير الآن**، و`EXPIRED_SUBSCRIPTION_ACCESS_POLICY = USER_APPROVAL_REQUIRED`.
**0.4 BILLING PROTECTION** — لا مساس بـ `platform_invoices` / `platform_payments` / الاستردادات / الإشعارات الدائنة / ويبهوكات الدفع، ولا دمج بين معمارية الاشتراكات الجديدة والنظام المالي قبل قرار المزود. `BILLING_PROVIDER_INTEGRATION = DEFERRED_PROVIDER`.
**0.5 PRICING** — 149 / 449 / 1199 والأسعار السنوية المقترحة تبقى `PRICE_REQUIRES_USER_APPROVAL` ولا تُدخل كقيم إنتاجية.
**0.6 EXECUTION PRIORITY** — التنفيذ لا يبدأ قبل إغلاق العيوب الحالية ذات الأولوية والوصول إلى `CURRENT PLATFORM BASELINE = FEATURE_READY`.

### فصل حالات المشترك (تصميم مستقبلي، بلا تنفيذ)
```text
active → past_due → grace → restricted (read_only) → suspended
```
- **FREE CUSTOMER**: لم يشترك قط؛ حدود الباقة المجانية كتابةً وقراءةً.
- **PAST_DUE**: انتهى/فشل الاستحقاق حديثاً؛ صلاحيات كاملة مع تنبيه تجديد.
- **GRACE_PERIOD**: مهلة محددة؛ صلاحيات كاملة مع تنبيه تصاعدي.
- **EXPIRED PAID CUSTOMER**: لا يُفترض تحويله تلقائياً إلى Free بصلاحيات كتابة كاملة؛ الوضع المقترح `restricted/read_only` (قراءة وتصدير كامل، منع الإنشاء) — بانتظار قرار المستخدم.
- **SUSPENDED**: قراءة فقط ومنع كل كتابة (السلوك القائم).
- في كل الحالات: **لا حذف بيانات ولا تقليص محتوى**؛ التقييد على الكتابة فقط، مع حالة صريحة محفوظة على الاشتراك وسجل تدقيق لكل انتقال.

## 1. CURRENT_SUBSCRIPTION_ARCHITECTURE (مُتحقَّق من الكود وقاعدة البيانات)
- الكتالوج: جدول `platform_plans` (code, name_ar/name_en, description, price_monthly, price_yearly, currency, duration_months, max_users/max_cases/max_clients/max_documents/max_branches, storage_gb, ocr_pages_monthly, features jsonb, is_active, is_public, sort_order, color, support_level, sla_hours + رايات: ai/esignature/voice/api/pdf_search/client_upload/public_office_page).
- الباقات الفعلية اليوم: free (غير عامة، 1 مستخدم/5 قضايا)، basic 199/1990، professional 499/4990، enterprise 1499/14990 — كلها SAR.
- اشتراك المكتب: `subscriptions` (plan_id, plan_code, plan_label, status, amount, currency, starts_at, ends_at, auto_renew, suspended_at, cancelled_at).
- الباقة الفعالة: `private.org_effective_plan(org)` — عند الحالة active/trial تُقرأ خطة الاشتراك، وإلا الرجوع إلى free. الحالة من `private.org_subscription_state`.
- الفرض الخادمي موجود فعلاً: تريجر `private.enforce_plan_quota` على cases/clients/documents/document_requests/organization_members/organization_invitations يرفع `QUOTA_EXCEEDED:<metric>` و`SUBSCRIPTION_SUSPENDED`؛ والاستخدام المُقاس عبر `record_metered_usage` و`consume_ocr_pages` مع `usage_counters`.
- الواجهة: `my_subscription_overview` RPC → `subscription.server.ts` (loadOverview / assertEntitlement) → `subscription.functions.ts` → `use-subscription` → `FeatureGate` + صفحة `/_authenticated/subscription`.
- الإدارة: `/mehla-admin/plans` (كتابة مباشرة على `platform_plans` من المتصفح) و`/mehla-admin/subscriptions`.
- لا يوجد مسار `/pricing` عام ولا قسم أسعار في الصفحة الرئيسية، ولا نظام طلب عرض مخصص.

CURRENT_STRENGTHS: مصدر حقيقة واحد للحدود داخل قاعدة البيانات؛ فرض على مستوى DB لا يمكن تجاوزه من الواجهة؛ ترجمة أخطاء عربية جاهزة؛ لا توجد شروط `plan === "professional"` متفرقة في الكود (تم التحقق).
REUSABLE_COMPONENTS: كل ما سبق يُعاد استخدامه كما هو — لا إعادة تصميم.
TECHNICAL_DEBT: القدرات أعمدة boolean ثابتة (كل ميزة جديدة = migration)؛ `plans.tsx` يحرّر جزءاً من الأعمدة فقط بلا Draft ولا تدقيق؛ لا Versioning ولا Overrides لكل مكتب؛ لا تمييز بين سعر الكتالوج وشروط عقد العميل.

## 2. CURRENT_PROBLEMS
1) تعديل سعر الكتالوج قد ينعكس ضمناً على العملاء الحاليين — لا Grandfathering معلن.
2) أسماء الباقات الحالية لا تطابق التوجه المطلوب، وenterprise لها سعر ثابت بدل «عرض مخصص».
3) عرض الميزات يعتمد على boolean فقط؛ لا تصنيف AVAILABLE/LIMITED/COMING_SOON.
4) لا صفحة أسعار عامة ولا مسار طلب عرض مخصص → لا قناة Lead للمؤسسات.
5) لوحة الإدارة تكتب مباشرة بلا سجل تدقيق تجاري ولا معاينة.
6) لا تحذيرات استهلاك (80/90%) قبل الوصول للحد.

## 3. PROPOSED_PLAN_CATALOG (كل الأسعار PRICE_REQUIRES_USER_APPROVAL)
| الباقة | الجمهور | شهري | سنوي (~شهران مجاناً) | حدود مقترحة | تشمل | غير متاح |
|---|---|---|---|---|---|---|
| فردي | محامي/مستشار مستقل | 149 | 1490 | 2 مستخدم، 150 عميل، 150 قضية، 1000 مستند، 10GB، OCR 300ص/شهر | العملاء، القضايا، الجلسات، المهل، المهام، المستندات، اللوحة، التنبيهات، البحث داخل المستندات، الصفحة العامة للمكتب | التوقيع الإلكتروني، API، الأدوار المتقدمة |
| احترافية | مكاتب صغيرة ومتوسطة | 449 | 4490 | 10 مستخدمين، 1000 عميل، 1000 قضية، 5000 مستند، 50GB، OCR 2000ص | + إدارة الفريق والأدوار، روابط رفع العميل، عروض الأسعار والعقود، تقارير أداء الفريق، الطباعة بعلامة مائية، التصدير | API، SLA مخصص |
| أعمال | مكاتب كبيرة وإدارات قانونية | 1199 | 11990 | 30 مستخدماً، عملاء/قضايا غير محدودة، 25000 مستند، 250GB، OCR 8000ص | + RBAC متقدم، سجل تدقيق وطباعة موسّع، ضوابط المستندات، دعم ذو أولوية، مركز البريد والدعم | API (قريباً)، التكاملات (مؤجلة) |
| مؤسسات/مخصصة | جهات كبيرة ومتطلبات خاصة | «اطلب عرضاً مخصصاً» | — | حدود تعاقدية | + حدود مخصصة، SLA، تأهيل وتدريب، ضوابط أمنية | — |

قاعدة صدق الميزات: AI = COMING_SOON، esignature = LIMITED (داخل العقود فقط)، voice = NOT_IMPLEMENTED، api = COMING_SOON، WhatsApp/SMS = DEFERRED_PROVIDER، الدفع الإلكتروني = DEFERRED_PROVIDER، النسخ الاحتياطي لا يُذكر كوعد.

## 4. PRICING_PAGE_UX — مسار عام جديد `/pricing`
Hero («اختر الباقة المناسبة لطريقة عملك») → Toggle شهري/سنوي (Segmented، `role="radiogroup"`، السنوي يُظهر السعر السنوي الحقيقي + ما يعادله شهرياً + مقدار التوفير + «يُدفع مقدماً لسنة») → أربع بطاقات (الجمهور، السعر، دورة الفوترة، أهم خمس مزايا، الحدود الرئيسية، CTA، «كل التفاصيل» يفتح Sheet) → توصية على «احترافية» فقط → جدول مقارنة بتصنيفات (الإدارة القانونية، الفريق، المستندات، الصلاحيات، التقارير، المبيعات، الدعم، الأمان، المؤسسات)، وعلى الجوال يتحول إلى Accordion لكل تصنيف بشارات (✓ / محدود / قريباً) بلا تمرير أفقي → قسم ثقة بحقائق مثبتة فقط (عزل بيانات المكاتب، صلاحيات الفريق، سجل تدقيق، روابط مستندات موقعة) → FAQ → CTA مؤسسي. RTL أولاً وبنفس Design Tokens الحالية دون ألوان جديدة.

## 5. FEATURE_ENTITLEMENT_ARCHITECTURE
```text
platform_plans (كتالوج) → plan_versions → plan_entitlements (key,value) → org_plan_overrides
                                   ↓
                 private.org_effective_entitlements(org)  ← مصدر الحقيقة الوحيد
                    ↓                               ↓
        enforce_plan_quota / server fns      my_subscription_overview → UI
```
- سجل مفاتيح تقنية مُقيَّد (`entitlement_definitions`) يفصل TECHNICAL KEY عن DISPLAY LABEL؛ الإدارة تعدّل القيم والعرض ولا تخترع مفاتيح.
- نوعان: Boolean (قدرات) وNumeric/Unlimited (حدود). تبقى واجهة `hasFeature/assertEntitlement` نفسها مع قراءة الاستحقاقات الفعلية.

## 6. PLATFORM_ADMIN_ARCHITECTURE — توسيع `/mehla-admin/plans`
بطاقات الباقات + محرر (Drawer/صفحة) بأربع تبويبات: المعلومات (الأسماء، slug مقيّد، الأوصاف، الجمهور، Badge)، التسعير (شهري/سنوي، العملة، الظهور: عام/مخفي/بدعوة/سعر مخصص، CTA: اشترك أو تواصل مع المبيعات)، المميزات (Feature Matrix: مُدرجة/محدودة/غير مدرجة/قريباً/للمؤسسات + الترتيب + مكان الظهور: بطاقة/جدول)، الحدود (Validation: أعداد صحيحة ≥ 0 أو «غير محدود» حيث يكون مدعوماً). زر «معاينة صفحة الأسعار» (Desktop/Mobile) على المسودة. مسار Draft → Preview → Publish (الآن أو تاريخ سريان) مع تحذير التغييرات غير المحفوظة، وسجل تدقيق لكل تغيير (من/متى/القديم/الجديد) على نمط `design_versions` و`admin_audit_logs`. باقات خاصة بمكتب: `visibility=private` مرتبطة بالمكتب ولا تظهر عامة. Overrides على مستوى المكتب للفروقات البسيطة بدل باقة جديدة.

## 7. CUSTOM_QUOTE_WORKFLOW
`/pricing` → «اطلب عرضاً مخصصاً» → صفحة `/enterprise` (نموذج ثلاث خطوات: الجهة → الحجم → الاحتياجات والتواصل) → مسار عام `POST /api/public/enterprise-request` (تحقق Zod + Rate limit + بلا بيانات زائدة) → جدول الطلبات → `/mehla-admin/subscriptions/requests` (قائمة + بحث وفلاتر) → تفاصيل الطلب: تغيير الحالة، ملاحظة داخلية، سعر مقترح، حدود ومميزات مقترحة → «تحويل إلى باقة خاصة/اشتراك مخصص» بعد القبول، دون أي تنفيذ دفع. الحالات: NEW / CONTACTED / QUALIFIED / PROPOSAL_PREPARED / PROPOSAL_SENT / NEGOTIATING / WON / LOST / ARCHIVED بعناوين عربية.

## 8. EXISTING_CUSTOMER_PROTECTION
فصل صريح بين **سعر الكتالوج** (platform_plans / إصدار الباقة) و**شروط عقد العميل** (`subscriptions.amount` + `plan_version_id` + تثبيت السعر). أي تعديل سعر يطلب اختيار الأثر: «المشتركون الجدد فقط» (افتراضي) / «من التجديد القادم» / «الجميع» (بتأكيد صريح وسجل تدقيق). Versioning داخلي (احترافية v1/v2) دون إظهار الرقم للعميل، والاشتراك يشير إلى إصداره فلا يتغير سعر عميل حالي بصمت.

## 9. DATABASE / DATA MODEL IMPACT (مقترح فقط — لا Migration الآن)
إعادة استخدام: `platform_plans`, `subscriptions`, `usage_counters`, `enforce_plan_quota`, `org_effective_plan`, `my_subscription_overview`, `admin_audit_logs`.
جديد مقترح: `plan_versions`، `entitlement_definitions`، `plan_entitlements`، `org_plan_overrides`، `plan_change_audit`، `enterprise_requests` (+ `enterprise_request_events`)، وأعمدة: `platform_plans.visibility/audience/badge/cta_type`، `subscriptions.plan_version_id/price_locked`. كل جدول عام جديد مع GRANTS + RLS (قراءة عامة للباقات المنشورة فقط، والبقية لموظفي المنصة).

## 10. BACKEND ENFORCEMENT PLAN
الحدود الكمية: تريجر DB الحالي مع قراءة الاستحقاقات الفعلية (بما يشمل Overrides) — لا تغيير في مكان الفرض. القدرات: `assertEntitlement` داخل كل دالة خادمية حسّاسة (المستندات، الدعوات، العقود، OCR، الصفحة العامة). قراءة الكتالوج العام عبر RPC للباقات المنشورة فقط. كل كتابة إدارية تتحقق من `has_platform_permission` على الخادم وتُسجّل تدقيقاً.

## 11. FRONTEND PLAN
`src/routes/pricing.tsx`، `src/routes/enterprise.tsx`، `src/components/pricing/*` (BillingToggle, PlanCard, PlanDetailsSheet, ComparisonTable, ComparisonAccordion, TrustStrip, PricingFaq)، `src/lib/pricing.shared.ts` + `pricing.functions.ts`، توسيع `use-subscription`/`FeatureGate` لتصنيفات الميزات، وتحذيرات الاستهلاك 80/90/100% في `/subscription` واللوحة.

## 12. PLATFORM ADMIN PLAN
توسيع `src/routes/mehla-admin/plans.tsx` + `src/components/admin/plans/*` (PlanEditor, FeatureMatrix, LimitsEditor, PublishBar, PlanHistory, PricingPreview)، ومسار جديد `mehla-admin/subscriptions.requests.tsx` مع صفحة تفاصيل الطلب، وطبقة خادمية `src/lib/plans/*.functions.ts`.

## 13. MIGRATION PLAN (لاحقاً)
1) إضافة الجداول والأعمدة بشكل Additive فقط. 2) توليد إصدار v1 لكل باقة حالية وربط الاشتراكات القائمة به مع تثبيت السعر. 3) ترحيل الرايات الحالية إلى `plan_entitlements` مع الإبقاء على الأعمدة للتوافق (Dual-read ثم Cutover). 4) إعادة تسمية/تنظيم الباقات كخطوة تجارية منفصلة بعد موافقتك.

## 14. BILLING / MOYASAR READINESS
حالات جاهزة الآن دون تنفيذ: `pending_payment → active → past_due → grace → expired/cancelled`، وسجل أحداث اشتراك، وربط اختياري بجداول `platform_invoices`/`platform_payments` القائمة، مع نقطة ربط واحدة `createCheckoutIntent(planVersion, cycle)` ونمط ويبهوك جاهز تحت `/api/public/*`. لا مزود، لا مفاتيح، لا Proration الآن.

## 15. RISKS
تغيير سعر يمس عملاء حاليين (يُعالج بالإصدارات وتثبيت السعر)؛ ازدواج مصدر الحقيقة أثناء الترحيل (Dual-read محدود المدة)؛ محاولة تجاوز الاستحقاق عبر RPC مباشر (كل قدرة تُفرض خادمياً)؛ الوعد بميزات غير جاهزة (قاعدة التصنيف إلزامية)؛ جدول مقارنة غير قابل للاستخدام على الجوال (Accordion)؛ تسريب بيانات الطلبات (RLS + مسار عام محمي بـ Rate limit).

## 16. IMPLEMENTATION BATCHES (كلها مؤجلة حتى FEATURE_READY)
- B1 الكتالوج والإصدارات والاستحقاقات (DB) — DESIGN_APPROVED · IMPLEMENTATION_BLOCKED_BY_RECOVERY_GATE
- B2 الاستحقاقات الفعلية والفرض الخادمي + Overrides — DESIGN_APPROVED · IMPLEMENTATION_BLOCKED_BY_RECOVERY_GATE
- B3 لوحة إدارة الباقات (محرر/مصفوفة/حدود/Draft-Publish/تدقيق/معاينة) — DESIGN_APPROVED (يُحجب إن احتاج أعمدة جديدة)
- B4 صفحة الأسعار العامة (عرض فقط، بتصنيفات الميزات وبلا Checkout) — DESIGN_APPROVED
- B5 طلبات الباقات المخصصة — DESIGN_APPROVED · IMPLEMENTATION_BLOCKED_BY_RECOVERY_GATE
- B6 صفحة اشتراك المكتب وتحذيرات الاستهلاك — DESIGN_APPROVED
- B7 الترحيل والتوافق — DESIGN_APPROVED · IMPLEMENTATION_BLOCKED_BY_RECOVERY_GATE
- B8 ربط Moyasar — DEFERRED_PROVIDER

## 17. COST / SCOPE ASSESSMENT
REUSE: تريجرات الحدود، `org_effective_plan`، `subscription.server/shared`، `FeatureGate`، هيكل لوحة الإدارة. SMALL_CHANGE: تحذيرات الاستهلاك، أعمدة الظهور/Badge. MEDIUM_CHANGE: صفحة الأسعار، طلبات المؤسسات، Overrides. LARGE_CHANGE: نموذج الاستحقاقات والإصدارات وDraft/Publish/Audit في لوحة الإدارة.

## 18. ITEMS REQUIRING USER DECISION
FINAL_PRICING · ANNUAL_DISCOUNT · PLAN_NAMES · FREE_PLAN_POLICY (الحالية `free` غير عامة وتُستخدم كسقف افتراضي عند انتهاء الاشتراك — التوصية KEEP كسقف داخلي دون تسويقها) · CANCELLATION_POLICY = USER_APPROVAL_REQUIRED · EXPIRED_SUBSCRIPTION_ACCESS_POLICY = USER_APPROVAL_REQUIRED · EXISTING_CUSTOMER_PRICE_CHANGE_POLICY · CUSTOM_PLAN_POLICY · REFUND_POLICY = PRODUCT_POLICY_REQUIRED · TRIAL_POLICY · GRACE_PERIOD_DURATION.

## 19. DEFERRED
PAYMENT_GATEWAY = DEFERRED_PROVIDER · MOYASAR_INTEGRATION = DEFERRED_PROVIDER · BILLING_PROVIDER_INTEGRATION = DEFERRED_PROVIDER · WHATSLINE = DEFERRED_PROVIDER · SMS_OTP = DEFERRED_PROVIDER · API_ACCESS = COMING_SOON · AI/VOICE = غير مسوّقة.

## 20. FINAL RECOMMENDATION
أوصي بمسار تطوّري لا ثوري: الإبقاء على `platform_plans` كجدول الكتالوج وعلى تريجرات الحدود كمكان الفرض، وإضافة طبقة `plan_versions + plan_entitlements + org_plan_overrides` بوصفها مصدر الحقيقة الوحيد للقدرات والحدود، مع تثبيت شروط العملاء الحاليين على إصدارهم. هذا يمنح كتالوجاً تجارياً يُدار من اللوحة، وحمايةً كاملة للمشتركين الحاليين، وجهوزية Moyasar عبر نقطة ربط واحدة — دون كسر أي وظيفة إنتاجية قائمة.

SUBSCRIPTION_DESIGN_BASELINE_READY
IMPLEMENTATION_DEFERRED_UNTIL_FEATURE_READY
USER_APPROVAL_REQUIRED