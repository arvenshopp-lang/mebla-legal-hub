# MEHLA FEATURE 01 — الصفحة العامة لمكتب المحاماة (Public Office Profile)

## 1) ما تم فحصه فعلياً في المستودع
- `organizations`: (name, legal_name, commercial_registration, tax_number, phone, email, city, address, logo_url, is_active, suspended_at) — بيانات إدارية/داخلية، لا حقول تسويقية ولا slug.
- `organization_members` + `app_role` (owner, admin, lawyer, legal_assistant, viewer) و`canManage`/`canEdit` في `src/hooks/use-auth.tsx` = نموذج RBAC للمكتب. **يُعاد استخدامه.**
- `crm_leads` **لا تحتوي `organization_id`** ومالكها `owner_staff_id` (`platform_staff`) → هذا CRM لمنصة مِهلة نفسها، وليس CRM للمكاتب. لا يمكن حقن عملاء المكتب المحتملين فيه.
- نمط عام آمن قائم: `src/lib/client-portal.server.ts` (توكن + `supabaseAdmin` داخل الخادم فقط)، و`public-site.server.ts` (مفتاح publishable + RLS `is_public`) — **يُعاد استخدام النمط**.
- التخزين: مستودعان فقط `documents` و`email-attachments`، كلاهما خاص. لا مستودع تسويقي.
- التحليلات: `src/lib/product-analytics/contract.ts` بقائمة أحداث/خصائص مغلقة + موافقة صريحة. **يُمدَّد بحذر.**
- الإشعارات: `notification_events`/`notification_queue` + `materializeDueEvents`. البريد: Hostinger عبر `src/lib/email/*`. التدقيق: `activity_logs` (+`actor_name/actor_email`).
- النطاقات: `src/config/surfaces.ts` + `surface-guard.server.ts`؛ `www` يسمح حالياً بـ `/`, `/privacy`, `/terms` فقط.
- الاشتراك: `platform_plans` بأعلام ميزات (`ai_enabled`…) و`hasFeature` في `subscription.shared.ts`.
- `sitemap.xml` ثابت الآن، و`platform_content_pages` نموذج نشر جاهز للاقتباس (is_published/version).

## 2) قرارات معمارية أساسية
- الرابط: `mehlalex.com/office/{slug}` ويُضاف `/office` إلى مسارات نطاق `www` في `surfaces.ts` (EXTEND). لا نطاق فرعي جديد.
- Slug لاتيني فقط (a-z0-9-، 3–40 حرفاً)، مع اقتراح تلقائي من الاسم العربي عبر ترجمة صوتية + قائمة أسماء محجوزة (app, api, docs, admin, mehla-admin, office, login…). التحقق على الخادم فقط.
- نموذج النشر: صف واحد لكل مكتب بحقلي محتوى **شاملين**: `draft` و`published` (JSONB) + `status: draft|published|unpublished` + `suspended_by_platform`. النشر = نسخ draft إلى published (Snapshot).
- **قاعدة اللقطة الكاملة (تصحيح 1)**: كل إعداد ظاهر للعامة يقع داخل اللقطة نفسها — الهوية والوسائط والخدمات والتواصل وساعات العمل والروابط و**ظهور الفريق** و**إعداد نموذج العملاء المحتملين** و**SEO** و`consent_policy_version`. لا توجد أعمدة إعدادات عامة منفصلة، فلا يمكن لأي تعديل غير منشور أن يغيّر الصفحة المنشورة. يبقى خارج اللقطة فقط: `slug`, `status`, `suspended_by_platform`, `version`, `published_at/by`, والطوابع الزمنية.
- الحد الفاصل العام: الزائر لا يقرأ أي جدول تشغيلي. القراءة العامة تمر بـ **دالة خادمية واحدة** تعيد `published` فقط لصف منشور غير موقوف **ولمكتب نشط ومستحق**، بحقول من مخطط Zod للعرض العام.

