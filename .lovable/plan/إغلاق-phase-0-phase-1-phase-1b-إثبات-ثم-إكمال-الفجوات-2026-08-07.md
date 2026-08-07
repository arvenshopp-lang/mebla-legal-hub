# إغلاق Phase 0 + Phase 1 + Phase 1B — إثبات ثم إكمال الفجوات

لا لمس للوحة الإدارة أو القائمة الجانبية في هذه الخطة.

## أ. ما ثبت فعلياً الآن (قراءة مباشرة من قاعدة البيانات والكود)

| البند | النتيجة المُقاسة |
|---|---|
| عدد المكاتب | 21 |
| مكاتب بلا اشتراك | 0 (كانت 15) |
| مكاتب بأكثر من اشتراك حيّ | 0 |
| إجمالي صفوف الاشتراكات | 23 (15 مُرحّل + 8 قائمة) |
| سجل تاريخي محفوظ | 2 اشتراك ملغى، ولم يُحذف أو يُعدّل أي صف قديم |
| المكتبان «المكرران» | ليسا خللاً: كل منهما صف ملغى + صف حيّ واحد (basic→professional، professional→enterprise)، أي تاريخ ترقية سليم — لم يُتخذ أي إجراء عليهما |
| القيد الجديد | `subscriptions_one_live_per_org` — Partial Unique Index على `organization_id` بشرط `status IN ('active','trial') AND cancelled_at IS NULL` |
| الحالات الاستحقاقية | `active` و`trial` فقط؛ `cancelled` و`expired` مستثناة فيبقى السجل التاريخي مسموحاً |
| مصدر الحقيقة | موحّد فعلاً: `my_subscription_overview` للعرض، `hasFeature` للفحص، `assertEntitlement` للحماية الخادمية |
| منطق باقات متفرق | لا يوجد أي `plan === "enterprise"` أو فحص `plan_id` لتقرير ميزة. الاستثناء الوحيد: `src/lib/support/sla.server.ts:153` يطابق `plan_code` لاختيار سياسة SLA — سياسة تشغيلية لا استحقاق، تبقى وتُوثّق |
| Cache | لا يوجد Cache خادمي. يوجد Cache متصفح واحد: React Query بمفتاح `["subscription-overview", orgId]` و`staleTime = 60s` |
| منح anon | لا سياسة RLS تخص `anon` إلا 3 جداول: `platform_plans`, `platform_settings`, `platform_content_pages`. ومع ذلك `anon` يملك SELECT/INSERT/UPDATE/DELETE على بقية جداول `public` — منح زائد بالكامل |
| جداول البريد/الدعم | 35 جدولاً بـ RLS مفعّلة وصفر سياسات؛ 28 منها يملك `authenticated` و`anon` صلاحيات عليها، والوصول الفعلي كله عبر `supabaseAdmin` (تأكدنا من `email.functions.ts` و`support/ctx.server.ts`) |

## ب. الفجوات المكتشفة والتي يجب إغلاقها قبل Phase 2

1. **القيد الجديد يصطدم بمسارات الإدارة القائمة**
   - `activateSubscription` يلغي الاشتراك السابق بـ `user_id` فقط لا `organization_id`؛ لو كان الاشتراك الحيّ للمكتب باسم مالك آخر سيرفض القيد الإدخال وتظهر «تعذّر إنشاء الاشتراك» بلا سبب واضح.
   - `extendSubscription` و`setSubscriptionStatus` يمكنهما إحياء صف قديم (`status='active'`, `cancelled_at=null`) بينما يوجد صف حيّ → خطأ قاعدة بيانات خام.
2. **`client_upload_enabled` غير مُطبَّق خادمياً**: `createDocumentRequest` لا يمرّ على `assertEntitlement`، فبإمكان مكتب على باقة غير مسموحة إنشاء روابط رفع.
3. **منح `anon` واسعة** على كل جداول المستأجرين (قضايا، عملاء، مستندات، بريد، مالية) — RLS تحجب فعلياً لكن الطبقة الثانية غائبة.
4. **جداول خادمية بمنح زائدة** لـ`authenticated`/`anon` (بريد + دعم بصفر سياسات).
5. **سجل SECURITY DEFINER ناقص**: `admin_activity_overview`, `admin_growth_series`, `admin_jobs_overview`, `admin_service_health`, `recalc_invoice` غير مُدرجة في `scripts/security-guardrails.sql` ولا في `docs/security-guardrails.md`.
6. **`type Db = any`** في `src/lib/email/workspace.server.ts` (يمسّ ~10 دوال).

## ج. خطة التنفيذ

