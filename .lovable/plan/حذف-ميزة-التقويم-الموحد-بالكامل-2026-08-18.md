# حذف ميزة «التقويم الموحد» بالكامل

الهدف: إزالة الميزة نهائياً (الصفحة + المزامنة مع Google/Outlook + تغذية ICS) دون المساس بالجلسات أو المهل أو المهام أو تخزين الملفات (Drive/OneDrive).

## ما سيُحذف

ملفات تُحذف كاملة:
- `src/routes/_authenticated/calendar.tsx` (صفحة التقويم الموحد)
- `src/routes/api/public/calendar/feed.$token.ts` (تغذية ICS العامة)
- `src/routes/api/integrations/google/callback.ts` و`src/routes/api/integrations/microsoft/callback.ts` (هذان المساران خاصان بمزامنة التقويم فقط؛ ربط Google Drive/OneDrive للملفات له مساراته المستقلة ويبقى كما هو)
- مجلد `src/lib/calendar/` بالكامل: `calendar.functions.ts`, `calendar.server.ts`, `calendar.shared.ts`, `google-calendar.server.ts`, `outlook-calendar.server.ts`, `ics-engine.server.ts`, `http.server.ts`

مراجع تُنظَّف:
- `src/components/app/nav.ts`: إزالة عنصر «التقويم الموحد» من مجموعة «العمل اليومي»
- `src/routes/_authenticated/dashboard.tsx`: إزالة بطاقة «التقويم الموحد» من الإجراءات السريعة (مع إزالة أي أيقونة صارت غير مستخدمة)
- `src/lib/design/pages.ts`: حذف مدخل صفحة `calendar` من Design Studio، ونقل مسارَي `/hearings` و`/deadlines` إلى مدخل قائم بذاته حتى لا يفقدا معاينة التصميم
- `src/config/surfaces.ts`: حذف سطح `calendar` المحجوز ونوعه من `SurfaceId`
- `docs/subdomain-architecture.md` و`docs/technical-architecture.md`: تحديث الذكر ليعكس إزالة الميزة

ما لا يُلمس:
- صفحات الجلسات والمهل والمهام وبياناتها
- `src/components/ui/calendar.tsx` (منتقي التاريخ المشترك) وأيقونات lucide في صفحات أخرى
- `src/lib/storage/googledrive.server.ts` و`onedrive.server.ts` — يبقى fallback متغيرات `GOOGLE_CALENDAR_CLIENT_ID/SECRET` كما هي حتى لا ينكسر ربط التخزين القائم

## قاعدة البيانات والأسرار
لا Migration مطلوب: الميزة لم تُخزّن في أي جدول (الإعدادات كانت في الذاكرة والأحداث تُقرأ من `hearings`/`tasks`). متغيرات بيئة مزوّدي التقويم تبقى موجودة دون استخدام (يمكن حذفها لاحقاً بطلب منفصل بعد التأكد من عدم استخدامها في التخزين).

## التحقق
- إعادة توليد شجرة المسارات (لا يوجد `/calendar` ولا `/api/public/calendar/*`)
- Type Check وESLint وProduction Build ناجح
- فتح `/dashboard` والتنقل: لا رابط مكسور، والجلسات والمهل تعمل كما هي
- تشغيل حرّاس المشروع ذات الصلة (`security:check` / guardrails) للتأكد من عدم كسر أي فحص
