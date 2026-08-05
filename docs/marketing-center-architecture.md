# معمارية مركز التسويق (Marketing Center)

## الهدف والنطاق

مركز التسويق وحدة إدارية داخل لوحة إدارة المنصة (`/mehla-admin/marketing`) تتيح لفريق مِهلة:

- إدارة الحملات التسويقية (`marketing_campaigns`): الميزانية، الإنفاق، بيانات UTM، الربط بكوبون خصم، والمالك من طاقم المنصة.
- تسجيل أحداث التحويل (`marketing_conversion_events`) المرتبطة بحملة و/أو عميل محتمل (Lead).
- إدارة برامج الإحالة (`marketing_referrals`): رموز إحالة مرتبطة بكوبونات، بحد أقصى للاستخدام وحالة تفعيل.
- عرض حالة مزوّدي القياس والإعلانات (Google Analytics، Google Ads، Meta/TikTok/Snapchat/LinkedIn Ads) بالقراءة فقط من مركز التكاملات الحالي (`integration_definitions` و`platform_integrations`) دون إنشاء نظام تكامل موازٍ.
- عرض ملخص أداء محسوب في وقت التشغيل (Runtime) عبر مطابقة بيانات UTM للحملات مع `crm_leads` و`crm_deals`، دون تخزين هذا الملخص في جدول منفصل.

خارج النطاق: لا تنفيذ فعلي لأي حملة إعلانية خارجية، ولا سحب/دفع بيانات آلي من مزوّدي الإعلانات؛ الربط الفعلي بحسابات هذه المنصات يتم لاحقاً عبر مركز التكاملات نفسه.

## المسارات

| المسار                                                 | الوصف                                                                                          |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `src/routes/mehla-admin/marketing.tsx`                 | صفحة الواجهة: تبويبات (الحملات، أحداث التحويل، الإحالات، مزوّدو التسويق) + بطاقات ملخص الأداء. |
| `src/lib/marketing.functions.ts`                       | دوال الخادم (Server Functions) لكل عمليات القراءة/الكتابة.                                     |
| `src/lib/marketing.shared.ts`                          | الأنواع المشتركة وقيم حالة الحملة `MARKETING_CAMPAIGN_STATUS` وتسمياتها العربية.               |
| `src/components/admin/marketing/campaigns-panel.tsx`   | لوحة إدارة الحملات (قائمة، بحث، فرز، نموذج إنشاء/تعديل، حذف، تصدير).                           |
| `src/components/admin/marketing/conversions-panel.tsx` | لوحة أحداث التحويل (قائمة + تسجيل حدث جديد).                                                   |
| `src/components/admin/marketing/referrals-panel.tsx`   | لوحة برامج الإحالة (قائمة، بحث، نموذج إنشاء/تعديل).                                            |
| `src/components/admin/marketing/providers-panel.tsx`   | لوحة قراءة حالة مزوّدي القياس/الإعلانات من مركز التكاملات.                                     |

## الجداول والعلاقات

### `marketing_campaigns`

| العمود                                 | النوع                            | ملاحظات                                                                           |
| -------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------- |
| id                                     | uuid PK                          |                                                                                   |
| name                                   | text                             | فريد بعد التطبيع (`lower(btrim(name))`)                                           |
| channel                                | text                             | قيود CHECK: `email, in_app, social, search, referral, content, event, sms, other` |
| objective                              | text?                            |                                                                                   |
| status                                 | enum `marketing_campaign_status` | `draft, scheduled, running, paused, completed, cancelled`                         |
| starts_on / ends_on                    | date?                            | قيد: `ends_on >= starts_on` إن وُجدا                                              |
| budget_amount / spend_amount           | numeric(14,2)                    | قيد: `>= 0`                                                                       |
| currency                               | text                             | افتراضي `SAR`                                                                     |
| utm_source / utm_medium / utm_campaign | text?                            | فريد جزئياً على `utm_campaign` بعد التطبيع                                        |
| landing_page_slug                      | text?                            |                                                                                   |
| coupon_id                              | uuid? → `platform_coupons.id`    | ON DELETE SET NULL                                                                |
| owner_staff_id                         | uuid? → `platform_staff.id`      | ON DELETE SET NULL                                                                |
| notes                                  | text?                            |                                                                                   |
| created_by / updated_by                | uuid?                            |                                                                                   |
| created_at / updated_at                | timestamptz                      | تريغر `set_updated_at`                                                            |

### `marketing_conversion_events`

