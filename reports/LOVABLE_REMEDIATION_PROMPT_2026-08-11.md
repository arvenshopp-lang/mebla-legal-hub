# برومبت Lovable لإصلاح نتائج تدقيق مِهلة

انسخ النص التالي كاملاً إلى Lovable:

---

أنت تعمل الآن على مشروع **مِهلة | Mehla** القانوني السعودي SaaS. تعامل مع هذا الطلب كإصلاح أمان وتشغيل وجودة على مراحل، وليس كتغيير تصميم أو إضافة ميزات تسويقية.

## قواعد إلزامية قبل البدء

1. اقرأ `AGENTS.md` ثم `README.md` ووثائق `docs/qa` و`docs/security-guardrails.md` ومعمارية البريد وRBAC.
2. اعتبر GitHub `arvenshopp-lang/mebla-legal-hub` فرع `main` مرجع الكود. لا تعِد كتابة التاريخ ولا تستخدم force-push أو rebase/amend/squash على commits منشورة.
3. لا تعرض أو تسجل أو تنسخ أي سر أو قيمة من `.env`. لا تطلب مفاتيح في المحادثة.
4. لا تنشر، لا تنظف بيانات الإنتاج، لا ترسل رسائل، لا تغيّر أدواراً، ولا تدوّر مفاتيح دون موافقة صريحة بعد عرض خطة التنفيذ.
5. لا تختبر عمليات مدمرة على الإنتاج. أنشئ/استخدم staging مع بيانات QA معزولة.
6. ميّز في التقرير بين: مبني، Type-checked، Linted، مختبر آلياً، مختبر E2E حياً.

## المرحلة 0 — إثبات البيئة ومنع التسريب

- أثبت أولاً ما هو Supabase الذي يخدم `mehlalex.com`. المشروع الموصول حالياً خارج الإنتاج يعرض صفراً للمكاتب/الاشتراكات/القضايا/التذاكر، بينما الإنتاج يعرض بيانات فعلية. لا تنفذ migration حتى تثبت ref الإنتاج الصحيح.
- المستودع عام ويوجد `.env` متتبع و`tmp-repro/pdf.ts` متتبع ببيانات شخصية/فوترة. لا تطبع المحتوى.
- صنّف مفاتيح `.env` داخلياً إلى public publishable مقابل secrets. إذا وُجد أي سر غير عام فاعتبره مكشوفاً وأخرج قائمة **بأسماء المفاتيح فقط** وخطة تدوير تحتاج موافقة.
- أضف `.env` و`.env.*` إلى `.gitignore` مع استثناء `.env.example` بلا قيم، وأزل `.env` من التتبع في commit جديد بعد التأكد أن Lovable Cloud يستخدم إعدادات البيئة.
- احذف `tmp-repro/pdf.ts` أو استبدله باختبار رسمي ببيانات اصطناعية من نطاق `.invalid`، وأضف `tmp-repro/` إلى `.gitignore` إن كان مؤقتاً.
- وسّع `scripts/security-guardrails.ts` ليفشل إذا كان `.env` متتبعاً أو وُجد مجلد إعادة إنتاج مؤقت متتبع أو بيانات عميل صريحة في fixtures.
- لا تعالج تاريخ Git تلقائياً. أخرج خطة منفصلة لمعالجة التاريخ بالتنسيق مع Lovable/GitHub؛ لا force-push.

## المرحلة 1 — إصلاح مزامنة Hostinger Agentic Mail

المشكلة الحية: جولات كل خمس دقائق تفشل بـ`Stream was cancelled`.

السبب في `src/lib/email/agentic/mcp-client.server.ts`: `readLimited()` يقرأ SSE حتى إغلاق التدفق ثم يحلل JSON-RPC. تدفق MCP قد يبقى مفتوحاً، فتقوم الاستضافة بإلغائه.

نفّذ التالي:

- استبدل القراءة الكاملة بمحلل SSE/JSON تزايدي يراكم الحزم الجزئية ويبحث عن packet يطابق `requestId` ويحوي `result` أو `error`.
- عند وصول الجواب، أوقف القراءة وألغِ القارئ بصورة مقصودة دون تسجيلها كفشل.
- طبّق deadline واحداً على fetch + قراءة الجسم، وصنّف timeout وprovider cancellation وauth error وinvalid response بصورة منفصلة ومنقحة.
- لا تنتظر `[DONE]` إذا وصل جواب الطلب.
- حافظ على حد `MAX_RESPONSE_BYTES` ومنع redirects وتنقيح الأسرار والقاطع والتراجع الأُسّي.
- أضف اختبارات: JSON عادي، SSE في chunk واحد، SSE مقسّم وسط `data:`, أحداث متعددة، تدفق لا ينتهي بعد الجواب، timeout قبل الجواب، 401/403/429، جسم أكبر من الحد.
- اختبر ثلاث دورات staging متتالية ثم اعرض الدليل. لا ترسل رسالة حقيقية دون موافقة.