### 1) اتساق مسارات الاشتراك مع القيد الجديد (كود فقط)
- في `src/lib/admin.functions.ts`: جعل «الاستبدال» يعتمد `organization_id` عند توفره (مع `user_id` كاحتياط للاشتراكات بلا مكتب)، وترتيب العملية: إلغاء الحيّ ثم الإدخال.
- فحص مسبق في `extendSubscription` و`setSubscriptionStatus`: إن وُجد اشتراك حيّ آخر لنفس المكتب تُعاد رسالة عربية واضحة («يوجد اشتراك نشط لهذا المكتب، ألغِه أولاً») بدل خطأ قاعدة البيانات.
- ترجمة خطأ التفرد (`23505`) إلى الرسالة نفسها في `translateSubscriptionError`.

### 2) إغلاق بوابة `client_upload`
- إضافة `assertEntitlement(..., { feature: "client_upload_enabled", requireLive: true })` إلى `createDocumentRequest` برسالة عربية عند المنع.
- في الواجهة: تعطيل زر «طلب مستندات» مع سبب واضح على الباقات غير المسموحة (بدون إعادة تصميم).

### 3) سحب منح `anon` الزائدة (Migration)
- `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;` ثم إعادة `GRANT SELECT` على الثلاثة فقط: `platform_plans`, `platform_settings`, `platform_content_pages`.
- `authenticated` يملك منحاً مباشرة مستقلة عن `anon` فلا يتأثر.
- المسارات العامة تعمل عبر Server Functions بمفتاح الخدمة أو التوكن ولا تقرأ جدولاً كـ`anon`: المسارات العامة الوحيدة التي تستخدم عميل المتصفح هي `onboarding` (RPC لمستخدم موثّق) و`upload.$token` (رفع Storage فقط) و`register` (Auth).

### 4) سحب منح الجداول الخادمية (Migration)
- `REVOKE ALL ... FROM anon, authenticated` على جداول البريد (12) وجداول الدعم ذات صفر سياسات (14) — بلا سياسات صورية.
- الإبقاء على `service_role`. `support_tickets` و`support_ticket_messages` لهما سياسات حقيقية ولا تُمَس.

### 5) إكمال سجل SECURITY DEFINER
- إضافة الخمس دوال إلى `allowed_authenticated_rpc` في `scripts/security-guardrails.sql` وإلى جدول التوثيق في `docs/security-guardrails.md` مع سبب السماح (كلها تتحقق من `platform_staff` داخلياً) — بدون تعديل أجسام الدوال.

### 6) `type Db = any`
- استبداله بنوع مبني على `SupabaseClient<Database>`. إن ظهر أنه يتطلب Refactor واسع لأنواع الـJoins، يُوقف ويُسجَّل صريحاً كبند Phase 4 في الوثائق.

## د. الاختبارات الفعلية قبل التقرير
- محاولة إدخال اشتراك حيّ ثانٍ لنفس المكتب → رفض قاعدة البيانات (`23505`) ورسالة عربية في الواجهة.
- إنشاء مكتب فعلي بحساب QA: مكتب + عضوية مالك + اشتراك واحد + استحقاقات + إكمال Onboarding، والتأكد أن الفشل داخل الدالة يُرجِع المعاملة كاملة (الدالة كتلة واحدة، فلا مكتب نصف مكتمل).
- دورة الباقات: Free → Paid، Paid → Free، إلغاء، إعادة تفعيل، ترقيتان متزامنتان، اشتراك مكرر.
- `client_upload` على باقة مسموحة وأخرى غير مسموحة.
- تطابق لوحة المكتب مع الدوال الخادمية بعد تغيير الباقة، وتوثيق نافذة الـ60 ثانية لـCache المتصفح مع إبطالها فوراً بعد الترقية/الإلغاء من داخل التطبيق.
- Regression: التسجيل، Onboarding، لوحة المكتب، إدارة الاشتراكات، متابعة القضية، رفع مستندات العميل، قراءات المركز المالي.
- الفحوص: `security:check`، `security:db`، Type Check، ESLint، Production Build.

## هـ. المخرجات
- تقرير واحد بعنوان **PHASE 0 + PHASE 1 + PHASE 1B CLOSURE REPORT** بأرقام قبل/بعد ونتائج كل اختبار، وأي استثناء موثّق (SLA بـ`plan_code`، وأي بند مُرحّل إلى Phase 4).
- ثم توقف كامل، بلا أي عمل في Dashboard أو Sidebar.

## ملاحظات تقنية
- Migrations مطلوبة: (1) سحب منح `anon` وإعادة الثلاثة، (2) سحب منح الجداول الخادمية. لا تغيير على أي سياسة RLS مستقرة.
- قيد تقني معروف: predicate الفهرس لا يستطيع استخدام `now()`، لذا صف `active` منتهي التاريخ يبقى داخل الفهرس؛ لذلك يجب أن يمر التجديد دائماً بمسار «إلغاء الحيّ ثم إنشاء الجديد» (بند ج-1) بدل إدخال صف موازٍ.