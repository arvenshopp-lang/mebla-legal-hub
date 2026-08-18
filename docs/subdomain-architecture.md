# بنية النطاقات الفرعية الرسمية — MehlaLex

المصدر الوحيد للحقيقة: `src/config/surfaces.ts`
التطبيق على الخادم: `src/lib/surface-guard.server.ts` (مسجّل في `src/start.ts`)
التطبيق في المتصفح: `src/hooks/use-surface-guard.ts`

## الخريطة

| النطاق                | الغرض                    | المسارات المخدومة                                                                                                                                                                                                      | الجذر `/` يفتح             |
| --------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `www.mehlalex.com`    | الموقع التسويقي          | `/` فقط                                                                                                                                                                                                                | الصفحة الرئيسية            |
| `app.mehlalex.com`    | منصة المحامين + المصادقة | `/dashboard`, `/clients`, `/cases`, `/hearings`, `/deadlines`, `/tasks`, `/documents`, `/team`, `/settings`, `/onboarding`, `/pending-access`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/auth/*` | `/dashboard`               |
| `client.mehlalex.com` | بوابة العميل             | `/track`, `/upload/*`                                                                                                                                                                                                  | `/track`                   |
| `upload.mehlalex.com` | رفع المستندات فقط        | `/upload/*`                                                                                                                                                                                                            | صفحة "رابط خاص"            |
| `status.mehlalex.com` | التحقق من القضايا        | `/track`                                                                                                                                                                                                               | `/track`                   |
| `api.mehlalex.com`    | API فقط                  | `/api/*`                                                                                                                                                                                                               | 404 JSON (لا HTML إطلاقاً) |
| `docs.mehlalex.com`   | مركز المساعدة            | `/docs`                                                                                                                                                                                                                | `/docs`                    |

أي مسار يُطلب على نطاق لا يملكه → تحويل 302 إلى النطاق المالك.
النطاقات المحجوزة (`billing`, `mail`, `files`, `ai`, `notifications`, `analytics`) مسجّلة مسبقاً بحالة `planned: true`. تم إلغاء نطاق `calendar` مع حذف ميزة التقويم الموحد.

## إضافة نطاق جديد مستقبلاً

1. أزل `planned: true` من السجل (أو أضف عنصراً جديداً) في `src/config/surfaces.ts`.
2. أنشئ مسارات الصفحة تحت `src/routes/`.
3. أضف النطاق في Project Settings → Domains (سجل A إلى `185.158.133.1` + TXT `_lovable`).
4. أضف النطاق إلى Redirect URLs في إعدادات المصادقة إن كان يحتاج جلسة.

لا يتطلب أي تعديل في بنية المشروع.

## المصادقة والجلسة (SSO)

- **أصل واحد للمصادقة**: كل صفحات الدخول/التسجيل/استعادة كلمة المرور تُخدم على `app.mehlalex.com` فقط. أي محاولة لفتحها على نطاق آخر تُحوَّل تلقائياً.
- الجلسة تُحفظ في مخزن المتصفح الخاص بأصل `app`، فلا تتسرب إلى `client` أو `upload` أو `status` — وهذه أصلاً نطاقات عامة لا تحتاج جلسة محامٍ.
- عند تفعيل نطاق جديد يحتاج جلسة (مثل `billing`)، الخيار المعتمد هو التحويل إلى `app` للمصادقة ثم العودة، لا مشاركة كوكيز عبر النطاقات.

### إعدادات لوحة المصادقة (تُضبط عند تفعيل الدومين)

- **Site URL**: `https://app.mehlalex.com`
- **Redirect URLs**:
  - `https://app.mehlalex.com/**`
  - `https://www.mehlalex.com/**`
  - `https://mehlalex.com/**`
- **Google OAuth**: `redirect_uri` يجب أن يكون `https://app.mehlalex.com/auth/callback` (نطاق عام غير محمي).

## الأمان (أقل صلاحية ممكنة لكل نطاق)

- `upload` و`status` و`client`: صفحات عامة تعتمد على Server Functions عامة فقط، ولا تصل لأي جدول مباشرة؛ عزل البيانات مضمون بسياسات RLS ورموز غير قابلة للتخمين.
- `status`: يعرض فقط التحديثات المعلّمة `is_client_visible = true`، مع حد لمحاولات إدخال الرمز.
- `upload`: الرابط صالح لمرة واحدة وينتهي بعد الإرسال.
- `api`: لا يقدّم HTML؛ أي مسار غير `/api/*` يعيد 404 JSON.
- `app`: محمي بطبقة `_authenticated` + RLS على مستوى المكتب.
- صفحات البوابات العامة تحمل `robots: noindex` عدا `/docs` و`/track`.

## CORS / CSP

- نقاط `/api/public/*` تحمل ترويسات CORS صراحة (انظر `src/routes/api/public/health.ts`).
- Server Functions تُستدعى من نفس الأصل فقط ومحميّة بـ CSRF middleware، لذلك لا تُفتح لأي نطاق آخر.
- عند إضافة أي استهلاك للـ API من نطاق فرعي آخر، حدّد `Access-Control-Allow-Origin` بقائمة نطاقات `*.mehlalex.com` بدلاً من `*`.

## التطوير والمعاينة

روابط `localhost` و`*.lovable.app` تُعامل كنطاق مفتوح: كل المسارات متاحة كما هي اليوم، فلا تنكسر أي وظيفة قبل ربط النطاقات.