## 3) تغييرات البيانات (NEW)
جدول `office_public_pages` (صف واحد لكل `organization_id`، PK = organization_id):
- `slug` (unique, lowercase)، `status`، `suspended_by_platform`، `suspension_reason`
- `draft jsonb`, `published jsonb`, `published_at`, `published_by`, `version`, `created_at/updated_at`
- **لا** أعمدة `lead_form`/`seo` مستقلة: كلاهما مفاتيح داخل `draft`/`published` (تصحيح 1).
جدول `office_leads` (NEW — لا بديل قائم):
- `organization_id`, `full_name`, `phone`, `email`, `city`, `service_key`, `message`, `preferred_contact`
- إثبات الإقرار (تصحيح 7): `consent_at`, `consent_policy_version` (نسخة صفحة الخصوصية من `platform_content_pages`)، `consent_document_key`, `consent_text_hash` (SHA-256 لنص الإقرار المعروض)، `page_version` (نسخة اللقطة المنشورة وقت الإرسال). الإرسال بلا إقرار صالح يُرفض عند تفعيل الإقرار.
- `status` (new|contacted|qualified|unqualified|converted|archived)، `assigned_to`, `internal_note`
- `source` (office_page)، `channel` (instagram|tiktok|x|google|qr|direct|campaign)، `utm jsonb`، `referrer_host`
- `converted_client_id` (FK → clients, ON DELETE SET NULL)، `dedupe_hash`، `dedupe_window` (عمود مُولَّد: نافذة 10 دقائق)، `ip_hash`، `created_at`
- **منع التكرار الذرّي (تصحيح 4)**: فهرس **فريد** `unique(organization_id, dedupe_hash, dedupe_window)` حيث `dedupe_hash = sha256(slug|phone|email|message)` و`dedupe_window = to_timestamp(floor(extract(epoch from created_at)/600)*600)` كعمود مُولَّد ثابت. الخادم ينفّذ `INSERT ... ON CONFLICT DO NOTHING RETURNING id`؛ عند عدم الإرجاع يقرأ الصف القائم ويعيد نفس نتيجة النجاح (Idempotent). يغطي هذا النقر المزدوج والطلبات المتزامنة وإعادة المحاولة بدون أي اعتماد على حالة العميل، ويمنع تكرار حدث الإشعار بنفس المعرف.
جدول `office_page_events` (NEW، مجمَّع بلا هوية): `organization_id, day, kind (view|whatsapp|call|email|map|lead|service_click), channel, count` بمفتاح فريد مركّب. لا تخزين IP ولا user agent.
- **عدّادات ذرّية (تصحيح 5)**: كل حدث = عبارة SQL واحدة `INSERT ... ON CONFLICT (organization_id, day, kind, channel) DO UPDATE SET count = office_page_events.count + 1` عبر دالة `public.bump_office_page_event(...)` (SECURITY DEFINER, `search_path=public`, تُنفَّذ من الخادم فقط). لا قراءة-ثم-كتابة في كود التطبيق، فلا تُفقد أي زيادة تحت التزامن.
- خدمات المكتب: **قائمة ثابتة مشتركة** في `src/lib/office-page.shared.ts` (لا يوجد Taxonomy قائم للتخصصات في المخطط) + خدمات مخصصة نصية داخل `draft`.
- فهارس: `office_public_pages(slug) unique`, `office_leads(organization_id, created_at desc)`, **`office_leads(organization_id, dedupe_hash, dedupe_window) unique`**, حدث تجميعي unique.
- GRANT: `authenticated` + `service_role` فقط على الجدولين الأولين والثالث (لا `anon` إطلاقاً؛ القراءة العامة عبر `supabaseAdmin` داخل دالة خادمية).

## 4) RLS وعزل المستأجرين
- كل الجداول: RLS مفعّل، السياسات تعتمد `organization_members` النشطة للمستخدم فقط → ORG_A لا تقرأ/تعدل صف ORG_B ولا مسوداتها ولا عملاءها المحتملين.
- الكتابة/النشر: عبر دوال خادمية `requireSupabaseAuth` تحلّ `organization_id` من عضوية المستخدم، ولا تقبله من الإدخال أبداً.
- الزائر العام: لا صلاحية `anon` على أي جدول؛ الحقول العامة تأتي من `published` بعد تصفية Zod.

