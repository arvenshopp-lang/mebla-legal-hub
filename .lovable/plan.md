# خطة إصلاح نتائج تدقيق مِهلة — 9 مراحل

## نتائج المرحلة 0 (فحص فعلي، قراءة فقط — منفّذ الآن)

| البند | الحالة الفعلية |
| --- | --- |
| ملف `.env` متتبع في Git | نعم — متتبع فعلاً |
| هل يحتوي أسراراً؟ | **لا**. المفاتيح الموجودة (أسماء فقط): `SUPABASE_URL`, `SUPABASE_PROJECT_ID`, `SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_LOVABLE_CONNECTOR_POSTHOG_*`. كلها Publishable/Public بحكم التصميم. **لا يوجد Service Role ولا سر تكامل** ⇒ لا حاجة لتدوير مفاتيح |
| `tmp-repro/pdf.ts` متتبع | نعم — ملف إعادة إنتاج مؤقت، سبب خطأي ESLint `no-explicit-any` |
| `.gitattributes` | غير موجود ⇒ اختلاف LF/CRLF يفسد Prettier على Windows/CI |
| ESLint | 412 خطأ: 408 منها Prettier تنسيق فقط (معظمها `scripts/e2e/audit-export.e2e.ts`)، و4 حقيقية: شرط ثابت في `plan3_actions.e2e.ts:441` + `any` في `tmp-repro/pdf.ts` |
| قوالب RBAC | `scripts/rbac-template-audit.ts:42` يقارن برقم صلب 19 والواقع 20 |
| سبب فشل مزامنة البريد | مثبت في `mcp-client.server.ts`: `readLimited()` يقرأ حتى `done` ثم يحلّل ⇒ تدفق SSE المفتوح يُلغى من الاستضافة (`Stream was cancelled`) |
| حرس MFA | `security-policy.ts` و`requireSensitiveAccess` يصرّحان صراحةً أن AAL2 اختياري ويُسجَّل فقط — التعليق الرأسي في `sensitive-guard.server.ts` (البند 4) هو المتناقض ولا يعبّر عن السلوك المعتمد |
| إعادة محاولة البريد | `retryEmailJob` يعيد الجدولة قبل فحص السبب ويرفع `max_attempts` بلا سقف |
| مسارات لوحة الإدارة | لا توجد ملفات `finance` / `health` / `audit`؛ الموجود `revenue` / `monitoring` / `logs` ⇒ الروابط القديمة تسقط على Not Found خام |

**قرار بيئة (يحتاج تأكيدك):** الباك إند الموصول بالمشروع هو نفسه Lovable Cloud الذي يخدم النطاق. اختلاف الأرقام يُفسَّر بوجود بيئتي Test/Live منفصلتين لا بمشروع خاطئ. **لن أنفّذ أي Migration قبل تأكيدك على أي بيئة نعمل.**

## المرحلة 0 — تنفيذ (بلا لمس تاريخ Git)
- `.gitignore`: إضافة `.env`, `.env.*` مع استثناء `.env.example`, وإضافة `tmp-repro/`.
- إضافة `.env.example` بأسماء بلا قيم.
- حذف `tmp-repro/pdf.ts` نهائياً (لا حاجة لبديل: التغطية موجودة في اختبارات الفواتير).
- توسيع `scripts/security-guardrails.ts`: يفشل إذا كان `.env` متتبعاً، أو وُجد مجلد إعادة إنتاج مؤقت متتبع، أو ظهر بريد/جوال حقيقي في fixtures (يُسمح بنطاق `.invalid` فقط).
- **إزالة `.env` من التتبع + معالجة التاريخ:** أوثّقهما في `docs/git-hygiene.md` كخطة منفصلة تحتاج تنسيقاً مع Lovable/GitHub. لن أنفّذ `force-push` ولا rebase.

## المرحلة 1 — إصلاح مزامنة Hostinger MCP (الأولوية القصوى)
- محلّل SSE/JSON تزايدي في `mcp-client.server.ts`: يراكم الحزم الجزئية، ويتوقف لحظة ورود packet يطابق `requestId` ويحوي `result` أو `error`، ثم يلغي القارئ **إلغاءً مقصوداً لا يُسجَّل فشلاً**، دون انتظار `[DONE]`.
- Deadline واحد يغطي fetch + قراءة الجسم، وتصنيف منفصل ومنقّح: `timeout`, `provider_cancelled`, `unauthorized`, `provider_rate_limited`, `invalid_response`.
- الحفاظ على `MAX_RESPONSE_BYTES`, `redirect: manual`, التنقيح، القاطع، والتراجع الأُسّي.
- اختبارات وحدة: JSON عادي، SSE في chunk واحد، SSE مقسوم وسط `data:`، أحداث متعددة، تدفق لا ينتهي بعد الجواب، timeout قبل الجواب، 401/403/429، جسم فوق الحد.
- ثلاث دورات مزامنة متتالية على بيئة الاختبار كدليل. **لا إرسال رسالة حقيقية.**