## المرحلة 2 — ضبط إعادة محاولات البريد والوظائف

في `retryEmailJob` لا تُعد جدولة الرسالة قبل فحص سبب الفشل.

- أضف تصنيفاً مركزياً `retryable | terminal`.
- اعتبر `recipient_suppressed` والرفض النهائي ومشكلات السياسة terminal.
- امنع الخادم من إعادة terminal jobs حتى لو استُدعيت الدالة مباشرة، وأخفِ/عطّل الزر مع سبب واضح.
- لا تزد `max_attempts` بلا حد.
- أضف إجراء `acknowledge/close` مدققاً للفشل النهائي بدلاً من إعادة المحاولة.
- أضف اختبارات server authorization وidempotency وaudit لكل مسار.

## المرحلة 3 — فرض MFA تدريجياً

يوجد تناقض في `src/lib/security/sensitive-guard.server.ts`: التعليق يقول AAL2 إلزامي، لكن التنفيذ يجعله اختيارياً.

- أنشئ سياسة مركزية تحدد العمليات التي تتطلب AAL2: كشف PII، تنزيل/طباعة/مشاركة/تصدير مستندات حساسة، إدارة أسرار التكاملات، الانتحال، تغيير RBAC عالي الخطورة، استرداد/دفع/إعادة فتح فترة، تدوير مفاتيح، وإجراءات super_admin الحساسة.
- اجعل `requireSensitiveAccess` يمنع فعلياً عند غياب AAL2 للعمليات المحددة.
- أضف Step-up UI يعيد المستخدم للعملية بعد التحقق.
- طبّق rollout آمن: `observe` ثم `grace` ثم `enforce` مع تاريخ نهاية واضح، وأبقِ مسار استرداد موثقاً ومدققاً.
- لا تُفعّل `enforce` على الإنتاج قبل تسجيل عامل MFA واحد على الأقل لمالك المنصة والتحقق من الاسترداد.
- أضف E2E: AAL1 ممنوع، AAL2 مسموح، انتهاء الجلسة، إلغاء العامل، وحساب staff غير مخول.

## المرحلة 4 — عزل E2E وتنظيف QA

- أضف حارساً يفشل سكربتات E2E إذا كان المضيف production، إلا برمز موافقة صريح ومؤقت لا يُحفظ في Git.
- اجعل fixtures تستخدم organization/run id فريداً و`try/finally` مع cleanup قابل لإعادة التشغيل.
- لا تترك تذاكر `QA-LOAD` أو `QA-PROBE` بحالة مفتوحة عند الفشل.
- أنشئ تقرير preview لبيانات QA القديمة: أعداد فقط حسب prefix والحالة والتاريخ. لا تحذف شيئاً حتى يوافق المالك.
- بعد الموافقة، نفّذ تنظيفاً مدققاً يحافظ على متطلبات السجل القانونية ويعزل بيانات QA عن تقارير التشغيل.

## المرحلة 5 — المسارات والواجهة

- أضف تحويلات دائمة داخل التطبيق:
  - `/mehla-admin/finance` → `/mehla-admin/revenue`
  - `/mehla-admin/health` → `/mehla-admin/monitoring`
  - `/mehla-admin/audit` → `/mehla-admin/logs`
- أصلح not-found داخل شجرة `/mehla-admin` ليعرض صفحة 404 العربية وليس `Not Found` خاماً.
- في قوائم تعيين المسؤول، اجلب `user_id, full_name, email, role` واعرض تسمية مميزة مثل `الاسم — الدور — بريد مقنّع`. لا تستخدم الاسم وحده كمفتاح.
- أضف `required` و`aria-required` للحقول التي يفرضها Zod واربط رسائل الخطأ بـ`aria-describedby`.

## المرحلة 6 — CSP وسلامة المستندات