## 5) دوال الخادم (REUSE أنماط قائمة)
`src/lib/office-page.functions.ts`: `getOfficePageAdmin`, `saveOfficePageDraft`, `checkSlug`, `publishOfficePage`, `unpublishOfficePage`, `listOfficeLeads`, `updateOfficeLead`, `convertLeadToClient`, `getOfficePageMetrics` — كلها بـ `requireSupabaseAuth` + تحقق دور.
`src/lib/office-page.public.server.ts`: `readPublishedOfficePage(slug)` عبر `supabaseAdmin` بإرجاع Projection صريح من `published` فقط.
- **بوابة حالة المكتب والاستحقاق (تصحيح 6)**: قبل أي إرجاع تتحقق الدالة خادمياً من: `status='published'` و`suspended_by_platform=false` و`organizations.is_active=true` و`suspended_at IS NULL` و**استحقاق الخطة الحالي** (`public_office_page` في خطة الاشتراك النشط) و`subscriptions.status` ضمن (active, trial). أي إخفاق ⇒ إرجاع `null` ⇒ المسار العام يرمي `notFound()` مع `noindex` ورسالة عربية «هذه الصفحة غير متاحة حالياً»، ويُستثنى المكتب من `sitemap.xml`. لا يوجد مسار جانبي يتجاوز هذه البوابة (الرابط المباشر أو الكاش القصير لا يُتيح الوصول؛ `Cache-Control` عام ≤60 ثانية + `must-revalidate`).
- **معاينة المسودة بالجلسة (تصحيح 3)**: لا يوجد `?preview=<token>` ولا أي سر في سلسلة الاستعلام. المعاينة مسار مصادَق داخل `_authenticated` على نطاق `app`: `src/routes/_authenticated/settings.office-page.preview.tsx` يستدعي `getOfficePageDraftPreview` (`requireSupabaseAuth` + تحقق عضوية المكتب + دور قارئ على الأقل) ويعرض نفس مكونات الصفحة العامة ببيانات `draft`. يُحقن `X-Robots-Tag: noindex` و`Cache-Control: no-store`. زائر غير مصادَق أو عضو مكتب آخر ⇒ 401/403 ولا يحصل على أي جزء من المسودة. لا يُقدَّم أي محتوى مسودة عبر `/office/$slug` مطلقاً.
مسار عام للنموذج: `src/routes/api/public/office/lead.ts` (POST) — التحقق بـ Zod، حد حجم 8KB، حد معدل بالـ IP hash + slug (نمط `case_lookup_attempts`)، **منع تكرار ذرّي بالفهرس الفريد أعلاه (لا فحص-ثم-إدراج)**، التحقق من نفس بوابة الحالة/الاستحقاق قبل القبول، تسجيل إثبات الإقرار، تنظيف النص ومنع أي HTML، ثم إدراج + حدث إشعار بمفتاح Idempotency = معرف العميل المحتمل.
- **رفع الوسائط عبر الخادم (تصحيح 8)**: `uploadOfficeMedia` دالة خادمية مصادَقة هي المسار الوحيد للرفع (لا رفع مباشر من المتصفح إلى المستودع). تتحقق قبل التخزين من: الحجم ≤2MB، الامتداد ضمن (jpg/jpeg/png/webp)، MIME المعلن، **Magic bytes** الفعلية، وأبعاد معقولة، مع اسم ملف مُولَّد. تُجرَّد بيانات JPEG الوصفية (APP1/EXIF وGPS وباقي مقاطع APPn) بجافاسكربت خالص عند الاستقبال، وتُزال مقاطع PNG النصية/`eXIf`. لا تعتمد أي خطوة على مكتبات أصلية (بيئة Worker)، ولا يصبح أي ملف عاماً قبل اجتياز هذا التحقق.

## 6) الصلاحيات (REUSE)
- `owner/admin` (`canManage`): تعديل، النشر/الإلغاء، تغيير slug، إعدادات النموذج وSEO، ظهور الفريق، عرض التحليلات.
- `lawyer/legal_assistant`: قراءة العملاء المحتملين والعمل عليهم فقط (بدون نشر/slug). `viewer`: قراءة فقط.
- ظهور عضو الفريق **Opt-in** بموافقة الإدارة + حقول عامة صريحة (اسم، مسمى، صورة، نبذة، تخصصات) مأخوذة يدوياً إلى `draft`، لا سحب تلقائي من `profiles`.

## 7) التخزين
**دورة حياة وسائط بمرحلتين (تصحيح 2)** — مستودعان جديدان فقط، ولا مساس بمستودعي `documents` و`email-attachments`:
1. `office-media-draft` (NEW، **private**): كل رفع جديد يهبط هنا بمسار `{organization_id}/draft/...`. لا وصول عام إطلاقاً؛ الإدارة والمعاينة تعرضه بروابط موقّعة قصيرة (≤5 دقائق) تُولَّد داخل دالة خادمية بعد تحقق العضوية. سياسات `storage.objects`: قراءة/كتابة/حذف لأعضاء المكتب فقط.
2. `office-public-media` (NEW، public=true): **يكتب إليه الخادم وقت النشر فقط**. `publishOfficePage` ينسخ الملفات المرجعية من المسودة إلى `{organization_id}/v{version}/...` ويكتب المسارات النهائية داخل لقطة `published`. الإلغاء (`unpublishOfficePage`) وإعادة النشر يحذفان ملفات النسخ غير المرجعية. لا اعتماد على «رابط غير متوقع» كتصريح: الخصوصية مضمونة بخصوصية المستودع نفسه، والعام يحتوي فقط ما نُشر صراحةً.

## 8) الإشعارات والبريد والتدقيق
- حدث `office_lead.created` يُدرج في `notification_events` (EXTEND للقائمة) → داخل التطبيق + بريد Hostinger عبر الطابور القائم مع Idempotency key = معرف العميل المحتمل. لا SMS/WhatsApp مبرمج هنا.
- إقرار للزائر بالبريد: اختياري (Off افتراضياً) لتفادي إساءة الاستخدام.
- التدقيق (`activity_logs`، REUSE): `office_page.updated/published/unpublished/slug_changed/team_visibility_changed/lead_form_changed/seo_changed/suspended` و`office_lead.converted`. لا تُسجّل مشاهدات الزوار في التدقيق.

