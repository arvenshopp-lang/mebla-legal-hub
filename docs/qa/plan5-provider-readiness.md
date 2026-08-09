# PLAN 5 — جاهزية المزوّدين الخارجيين (Payment / SMS / WhatsApp)

التاريخ: 2026-08 · البيئة: Preview + قاعدة بيانات المشروع · لا مفاتيح إنتاجية مُدخلة.

## النتيجة
- **CODE READINESS = PASS** (18/18) — `bun scripts/e2e/plan5_provider_readiness.e2e.ts`
- **EXTERNAL E2E = BLOCKED WAITING FOR PROVIDER** — يتعذّر إثبات اتصال حقيقي قبل استلام Credentials.

## ما نُفّذ في هذه الجولة (سد فجوات فعلية)
1. **بدء عملية دفع خارجية** — `createProviderPayment` في `src/lib/billing/billing.server.ts`
   + الدالة الخادمية `billingCreateProviderPayment` + زر «بدء دفع إلكتروني» في صفحة الفاتورة.
   يشترط: مزوّد مفعّل بحالة `verified`، مفاتيح محفوظة، فاتورة مُصدرة، عملة SAR، مبلغ متبقٍ > 0،
   ومفتاح تفرّد (Idempotency) يمنع إنشاء عمليتين لنفس الطلب.
2. **تحقق المبلغ والعملة في الويبهوك** — `AMOUNT_MISMATCH` / `CURRENCY_MISMATCH`
   قبل أي تغيير لحالة الدفعة، والعملة تُنقل من حمولة المزوّد عبر `WebhookEvent.currency`.
3. **P4-002 (High) مُغلق** — إصدار الفاتورة أصبح انتقال حالة ذرّياً (`.eq("status","draft")`).
   إثبات فعلي: نداءان متوازيان → نجاح واحد فقط ورقم واحد `MEH-INV-2026-000030`.
4. **P4-003 (Low) مُغلق** — `parseBillingInput` يحوّل أخطاء التحقق إلى رسالة عربية واحدة
   بدل JSON خام من Zod. إثبات فعلي: «البيانات المُدخلة غير صحيحة (customerName)…».

## إعادة اختبار الانحدار
`bun scripts/e2e/plan4c_integrity_concurrency.e2e.ts` → **12/12 PASS**.

## المطلوب لاحقاً من المزوّدين
| المزوّد | المطلوب | الحالة |
|---|---|---|
| Moyasar | `secret_key`, `webhook_secret` | جاهز برمجياً — بانتظار المفاتيح |
| SMS/OTP | مفاتيح المزوّد المختار (Infobip / Twilio / Unifonic) | جاهز برمجياً |
| WhatsApp WABA (Whats Line Official) | مفتاح API + رقم مُعتمد + قوالب | جاهز برمجياً |
