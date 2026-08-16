# MEHLA — Hostinger Email: Batch C Pre-Build Audit (READ-ONLY)

لا كود، لا إرسال، لا Migration، لا تغيير إعداد مصادقة. هذا تقرير + تصميم دفعات.

## 1. البريد البشري (email_outbox)

`src/lib/email/workspace.server.ts` يرسل عبر Hostinger عندما تكون أسرار الصندوق كاملة (`transportConfigured`). الرجوع إلى البريد المُدار يحدث في حالتين:

- الصندوق ليس مهيأ (`useSmtp = false`) → `providerSend()` مباشرة عبر Lovable.
- فشل SMTP برمز إعداد (`smtp_not_configured` / `smtp_auth_failed` / `smtp_connect_failed` / `smtp_timeout` / `attachment_unavailable`) → إعادة إرسال فورية عبر Lovable في نفس الدورة.

التغيير المطلوب لإزالة الرجوع بأمان:
- حذف `providerSend()` وكل استيراد `sendLovableEmail`/`EmailAPIError` من الملف.
- عند `useSmtp = false`: لا إرسال — تُعاد النتيجة كفشل برمز `smtp_not_configured` وتُعامل كعطل إعداد **قابل للإعادة** (لا "permanent") حتى لا يُحرق بريد المكتب بسبب سرّ ناقص، مع `logFailure` واحد.
- نقل `smtp_not_configured` من `PERMANENT_SEND_CODES` إلى مسار الإعادة بمهلة ثابتة (5 دقائق) لأنه صار قابلاً للإصلاح تشغيلياً.
- الاحتفاظ بقسم المرفقات بالروابط الموقّعة فقط للحالات التي لا يستطيع MIME تضمينها كما هي الآن (لا تغيير في السلوك).

## 2. نموذج فشل البريد البشري (كفاية الحالي)

النموذج الحالي كافٍ ولا يحتاج إعادة تصميم:
- قفل ذرّي (`status → sending` بشرط `queued/scheduled`) يمنع الإرسال المزدوج.
- `attempts` مقابل `max_attempts` (5) + backoff أسّي بحد 60 دقيقة → لا إعادة لا نهائية.
- التعليم كـ`sent` يحدث فقط عند `result.ok`.
- إعادة يدوية عبر `prepareManualRetry` تضمن محاولة إضافية.

التصحيح الأدنى الوحيد: تصنيف أعطال إعداد SMTP كمؤقتة (البند 1) + رفع سقف `max_attempts` لهذه الحالة **غير مطلوب** لأن الإعادة اليدوية موجودة. لا فقدان بريد: الرسالة تبقى `queued`/`failed` مع `last_error_code` ظاهر.

## 3. الحجب/إلغاء الاشتراك — الوضع الحالي

`src/lib/email/suppression.server.ts` يستخدم `getEmailUnsubscribe` / `setEmailUnsubscribe` على النطاق `mail.mehlalex.com`، والحالة مخزّنة **حصراً عند Lovable** (الملف نفسه يوثّق: لا جدول محلي).

المستخدمون:
- `src/lib/invitations.server.ts:131` — فحص قبل إرسال دعوة فريق.
- `src/lib/email/email.functions.ts:326` — فحص عناوين في نافذة إنشاء البريد البشري.
- `src/lib/email/email.functions.ts:354` — رفع الحجب بعد موافقة موثّقة.

نتيجة مهمة: بعد Batch B لا يوجد أي إرسال عبر Lovable في المسار التطبيقي، ولذلك حالة الحجب هذه **لم تبقَ مؤثرة على الإرسال الفعلي** — Hostinger لا يقرأها. هي الآن مؤشر واجهة فقط. لا توجد رسائل تسويقية/broadcast في الكود؛ كل الفئات تشغيلية.

سجلات الحجب القائمة عند Lovable غير قابلة للتصدير من داخل المشروع → لا تُعتبر بيانات يجب ترحيلها آلياً، لكن يجب ألا يُفقد سلوك "منع الإرسال لعنوان مرتد/معترض".

