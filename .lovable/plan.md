# خطة إعداد Resend لبريد مِهلة الآلي

## نطاق الخطة فقط
إعداد Resend HTTP API لرسائل النظام والتنبيهات الآلية، مع الحفاظ الكامل على بريد Hostinger البشري/الموظفين دون أي تغيير.

## حالة مُتحقَّقة من المصدر الحد الأدنى

### STEP 1 — عقد نقل HTTP الحالي
| البند | القيمة المُتحقَّقة |
|---|---|
| HTTP_API_ENDPOINT | `https://api.resend.com/emails` (افتراضي)؛ يمكن تجاوزه بـ `RESEND_API_URL` |
| API_KEY_ENV_NAME | `RESEND_API_KEY` |
| FROM_DOMAIN_EXPECTATION | `mehlalex.com` (مُعرَّف في `MEHLA_MAIL_DOMAIN`) |
| IDEMPOTENCY_HEADER | `Idempotency-Key` مشتق من `Message-ID` عبر `stableRequestKey()` |
| REPLY_TO_SUPPORTED_BY_CURRENT_CODE | YES — يُمرَّر كـ `reply_to` في JSON body |
| ADDITIONAL_RESEND_ENV_REQUIRED | `RESEND_API_KEY` فقط؛ `RESEND_API_URL` اختياري |

### STEP 2 — نطاق المُرسل الآلي المُقترَح
| البند | القيمة |
|---|---|
| RECOMMENDED_SYSTEM_DOMAIN | `notify.mehlalex.com` |
| TARGET_NOTIFICATION_FROM | `MEHLA <noreply@notify.mehlalex.com>` |
| TARGET_NOTIFICATION_REPLY_TO | `support@mehlalex.com` |
| CURRENT_NOTIFICATION_FROM | `noreply@mehlalex.com` (مُعرَّف في `MEHLA_IDENTITIES.system`) |
| SOURCE_CHANGE_REQUIRED_FOR_TARGET_FROM | YES — يتطلَّب تعديل `MEHLA_MAIL_DOMAIN` أو جعله قابلاً للتهيئة لمسار النظام فقط |

### STEP 3 — سلوك Reply-To الحالي
دالة `identityReplyTo("system")` تقرأ `MAIL_SYSTEM_REPLY_TO` من بيئة الخادم. إذا كانت القيمة `support@mehlalex.com` فلا حاجة لتعديل إضافي لسلوك الرد؛ أما عنوان المُرسل فلا يزال يحتاج تعديل النطاق.

## قائمة التعديلات اليدوية المطلوبة من المستخدم

A. تسجيل الدخول إلى Resend (إنشاء حساب جديد إذا لزم).
B. إضافة نطاق مُرسل جديد: `notify.mehlalex.com`.
C. نسخ سجلات DNS التي يُولِّدها Resend للنطاق.
D. إضافة تلك السجلات فقط في مدير DNS للنطاق الرئيسي `mehlalex.com` (سجلات فرعية للنطاق الفرعي `notify`).
E. الانتظار حتى يظهر حالة النطاق في Resend: **VERIFIED**.
F. إنشاء مفتاح API للإرسال فقط (Sending API Key) بأقل صلاحية إرسال ممكنة.
G. عدم لصق المفتاح في الدردشة أبداً.
H. إضافة المفتاح إلى أسرار بيئة التشغيل في Lovable باسم: `RESEND_API_KEY`.

## سجلات DNS المطلوبة (فئات فقط، بدون قيم مُختلقة)

| النوع | الغرض | المصدر |
|---|---|---|
| DKIM | توقيع البريد | قيمة من Resend dashboard |
| SPF / MAIL FROM | مصادقة المصدر | قيمة من Resend dashboard |
| DMARC (اختياري مُستحسَن) | سياسة التسليم والتقارير | يمكن إضافته لاحقاً عند الاستقرار |

**ملاحظة أمان:** لا تُمسح ولا تُستبدل سجلات Hostinger MX/SPF/DKIM للبريد البشري على `mehlalex.com`.

## تأكيد عدم المساس بالبريد البشري

| البند | الحالة |
|---|---|
| HUMAN_MAIL_PROVIDER | Hostinger |
| HOSTINGER_HUMAN_MAIL_CHANGED | NO |
| HOSTINGER_MX_CHANGED | NO |
| HOSTINGER_IMAP_CHANGED | NO |
| EMPLOYEE_EMAIL_ADDRESSES_CHANGED | NO |

## التعديل المصدري المطلوب قبل النشر

تغيير `MEHLA_MAIL_DOMAIN` في `src/lib/email/transport/mehla-mailer.server.ts` من `"mehlalex.com"` إلى `"notify.mehlalex.com"` لمسار النظام الآلي فقط، أو جعله قابلاً للتهيئة عبر متغير بيئة (مثلاً `MEHLA_NOTIFICATION_MAIL_DOMAIN`) مع الاحتفاظ بـ `mehlalex.com` للبريد البشري. هذا التعديل ليس جزءاً من هذه الخطوة؛ يُترك لخطوة التحقق من الإعدادات.

## حالة الإجراءات غير المسموح بها في هذه الخطوة

| الإجراء | الحالة |
|---|---|
| SECRET_CREATED | NO |
| DNS_CHANGED | NO |
| CODE_CHANGED | NO |
| DEPLOY | NO |
| REAL_EMAIL_SENT | NO |
| FAILED_13_ROWS_TOUCHED | NO |

## البوابة التالية

بعد تأكيد المستخدم يدوياً من:
- `RESEND_DOMAIN_VERIFIED`
- `RESEND_API_KEY_ADDED`

الخطوة التالية هي:
`RESEND CONFIG VERIFICATION` → `DEPLOY` → `ONE CONTROLLED SYSTEM EMAIL` → `ONE FAILED REMINDER RECOVERY` → remaining recovery → FINAL CLOSURE

## النتيجة النهائية

FINAL_STATUS: READY_FOR_MANUAL_RESEND_SETUP

STOP.