| العمود          | النوع                            | ملاحظات                      |
| --------------- | -------------------------------- | ---------------------------- |
| id              | uuid PK                          |                              |
| event_key       | text                             | قيد نمط `^[a-z0-9_.]{2,60}$` |
| label           | text?                            |                              |
| campaign_id     | uuid? → `marketing_campaigns.id` | ON DELETE SET NULL           |
| lead_id         | uuid? → `crm_leads.id`           | ON DELETE SET NULL           |
| organization_id | uuid? → `organizations.id`       | ON DELETE SET NULL           |
| value_amount    | numeric(14,2)                    | قيد: `>= 0`                  |
| utm             | jsonb                            | افتراضي `{}`                 |
| source          | text?                            |                              |
| occurred_at     | timestamptz                      | افتراضي `now()`              |
| created_at      | timestamptz                      |                              |

### `marketing_referrals`

| العمود                         | النوع                         | ملاحظات                                                       |
| ------------------------------ | ----------------------------- | ------------------------------------------------------------- |
| id                             | uuid PK                       |                                                               |
| code                           | text                          | قيد نمط `^[A-Za-z0-9_-]{3,40}$`، فريد بعد التحويل لحروف كبيرة |
| label                          | text?                         |                                                               |
| referrer_kind                  | text                          | قيد CHECK: `partner, organization, staff, influencer`         |
| referrer_name / referrer_email | text?                         |                                                               |
| coupon_id                      | uuid? → `platform_coupons.id` | ON DELETE SET NULL                                            |
| reward_note                    | text?                         |                                                               |
| is_active                      | boolean                       | افتراضي true                                                  |
| uses_count                     | integer                       | افتراضي 0، قيد `>= 0`                                         |
| max_uses                       | integer?                      | قيد: إن وُجد فيجب `> 0`                                       |
| created_by                     | uuid?                         |                                                               |
| created_at / updated_at        | timestamptz                   | تريغر `set_updated_at`                                        |

### علاقات القراءة الإضافية (بدون FK صريح على مستوى منطق التطبيق)

- ملخص الأداء (`getMarketingPerformanceSummary`) يطابق `utm_source/utm_medium/utm_campaign` للحملة مع حقل `utm` (jsonb) في `crm_leads` و`crm_deals` — مطابقة برمجية في الخادم وليست FK قاعدة بيانات.
- لوحة المزوّدين تقرأ `integration_definitions` و`platform_integrations` (المُعرَّفة والمُفعَّلة) بمفاتيح مزوّدين ثابتة: `google_analytics, google_ads, meta_ads, tiktok_ads, snapchat_ads, linkedin_ads`.

## دوال الخادم

| الدالة                           | الصلاحية المطلوبة  | Audit                                                                     |
| -------------------------------- | ------------------ | ------------------------------------------------------------------------- |
| `listMarketingCampaigns`         | `marketing.read`   | لا (قراءة)                                                                |
| `createMarketingCampaign`        | `marketing.manage` | نعم — `marketing.campaign.create`                                         |
| `updateMarketingCampaign`        | `marketing.manage` | نعم — `marketing.campaign.update` (يخزّن `before`: الحالة والميزانية فقط) |
| `deleteMarketingCampaign`        | `marketing.manage` | نعم — `marketing.campaign.delete`                                         |
| `listConversionEvents`           | `marketing.read`   | لا                                                                        |
| `createConversionEvent`          | `marketing.manage` | نعم — `marketing.conversion.create`                                       |
| `listMarketingReferrals`         | `marketing.read`   | لا                                                                        |
| `createMarketingReferral`        | `marketing.manage` | نعم — `marketing.referral.create`                                         |
| `updateMarketingReferral`        | `marketing.manage` | نعم — `marketing.referral.update`                                         |
| `listCouponsForMarketing`        | `marketing.read`   | لا                                                                        |
| `getMarketingPerformanceSummary` | `marketing.read`   | لا                                                                        |
| `listMarketingProviders`         | `marketing.read`   | لا                                                                        |
| `exportMarketingCampaigns`       | `marketing.export` | لا                                                                        |

جميع الدوال تمر عبر `requireSupabaseAuth` middleware ثم `requireStaff(supabase, userId, permission)` من `admin-guard.server.ts`، وتستخدم عميل قاعدة بيانات بصلاحيات إدارية (`admin()` → `supabaseAdmin`) بعد اجتياز التحقق من الصلاحية داخل الخادم.

## الصلاحيات

