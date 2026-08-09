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
- نموذج النشر: صف واحد لكل مكتب بحقلي محتوى: `draft` و`published` (JSONB) + `status: draft|published|unpublished` + `suspended_by_platform`. النشر = نسخ draft إلى published (Snapshot) — أبسط نموذج آمن يعطي معاينة حقيقية.
- الحد الفاصل العام: الزائر لا يقرأ أي جدول تشغيلي. القراءة العامة تمر بـ **دالة خادمية واحدة** تعيد `published` فقط لصف منشور غير موقوف، بحقول من مخطط Zod للعرض العام.

## 3) تغييرات البيانات (NEW)
جدول `office_public_pages` (صف واحد لكل `organization_id`، PK = organization_id):
- `slug` (unique, lowercase)، `status`، `suspended_by_platform`، `suspension_reason`
- `draft jsonb`, `published jsonb`, `published_at`, `published_by`, `version`
- `lead_form jsonb` (الحقول المطلوبة، رسالة الشكر، تفعيل الإقرار)، `seo jsonb`، `created_at/updated_at`
جدول `office_leads` (NEW — لا بديل قائم):
- `organization_id`, `full_name`, `phone`, `email`, `city`, `service_key`, `message`, `preferred_contact`, `consent_at`
- `status` (new|contacted|qualified|unqualified|converted|archived)، `assigned_to`, `internal_note`
- `source` (office_page)، `channel` (instagram|tiktok|x|google|qr|direct|campaign)، `utm jsonb`، `referrer_host`
- `converted_client_id` (FK → clients, ON DELETE SET NULL)، `dedupe_hash`، `ip_hash`، `created_at`
جدول `office_page_events` (NEW، مجمَّع بلا هوية): `organization_id, day, kind (view|whatsapp|call|email|map|lead|service_click), channel, count` بمفتاح فريد مركّب + upsert. لا تخزين IP ولا user agent.
- خدمات المكتب: **قائمة ثابتة مشتركة** في `src/lib/office-page.shared.ts` (لا يوجد Taxonomy قائم للتخصصات في المخطط) + خدمات مخصصة نصية داخل `draft`.
- فهارس: `office_public_pages(slug) unique`, `office_leads(organization_id, created_at desc)`, `office_leads(organization_id, dedupe_hash)`, حدث تجميعي unique.
- GRANT: `authenticated` + `service_role` فقط على الجدولين الأولين والثالث (لا `anon` إطلاقاً؛ القراءة العامة عبر `supabaseAdmin` داخل دالة خادمية).

## 4) RLS وعزل المستأجرين
- كل الجداول: RLS مفعّل، السياسات تعتمد `organization_members` النشطة للمستخدم فقط → ORG_A لا تقرأ/تعدل صف ORG_B ولا مسوداتها ولا عملاءها المحتملين.
- الكتابة/النشر: عبر دوال خادمية `requireSupabaseAuth` تحلّ `organization_id` من عضوية المستخدم، ولا تقبله من الإدخال أبداً.
- الزائر العام: لا صلاحية `anon` على أي جدول؛ الحقول العامة تأتي من `published` بعد تصفية Zod.

## 5) دوال الخادم (REUSE أنماط قائمة)
`src/lib/office-page.functions.ts`: `getOfficePageAdmin`, `saveOfficePageDraft`, `checkSlug`, `publishOfficePage`, `unpublishOfficePage`, `listOfficeLeads`, `updateOfficeLead`, `convertLeadToClient`, `getOfficePageMetrics` — كلها بـ `requireSupabaseAuth` + تحقق دور.
`src/lib/office-page.public.server.ts`: `readPublishedOfficePage(slug)` عبر `supabaseAdmin` بإرجاع Projection صريح.
مسار عام للنموذج: `src/routes/api/public/office/lead.ts` (POST) — التحقق بـ Zod، حد حجم 8KB، حد معدل بالـ IP hash + slug (نمط `case_lookup_attempts`)، dedupe بـ hash(slug+phone+message) خلال 10 دقائق، تنظيف النص ومنع أي HTML، ثم إدراج + حدث إشعار.

## 6) الصلاحيات (REUSE)
- `owner/admin` (`canManage`): تعديل، النشر/الإلغاء، تغيير slug، إعدادات النموذج وSEO، ظهور الفريق، عرض التحليلات.
- `lawyer/legal_assistant`: قراءة العملاء المحتملين والعمل عليهم فقط (بدون نشر/slug). `viewer`: قراءة فقط.
- ظهور عضو الفريق **Opt-in** بموافقة الإدارة + حقول عامة صريحة (اسم، مسمى، صورة، نبذة، تخصصات) مأخوذة يدوياً إلى `draft`، لا سحب تلقائي من `profiles`.

## 7) التخزين
مستودع عام جديد `office-public-media` (NEW، public=true) للشعار/الغلاف/صور الفريق فقط، بمسار `{organization_id}/...`، سياسات كتابة/حذف على `storage.objects` لأعضاء المكتب فقط. تحقق: MIME + Magic bytes + ≤2MB + امتدادات (jpg/png/webp) + اسم ملف مولّد. مستودع `documents` يبقى خاصاً بلا أي تغيير.

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
