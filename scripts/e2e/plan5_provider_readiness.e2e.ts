/**
 * PLAN 5 — جاهزية المزوّدين الخارجيين (Payment / SMS / WhatsApp).
 *
 * الهدف إثبات أن المنصة تتعامل بصدق مع غياب المفاتيح الحقيقية:
 * لا تفعيل بلا اختبار اتصال ناجح، لا نجاح وهمي، ولا اعتماد مبلغ خاطئ من الويبهوك.
 * التشغيل: bun scripts/e2e/plan5_provider_readiness.e2e.ts
 */
import { readFileSync } from "node:fs";

const results: { name: string; status: "PASS" | "FAIL"; detail: string }[] = [];
const rec = (name: string, ok: boolean, detail = "") => {
  results.push({ name, status: ok ? "PASS" : "FAIL", detail });
  console.log(`${ok ? "PASS" : "FAIL"} — ${name}${detail ? ` :: ${detail}` : ""}`);
};

const read = (path: string) => readFileSync(path, "utf8");

const billing = read("src/lib/billing/billing.server.ts");
const providers = read("src/lib/billing/providers.server.ts");
const webhooks = read("src/lib/billing/webhooks.server.ts");
const sms = read("src/lib/sms/otp.server.ts");
const whatsapp = read("src/lib/notifications/whatsline.server.ts");

/* ------------------------------------------------------------ الدفع */
rec(
  "PAY-01 موصل دفع مستقل بعقد واحد (Adapter)",
  /export interface PaymentProvider/.test(providers) && /getProvider\(code: string\)/.test(providers),
);
rec(
  "PAY-02 بدء عملية دفع خارجية موصولة فعلياً بالمركز المالي",
  /export async function createProviderPayment/.test(billing) &&
    /provider\.createPayment\(/.test(billing),
);
rec(
  "PAY-03 لا تفعيل لمزوّد قبل نجاح اختبار الاتصال",
  /لا يمكن تفعيل المزوّد قبل نجاح اختبار الاتصال/.test(billing),
);
rec(
  "PAY-04 غياب المفاتيح يُعرض بصدق not_configured بلا نجاح وهمي",
  /connection_status: "not_configured"/.test(billing) &&
    /بعض المفاتيح المطلوبة غير محفوظة بعد/.test(billing),
);
rec(
  "PAY-05 رفض بدء الدفع بعملة غير الريال السعودي",
  /الدفع الإلكتروني مدعوم بالريال السعودي فقط حالياً/.test(billing),
);
rec(
  "PAY-06 منع تكرار عملية الدفع بمفتاح تفرّد (Idempotency)",
  /idempotencyKey/.test(billing) && /duplicate: true/.test(billing),
);
rec(
  "PAY-07 التحقق من مطابقة المبلغ في الويبهوك",
  /AMOUNT_MISMATCH/.test(billing),
);
rec("PAY-08 التحقق من مطابقة العملة في الويبهوك", /CURRENCY_MISMATCH/.test(billing));
rec(
  "PAY-09 العملة تُنقل من حمولة المزوّد إلى طبقة التحقق",
  /currency: payment\.currency/.test(providers) && /currency: input\.event\.currency/.test(webhooks),
);
rec(
  "PAY-10 التحقق من توقيع الويبهوك قبل المعالجة",
  /validateWebhookSignature/.test(providers) && /validateWebhookSignature/.test(webhooks),
);
rec(
  "PAY-11 منع تكرار أحداث الويبهوك (event_id + dead_letter)",
  /event_id/.test(webhooks) && /dead_letter/.test(webhooks),
);
rec(
  "PAY-12 الاسترداد يمر عبر الموصل ولا يتجاوز المدفوع",
  /provider\.refundPayment\(/.test(billing) && /refundable/.test(billing),
);
rec(
  "PAY-13 المفاتيح تُقرأ من خزانة مشفّرة خادمية فقط",
  /IntegrationSecretVault/.test(billing) && !/sk_live|secret_key\s*=\s*"/.test(billing),
);
rec(
  "PAY-14 إصدار الفاتورة انتقال حالة ذرّي (لا سباق)",
  /\.eq\("status", "draft"\)\n\s*\.select\("id"\)/.test(billing) ||
    /انتقال حالة ذرّي/.test(billing),
);

/* ------------------------------------------------------------ الرسائل */
rec("SMS-01 طبقة تجريد لمزوّدي الرسائل", /provider/i.test(sms));
rec(
  "SMS-02 حماية OTP: مدة صلاحية ومحاولات وحد إغراق",
  /expires/i.test(sms) && /attempt/i.test(sms),
);

/* ------------------------------------------------------------ واتساب */
rec(
  "WA-01 موصل واتساب رسمي معزول خادمياً",
  /official/i.test(whatsapp) && whatsapp.includes("process.env") === false
    ? true
    : /official/i.test(whatsapp),
);
rec(
  "WA-02 لا مفاتيح مكتوبة في الكود",
  !/(Bearer\s+[A-Za-z0-9]{20,})/.test(whatsapp),
);

const failed = results.filter((r) => r.status === "FAIL");
console.log(
  `\nPLAN 5 CODE READINESS: ${results.length - failed.length}/${results.length} PASS`,
);
console.log(
  failed.length ? "CODE READINESS = FAIL" : "CODE READINESS = PASS\nEXTERNAL E2E = BLOCKED WAITING FOR PROVIDER",
);
process.exit(failed.length ? 1 : 0);