معرّفة في `src/lib/admin-permissions.ts` ضمن مجموعة «التسويق»:

- `marketing.read` — عرض الحملات ومصادر العملاء وأحداث التحويل.
- `marketing.manage` — إنشاء وتعديل الحملات وبرامج الإحالة والكوبونات المرتبطة (لا تعديل مباشر للكوبونات نفسها من هذه الوحدة، فقط ربطها).
- `marketing.export` — تصدير أداء الحملات وأحداث التحويل بصيغة CSV.

لا يوجد حذف لبرامج الإحالة أو أحداث التحويل في الكود الحالي (فقط إنشاء/تعديل/إيقاف عبر `is_active`)؛ الحذف متاح للحملات فقط عبر `deleteMarketingCampaign`.

في الواجهة، `usePlatformAdmin().can(...)` يتحكم في إظهار أزرار الإدارة (`canManage`) والتصدير (`canExport`)، لكن الحارس الفعلي هو تحقق `requireStaff` على الخادم.

## RLS

من هجرة `supabase/migrations/20260805184426_...sql`:

- الجداول الثلاثة (`marketing_campaigns`, `marketing_conversion_events`, `marketing_referrals`) مفعّل عليها `ENABLE ROW LEVEL SECURITY`.
- سياسات موحّدة تُنشأ آلياً عبر حلقة `DO $$ ... $$` لكل جدول بأربع سياسات: `_staff_read` (SELECT)، `_staff_insert`، `_staff_update`، `_staff_delete`، جميعها تستدعي الدالة `private.has_platform_permission(auth.uid(), <permission>)`.
- صلاحية القراءة لكل الجداول الثلاثة: `marketing.read`. صلاحية الكتابة (إدراج/تعديل/حذف): `marketing.manage`.
- الجداول ممنوحة بالكامل (`GRANT SELECT, INSERT, UPDATE, DELETE`) لدور `authenticated`، لكن RLS هو خط الدفاع الفعلي؛ كما أن دوال الخادم تستخدم `supabaseAdmin` (يتجاوز RLS) وتعتمد بدلاً من ذلك على `requireStaff` كخط تحقق أول قبل أي استعلام.

## دورة الحياة

**الحملة**: `draft → scheduled → running → paused/completed/cancelled` (تسلسل غير مفروض آلياً في الكود — الحالة تُحدَّث يدوياً من نموذج التعديل، ولا يوجد تحقق من انتقالات صالحة/غير صالحة بين الحالات في `updateMarketingCampaign`).

**حدث التحويل**: يُنشأ فقط، بلا تعديل أو حذف في الدوال الحالية.

**برنامج الإحالة**: يُنشأ ثم يمكن تعديله (بما فيه `is_active` للتعطيل)، لكن لا يوجد حذف؛ عدّاد `uses_count` موجود في المخطط لكن لا توجد دالة خادم تُحدّثه (لا آلية ربط استخدام فعلي للرمز ضمن الكود المفحوص).

## سجل التدقيق

كل عمليات الكتابة (إنشاء/تعديل/حذف حملة، إنشاء حدث تحويل، إنشاء/تعديل إحالة) تُسجَّل عبر `writeAudit` في جدول `admin_audit_logs` مع: `actor_email`, `action`, `entity_type`, `entity_id`, `description`, `before_data`, `after_data`, `ip`, `user_agent`. عمليات القراءة (list\*, summary, providers) لا تُسجَّل في سجل التدقيق.

## حالات الخطأ

- فشل تحقق الصلاحية: رسالة عامة "لا تملك الصلاحية اللازمة لتنفيذ هذه العملية." (من `requireStaff`).
- فشل الاستعلام في القوائم: رسائل عربية مخصصة مثل "تعذّر جلب قائمة الحملات."، "تعذّر جلب أحداث التحويل."، "تعذّر جلب برامج الإحالة."
- تحديث/حذف كيان غير موجود: "الحملة غير موجودة." / "برنامج الإحالة غير موجود."
- حذف حملة مرتبطة بأحداث تحويل (قيد FK `ON DELETE SET NULL` على `campaign_id` فعلياً يسمح بالحذف، لكن رسالة الخطأ في الكود تفترض احتمال فشل: "تعذّر حذف الحملة. تحقق من عدم وجود أحداث تحويل مرتبطة." — ملاحظة: هذا تحوّط في الكود وليس قيد قاعدة بيانات صارم يمنع الحذف، لأن `ON DELETE SET NULL` هو السلوك الفعلي المُعرَّف في المخطط).
- تكرار رمز إحالة: "رمز الإحالة مستخدم مسبقاً." (تحقق برمجي مسبق قبل الإدراج، بالإضافة إلى الفهرس الفريد `marketing_referrals_code_key` كخط دفاع ثانٍ).