- اجعل CSP حسب البيئة. على `mehlalex.com`: `frame-ancestors 'self'` فقط. اسمح بمعاينة Lovable في بيئات preview فقط وبأصول محددة.
- أزل `unsafe-eval` من production. خطط لاستبدال `unsafe-inline` بـnonce/hash دون كسر TanStack/Lovable preview.
- أضف اختبار HTTP headers للإنتاج والمعاينة واختبار frame denial.
- انقل رفع/حذف المستندات إلى Server Function موحّد أو أضف تعويضاً صريحاً:
  - إذا نجح Storage وفشل DB، احذف الملف اليتيم.
  - إذا فشل حذف Storage، لا تحذف صف DB بصمت.
  - كل خطوة مدققة ومقيدة بالمنظمة وRLS/RBAC.

## المرحلة 7 — جودة الكود والتوثيق

- أصلح أخطاء ESLint الفعلية:
  - الشرط الثابت `false && reqId` في `scripts/e2e/plan3_actions.e2e.ts`؛ استبدله بحالة `BLOCKED` صريحة أو feature flag مضبوط.
  - أزل ملف `tmp-repro` الذي يسبب `no-explicit-any`.
- عالج تحذير Hook في `src/routes/mehla-admin/providers.tsx`.
- حدّث `scripts/rbac-template-audit.ts`: يوجد 20 قالباً لا 19. لا تستخدم رقماً صلباً؛ تحقق من قائمة codes المطلوبة ومن uniqueness.
- أضف `.gitattributes` لتوحيد LF حتى ينجح Prettier على Windows وCI.
- رحّل `createServerFn().inputValidator()` إلى `.validator()` على دفعات صغيرة مع TypeScript وE2E بعد كل وحدة.
- حدّث README ووثائق المالك وFinal Release Gate لتعكس المنتج الحالي، وافصل نتائج تاريخية عن الحالة التشغيلية الحالية.

## المرحلة 8 — جاهزية المزودين والتشغيل

- لا تعرض `غير مهيأ` كأنه `فشل اتصال`.
- افصل الحالات: `not_configured`, `pending_probe`, `healthy`, `degraded`, `terminal_failure`.
- اعرض سبب فشل Webhook الدفع ووظيفتي OCR مع retry eligibility ومرجع تدقيق، دون كشف payload أو سر.
- لا تعتبر Moyasar أو WhatsApp جاهزين قبل اكتمال الحقول واختبار اتصال إنتاجي ناجح بموافقة المالك.
- لا تنفذ retry جماعي للـ12 رسالة الحالية قبل تطبيق تصنيف terminal.

## اختبارات القبول المطلوبة

نفّذ على staging أولاً:

1. `build`, `tsc --noEmit`, `eslint .` = PASS وصفر أخطاء.
2. Security guardrails + DB guardrails على قاعدة staging الصحيحة = PASS.
3. RBAC matrix/nav/template audit = PASS لجميع القوالب العشرين.
4. E2E لخمس أدوار المكتب: owner, admin, lawyer, legal_assistant, viewer.
5. E2E لعزل مكتب A عن B ومستخدم outsider، قراءة وكتابة وتلاعب بالـIDs والحمولة.
6. E2E خادمي لعينة كل قالب منصة، مع اختبار مباشر للدوال وليس إخفاء الأزرار فقط.
7. Client portal: صالح/غير صالح/منتهي/ملغى/rate limit وعدم تسريب internal fields.
8. Documents: upload/rollback/download/print/share/revoke/OCR/watermark عبر ملفات QA فقط.
9. Mail MCP: ثلاث مزامنات ناجحة متتالية وتدفق SSE طويل العمر دون فشل.
10. Mobile 360/390/768، RTL، keyboard، focus، وWebKit فعلي.
11. لا QA tickets مفتوحة ولا jobs terminal قابلة لإعادة المحاولة بعد cleanup الموافق عليه.

## مخرجاتك المطلوبة قبل أي نشر

- جدول: المشكلة، السبب الجذري، الملفات المعدلة، الاختبار المنفذ، النتيجة.
- migrations منفصلة وقابلة للرجوع، إن لزم، بعد إثبات Supabase الصحيح.
- قائمة `NOT TESTED/BLOCKED` صريحة.
- diff وcommit منظم لكل مرحلة، دون push/deploy قبل موافقة المالك.
- لا تقل «تم الإصلاح» إلا إذا نجح اختبار القبول المرتبط فعلياً.

ابدأ بالمرحلة 0 قراءةً وتحليلاً، ثم اعرض الخطة والـdiff المقترح قبل أي عملية إنتاجية مؤثرة.

---