## 4. النموذج الكنسي المقترح للحجب

الخيار **B**: جدول مِهلة مستقل عن المزوّد.

`public.email_suppressions` (append-only للأحداث + قراءة حالة فعّالة):
- `address` (طبيعي/lowercase), `reason` (`bounce_hard` | `complaint` | `manual` | `unsubscribe`), `source`, `created_by`, `created_at`, `lifted_at`, `lifted_by`, `note`.
- عالمي على مستوى المنصة (لا `organization_id`) لأن نقل SMTP واحد ونطاق واحد.
- RLS: قراءة لأعضاء المنصة المصرح لهم عبر صلاحية بريد قائمة، كتابة/رفع عبر RPC خادمي فقط، ومنع DELETE.
- التغذية: عند `smtp_rejected_recipient` دائم من `mehla-mailer` يُسجَّل `bounce_hard` تلقائياً؛ الشكوى/الرفع يدوياً من مركز البريد.
- `suppression.server.ts` يُعاد كتابته فوق هذا الجدول بنفس التوقيعين (`recipientStates`, `liftRecipientBlock`) → لا تغيير في المستدعين الثلاثة.

`SUPPRESSION_MIGRATION_REQUIRED = YES` (Migration جديد، خارج نطاق Foundation المعلّق).

## 5. تصنيف الفئات وسلوك إلغاء الاشتراك

| الفئة | مسار حالي | يحترم إلغاء الاشتراك؟ |
|---|---|---|
| AUTH / SECURITY (تأكيد، استرجاع، magic link، OTP، تغيير بريد) | webhook مصادقة | لا — يُرسل دائماً، يُحجب فقط عند ارتداد صلب |
| SYSTEM TRANSACTIONAL (دعوة فريق، إشعارات النظام) | `sendAppEmail` | لا لإلغاء الاشتراك؛ نعم للارتداد الصلب/الشكوى |
| BILLING (فواتير/إشعارات) | `billing.server.ts` | لا — إلزامي تعاقدي |
| SUPPORT (رد تذكرة) | notification worker | تفضيل المستخدم داخل التطبيق فقط |
| SALES (عروض/عقود) | `sales-docs.server.ts` | نعم عند شكوى/إلغاء صريح |
| HUMAN CORRESPONDENCE | `email_outbox` | نعم — يُمنع الإرسال لعنوان محجوب |
| OPTIONAL / MARKETING | غير موجود | — |

## 6–7. Webhook المصادقة — الواقع المُتحقَّق

`src/routes/lovable/email/auth/webhook.ts` لا يتلقى نداءً من Supabase مباشرة. من فحص `node_modules/@lovable.dev/email-js`:
- المستدعي: منصة Lovable (مُنسّق بريد المصادقة) الذي يستقبل hook المصادقة من Supabase ثم يستدعي مسارنا.
- التحقق: `verifyWebhookRequest` من `@lovable.dev/webhooks-js` بترويسة `x-lovable-signature` (HMAC-SHA256 بمفتاح `LOVABLE_API_KEY`) + `run_id` + `version === "1"`.
- الملف يقرر العناوين والقوالب فقط، ثم **المكتبة نفسها ترسل** عبر `sendLovableEmail` (نطاق `mail.mehlalex.com`) — أي أن الإرسال الفعلي لبريد المصادقة ما زال Lovable.
- الأحداث المنفّذة فعلاً: `signup`, `invite`, `magiclink`, `recovery`, `email_change`, `reauthentication` (6/6)، بقوالب `src/lib/email-templates/*`، والحقول `data.email`, `data.url`, `data.token`, `data.old_email`, `data.new_email`.
- الأخطاء/الإعادة: تُدار داخل المكتبة (رموز HTTP من `WEBHOOK_ERROR_STATUS`) ولا نتحكم بها.

## 8–9. استبدال مصادقة Lovable — الحكم