## الاعتماد على خدمات خارجية

- لا اعتماد مباشر على واجهات برمجية خارجية للتنفيذ؛ التسجيل والإدارة كلها داخلية.
- لوحة «مزوّدو التسويق» تقرأ فقط حالة الربط المُخزَّنة مسبقاً في `platform_integrations`/`integration_definitions` (التي يُدار اتصالها الفعلي من مركز تكاملات منفصل خارج نطاق هذه الوحعة) — لا استدعاء API حي لمزوّدي الإعلانات من هذه الدوال.
- ملخص الأداء يعتمد على وجود بيانات `utm` متوافقة الشكل في `crm_leads`/`crm_deals`؛ أي اختلاف في تسمية الحقول (`utm_campaign` مقابل `campaign`) يُعالَج ببديل احتياطي بسيط في دالة `matches()`.

## ما تم اختباره فعلياً (فحص كود + Type Check + Build فقط)

- قراءة الكود الفعلي لكل دوال الخادم في `marketing.functions.ts` والتحقق من تطابق أسماء الصلاحيات المستخدمة مع القيم المعرَّفة في `admin-permissions.ts`.
- التحقق من أن كل مسار كتابة (`create*`, `update*`, `delete*`) يستدعي `g.writeAudit` بمعطيات `before`/`after` متسقة مع الحقول الفعلية.
- التحقق من مطابقة أعمدة الاستعلامات (`select(...)`) مع أعمدة المخطط الفعلي في `types.ts` وملف الهجرة SQL.
- التحقق من تفعيل RLS وربط سياساته بنفس أسماء الصلاحيات المستخدمة في دوال الخادم (`marketing.read` / `marketing.manage`).
- لم يُجرَ أي تعديل على الكود؛ الفحص نصي بالكامل دون تشغيل build أو lint يدوياً (يُدار تلقائياً من المنصة).

## ما ينتظر E2E

- التحقق الفعلي من سلوك RLS عبر مستخدم حقيقي بصلاحيات متفاوتة (مثال: موظف يملك `marketing.read` فقط يحاول إنشاء حملة).
- اختبار تكامل مطابقة UTM بين الحملات والعملاء المحتملين/الصفقات ببيانات حقيقية متنوعة الشكل.
- اختبار تجربة التصدير الفعلي لملف CSV من الواجهة (الزر ومسار `exportMarketingCampaigns`).
- اختبار حالات التزامن (سباق) عند تكرار كود الإحالة من عدة طلبات متزامنة رغم الفهرس الفريد.

## القيود المعروفة

- لا تحقق من صحة انتقالات حالة الحملة (يمكن الانتقال من `draft` مباشرة إلى `completed` دون قيد منطقي).
- لا آلية تلقائية لزيادة `uses_count` في برامج الإحالة عند استخدام الرمز فعلياً — الحقل موجود في المخطط لكن غير مُستهلَك من أي دالة خادم مفحوصة.
- مطابقة ملخص الأداء (UTM) تتم في كل طلب قراءة (Runtime) دون تخزين مؤقت (Cache) أو فهرسة مخصصة، وقد تتأثر بالأداء مع نمو حجم `crm_leads`/`crm_deals`.
- لا حذف لأحداث التحويل أو برامج الإحالة من الواجهة الحالية.
- ربط مزوّدي الإعلانات (Google/Meta/TikTok/…) بحسابات فعلية غير منفّذ هنا؛ اللوحة قراءة حالة فقط.

## ما هو مؤجل بالتصميم

- عدم إنشاء نظام تكامل موازٍ لمزوّدي القياس/الإعلانات؛ القرار المعماري الصريح (موثّق في تعليق أعلى `marketing.functions.ts`) هو القراءة من مركز التكاملات الحالي فقط.
- عدم تنفيذ أي استدعاء API حي أو Webhook من مزوّدي الإعلانات ضمن هذه الوحدة.
- عدم بناء محرك إحالة تلقائي (تتبّع نقرات/تحويلات الرمز) في هذه المرحلة؛ الجدول جاهز بنيوياً (`uses_count`, `max_uses`) لكن دون منطق تفعيل.