## 9) التحليلات وSEO
- PostHog: إضافة أحداث مغلقة `office_page_viewed`, `office_page_cta_clicked`, `office_lead_submitted` + خصائص مغلقة (`cta_kind`, `channel`) ضمن نفس عقد التنقية والموافقة.
- المقاييس المعروضة داخل مِهلة تُقرأ من `office_page_events` المجمَّع (يعمل بدون موافقة الزائر وبدون بيانات شخصية).
- SEO: `head()` في مسار `/office/$slug` بعنوان ووصف من `seo` أو مشتق آمن، og/twitter + صورة الغلاف بروابط https مطلقة، canonical ذاتي، `noindex` عند عدم النشر/الإيقاف، وإدراج المكاتب المنشورة في `sitemap.xml` (EXTEND). لا HTML حر.

## 10) الواجهات
- عام: `src/routes/office.$slug.tsx` (NEW) + مكونات `src/components/office-page/*` (Hero، خدمات، فريق، ساعات، أزرار CTA، نموذج، تذييل) — RTL أولاً، بنية Tokens الحالية فقط بلا هوية بصرية نهائية.
- إدارة المكتب: تبويب جديد «الصفحة العامة» داخل `/settings` (EXTEND، بدون إعادة تصميم بقية التبويبات) بأقسام: عام، الهوية، التواصل، الخدمات، الفريق، الروابط، النموذج، SEO، التحليلات، النشر + معاينة داخل iframe بأحجام Desktop/Tablet/Mobile (نمط `design.tsx` المعاين REUSE) عبر `?preview=<token جلسة قصيرة>` يتحقق خادمياً.
- العملاء المحتملون: قسم داخل نفس التبويب مع تحويل صريح إلى `clients` (لا تحويل تلقائي).
- لوحة مالك المنصة: بطاقة في `/mehla-admin/organizations` لعرض الحالة/الرابط/الاستخدام + إيقاف لإساءة الاستخدام (مُدقَّق، لا يحذف الإعداد).

## 11) الاستحقاق والأداء والفشل
- مفتاح `public_office_page` يُضاف كعلم خطة (EXTEND `platform_plans` + `PlanFeatureKey`) مع تفعيله لكل الخطط في v1 (بلا تسعير) والتحقق خادمياً عند النشر.
- الأداء: استعلام عام واحد بالـ slug على فهرس فريد، `Cache-Control` قصير للصفحة العامة، صور محسّنة و`loading=lazy`، كتابة تحليلات مجمّعة (upsert يومي) وحد معدل على النموذج.
- رسائل عربية واضحة لكل فشل: slug محجوز/مستخدم، رابط اجتماعي غير صالح، جوال غير صالح، فشل الرفع، نقص حقول عند النشر، صفحة موقوفة/غير منشورة، تجاوز حد الإرسال، إرسال مكرر، تعذّر التحليلات — بلا أي خطأ خام.

## 12) الترحيل والمخاطر ومصفوفة القبول
- ترحيل واحد: الجداول الثلاثة + GRANT + RLS + الفهارس + المستودع العام + توسيع أنواع أحداث الإشعارات. لا تعديل مدمّر على جداول قائمة.
- المخاطر: تسريب حقول غير منشورة (يُغطى بـ Projection صريح)، إساءة استخدام النموذج (حد معدل + dedupe)، الالتباس بين CRM المنصة وعملاء المكتب (جدول منفصل)، خلط ملكية الوسائط (مسار بـ organization_id).
- مصفوفة قبول لاحقة تغطي: مسودة/معاينة/نشر/وصول عام/إلغاء/إعادة نشر، تفرد وأمن slug، أزرار التواصل، الخدمات، ظهور الفريق، الوسائط، SEO والمشاركة الاجتماعية، QR، إرسال العميل المحتمل وربطه وتحويله، الإشعارات والبريد، أحداث التحليلات وUTM، 320/390/768/1024/1440، RBAC وRLS وعزل المستأجرين، عزل الحقول العامة/الخاصة، حد المعدل، XSS، أمن الرفع، التدقيق، الاستحقاق، التزامن، والتراجع — مع اختبارات صريحة: ORG_A لا تعدّل/تقرأ ORG_B، الزائر لا يصل للمسودة ولا للعملاء/القضايا/المستندات، حمولة خبيثة مرفوضة، تكرار سريع مضبوط، صفحة موقوفة لا تُتجاوز بالرابط.
- QR: يُولَّد في الواجهة من الرابط العام (`qrcode` كحزمة خفيفة) وتنزيل PNG/SVG — بلا أي بنية تحتية أو جدول.
- تبعيات يدوية: لا شيء خارجي مطلوب لـ v1 (البريد والتحليلات مربوطان مسبقاً).