الاستبدال داخل الكود ممكن تقنياً (handler مِهلة يتحقق من التوقيع، يرندر نفس القوالب، ويرسل عبر `sendMehlaEmail` بهوية `system`، بلا تسجيل أي `url`/`token`). لكن الكود ليس هو نقطة الاتصال: hook المصادقة في Supabase يشير إلى بنية Lovable لا إلى مسارنا. تحويل بريد المصادقة إلى Hostinger يتطلب إعادة توجيه Send Email Hook إلى مسار مِهلة بسرّ توقيع Standard Webhooks خاص — وهذا إعداد مُدار على مستوى المنصة وممنوع تغييره من هنا، ولا يمكن إثبات عقد التوقيع البديل من داخل المستودع.

النتيجة: **AUTH_EMAIL_MIGRATION_BLOCKED**. الناقص بدقة:
1. عنوان hook المصادقة الحالي في إعداد Supabase Auth (إثبات أنه يشير إلى Lovable).
2. إذن/آلية تعيين hook مخصص + سرّ توقيعه (`SEND_EMAIL_HOOK_SECRET` بنمط Standard Webhooks).
3. تأكيد أن روابط `data.url` تُولَّد بنفس صلاحية الانتهاء وإعدادات إعادة التوجيه بعد التحويل.

## 10. هوية بريد المصادقة المستهدفة

`MEHLA <noreply@mehlalex.com>` مع `Reply-To: support@mehlalex.com` (من `MAIL_SYSTEM_REPLY_TO`). لا alias قسمي لرسائل كلمة المرور/الأمان.

## 11. هويات البريد التجاري (التخصيص المقترح)

جميع المستدعين اليوم بلا `identity` → `system`. المقترح:

| مستدعي | هوية |
|---|---|
| `invitations.server.ts` | `system` |
| `billing/billing.server.ts` | `billing` |
| `sales-docs.server.ts` | `sales` |
| `office-lead-email.server.ts` | `info` |
| `notifications/email-worker.server.ts` (عام) | `system` |
| رد الدعم داخل worker (`support_reply`) | `support` |

بلا أي تغيير في محتوى الرسائل.

## 12. بوابة إزالة الحزمة

`LOVABLE_EMAIL_IMPORT_COUNT_BEFORE = 3` ملفات (`workspace.server.ts`, `suppression.server.ts`, `routes/lovable/email/auth/webhook.ts`).
بعد C1 تصبح **1** (webhook المصادقة). الحزمة تُزال فقط بعد فك حصار المصادقة.

## 13. الأسرار

`LOVABLE_API_KEY` مستخدم أيضاً في `src/lib/ocr.server.ts` (بوابة الذكاء) و`src/routes/lovable/email/auth/preview.ts` (تحقق المستدعي) → لا يُحذف عالمياً.
`LOVABLE_SEND_URL` بريدي فقط (+ سكربت اختبار محلي) → قابل للحذف بعد C2/C3 لا قبله.
`EMAIL_DEPENDENCY_REMOVED ≠ SECRET_CAN_BE_DELETED_GLOBALLY`.

## 14. النطاق و DNS

نقل Hostinger لا يعتمد على أي API لنطاق مُدار: يصادق بـ`MAIL_USER`/`MAIL_PASSWORD` على `smtp.hostinger.com` والمظروف من الحساب المُصادق عليه. أما `mail.mehlalex.com` فما زال مستخدماً في مسار Lovable المتبقي (المصادقة/الحجب). SPF/DKIM/DMARC لا يمكن إثباتها من المستودع → **NEEDS_EXTERNAL_VERIFICATION** (لا تغيير DNS في هذه الدفعة).

## 15. أساس بريد الإشعارات

`supabase/migrations/20260815150000_notification_email_queue.sql` + جدول التسليم مستقلان عن المزوّد تماماً (لا عمود مزوّد، لا مفتاح API). `FOUNDATION_MIGRATION_CAN_REMAIN = YES` بلا تعديل.

## 16. المعمارية المستهدفة

مطابقة للمقترح، بتصحيح واحد: بريد المصادقة يبقى على Lovable حتى فك الحصار، وبريد الحجب يصبح جدول مِهلة.