## المرحلة 2 — تصنيف terminal وإعادة المحاولات
- وحدة `email-failure-class.ts`: `retryable | terminal` مع `recipient_suppressed` والرفض النهائي ومشكلات السياسة = terminal.
- `retryEmailJob` يرفض terminal خادمياً برسالة عربية واضحة، وسقف ثابت لـ`max_attempts`، وزر معطّل مع سبب في الواجهة.
- إجراء `acknowledgeEmailJob` (إغلاق مدقق) بدل إعادة المحاولة، مع Audit وIdempotency واختبارات صلاحية.

## المرحلة 3 — MFA تدريجي (يحتاج قرارك)
السلوك الحالي «MFA اختياري» **مقصود وموثّق في الكود**، والفرض تغيير سياسة منتج. المقترح:
- `MFA_ENFORCEMENT` بثلاث مراحل `observe → grace → enforce` مع تاريخ نهاية، وقائمة العمليات المطلوبة (كشف PII، مستندات حساسة، أسرار التكاملات، الانتحال، RBAC عالي الخطورة، استرداد/دفع/إعادة فتح فترة، تدوير مفاتيح، إجراءات super_admin).
- `requireSensitiveAccess` يمنع فعلياً في `enforce` فقط + Step-up UI يعيد المستخدم لنفس العملية + مسار استرداد مدقق.
- **لن أفعّل `enforce` قبل تسجيل عامل MFA لمالك المنصة والتحقق من الاسترداد.**

## المرحلة 4 — عزل E2E وتنظيف QA
- حارس يفشل أي سكربت E2E على مضيف الإنتاج إلا برمز موافقة مؤقت غير محفوظ في Git.
- fixtures بمعرّف تشغيل فريد و`try/finally` وcleanup قابل لإعادة التشغيل، وإغلاق تذاكر `QA-LOAD`/`QA-PROBE` عند الفشل.
- تقرير preview لبيانات QA (أعداد فقط حسب prefix/الحالة/التاريخ). **لا حذف قبل موافقتك.**

## المرحلة 5 — المسارات والواجهة
- تحويلات دائمة: `finance→revenue`, `health→monitoring`, `audit→logs`.
- `notFoundComponent` عربي لشجرة `/mehla-admin`.
- قوائم التعيين: `user_id` مفتاحاً + تسمية «الاسم — الدور — بريد مقنّع» (عبر الدالة الخادمية المقيّدة الحالية).
- `required` + `aria-required` + `aria-describedby` لحقول Zod.

## المرحلة 6 — CSP وسلامة المستندات
- CSP حسب البيئة: على الإنتاج `frame-ancestors 'self'` فقط وبلا `unsafe-eval`؛ أصول Lovable في preview فقط. خطة nonce لاستبدال `unsafe-inline`.
- اختبار HTTP headers + اختبار رفض التأطير.
- تعويض ذرّي للمستندات: حذف الملف اليتيم عند فشل DB، ومنع حذف صف DB عند فشل Storage، مع تدقيق وتقييد بالمنظمة.

## المرحلة 7 — جودة الكود والتوثيق
- استبدال الشرط الثابت بحالة `BLOCKED` صريحة، وإزالة سبب `no-explicit-any`، ومعالجة تحذير Hook في `providers.tsx`.
- `rbac-template-audit.ts`: التحقق من قائمة codes المطلوبة والتفرّد بدل الرقم الصلب.
- `.gitattributes` (LF) + تشغيل Prettier على الملفات المتأثرة.
- ترحيل `inputValidator → validator` **على دفعات صغيرة** مع typecheck وE2E بعد كل دفعة.
- تحديث README ووثائق المالك وبوابة الإصدار، وفصل النتائج التاريخية عن الحالة التشغيلية.

## المرحلة 8 — جاهزية المزودين
- فصل الحالات `not_configured / pending_probe / healthy / degraded / terminal_failure` وعدم عرض «غير مهيأ» كفشل اتصال.
- سبب فشل ويبهوك الدفع وOCR مع أهلية إعادة المحاولة ومرجع تدقيق دون كشف الحمولة.
- Moyasar وWhatsApp لا يُعتبران جاهزين قبل اكتمال الحقول واختبار إنتاجي بموافقتك. **لا إعادة محاولة جماعية للرسائل الـ12 قبل المرحلة 2.**

## ما لن أفعله بدون موافقة صريحة
نشر، حذف بيانات إنتاج، إرسال رسائل حقيقية، تدوير مفاتيح، تفعيل `enforce` لـMFA، أي Migration قبل تثبيت البيئة، وأي تعديل على تاريخ Git.

## تسليم كل مرحلة
جدول (المشكلة / السبب الجذري / الملفات / الاختبار / النتيجة) + قائمة `NOT TESTED/BLOCKED` صريحة، وتمييز: مبني، Type-checked، Linted، مختبر آلياً، مختبر E2E حياً.