## 17. تقسيم الدفعات (موصى به)

- **C1 (منخفض الخطورة):** إزالة رجوع البريد البشري + نموذج الفشل + جدول الحجب الكنسي وإعادة كتابة `suppression.server.ts` + تخصيص الهويات.
  ملفات: `src/lib/email/workspace.server.ts`, `src/lib/email/suppression.server.ts`, `src/lib/email/email.functions.ts` (رسائل فقط عند الحاجة), `src/lib/billing/billing.server.ts`, `src/lib/sales-docs.server.ts`, `src/lib/office-lead-email.server.ts`, `src/lib/notifications/email-worker.server.ts`, `supabase/migrations/<new>_email_suppressions.sql` (إنشاء فقط، بلا تطبيق), `scripts/*.test.ts`.
- **C2 (عالي الخطورة، محجوب):** ترحيل بريد المصادقة — بعد توفير الأدلة الثلاثة في البند 9.
  ملفات: `src/routes/lovable/email/auth/webhook.ts`, `src/lib/email/auth-email.server.ts` (جديد), `src/routes/lovable/email/auth/preview.ts`.
- **C3:** حذف `@lovable.dev/email-js` وتنظيف `LOVABLE_SEND_URL` بعد وصول العدّ إلى صفر.

## النتيجة النهائية

```text
HUMAN_MAIL_LOVABLE_FALLBACK: PRESENT
HUMAN_MAIL_HOSTINGER_ONLY_READY: YES (بعد C1)
CURRENT_SUPPRESSION_PROVIDER: Lovable Managed Email (mail.mehlalex.com) — لا حالة محلية
SUPPRESSION_USED_BY: invitations.server.ts، email.functions.ts (فحص + رفع)
PORTABLE_SUPPRESSION_MODEL: B — public.email_suppressions مملوك لمِهلة
SUPPRESSION_MIGRATION_REQUIRED: YES
AUTH_EMAIL_CURRENT_PROVIDER: Lovable Managed Email
AUTH_WEBHOOK_CALLER: منسّق بريد المصادقة في Lovable (وسيط بين Supabase Auth ومسارنا)
AUTH_WEBHOOK_SECURITY_MODEL: HMAC-SHA256 على x-lovable-signature بمفتاح LOVABLE_API_KEY + run_id + version=1
AUTH_EMAIL_EVENT_TYPES: signup, invite, magiclink, recovery, email_change, reauthentication
AUTH_HOSTINGER_REPLACEMENT_READY: NO
AUTH_EMAIL_MIGRATION_BLOCKERS: عنوان hook المصادقة الفعلي، إمكانية/سرّ hook مخصص، إثبات ثبات الروابط والصلاحية
TARGET_AUTH_SENDER: MEHLA <noreply@mehlalex.com> / Reply-To support@mehlalex.com
BUSINESS_IDENTITY_MAPPING: invites=system، billing=billing، sales=sales، leads=info، notifications=system، support_reply=support
LOVABLE_EMAIL_IMPORT_COUNT_BEFORE: 3
EXPECTED_EMAIL_IMPORT_COUNT_AFTER_C: 1 بعد C1 / 0 بعد C2
EMAIL_LOVABLE_API_KEY_REQUIRED_AFTER_C: NO (بريدياً) — نعم لغير البريد
LOVABLE_SEND_URL_REQUIRED_AFTER_C: NO
SECRETS_SAFE_TO_DELETE_GLOBALLY: PARTIAL
FOUNDATION_MIGRATION_CAN_REMAIN: YES
TARGET_EMAIL_ARCHITECTURE: NEEDS_CHANGE (المصادقة والحجب)
RECOMMENDED_BATCH_SPLIT: C1 / C2 / C3
LOVABLE_EXIT_EMAIL_READINESS_AFTER_C: NEEDS_MORE_WORK (بسبب المصادقة)
FINAL_VERDICT: AUTH_MIGRATION_NEEDS_DECISION — C1 جاهز للبناء
```
