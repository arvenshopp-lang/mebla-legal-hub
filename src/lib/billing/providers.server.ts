/**
 * طبقة مزوّدي الدفع (Payment Provider Layer) — مستقلة تماماً عن أي مزوّد.
 * كل مزوّد ينفّذ نفس العقد، ولا يعرف المركز المالي أي تفاصيل تقنية عن المزوّد.
 * تُقرأ المفاتيح من خزانة التكاملات المشفّرة فقط، ولا توجد أي مفاتيح في الكود.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export type ProviderCode = "manual" | "moyasar";

export type ProviderCredentials = Record<string, string>;

export type CreatePaymentInput = {
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  description: string;
  correlationId: string;
  callbackUrl?: string;
};

export type ProviderPaymentState = {
  providerPaymentId: string | null;
  status:
    | "pending"
    | "processing"
    | "paid"
    | "failed"
    | "cancelled"
    | "refunded"
    | "partially_refunded";
  amount: number | null;
  reference: string | null;
  raw: unknown;
  failureCode?: string | null;
  failureMessage?: string | null;
  redirectUrl?: string | null;
};

export type WebhookEvent = {
  eventId: string | null;
  eventType: string | null;
  providerPaymentId: string | null;
  status: ProviderPaymentState["status"] | null;
  amount: number | null;
  occurredAt: string | null;
  raw: unknown;
};

export interface PaymentProvider {
  readonly code: ProviderCode;
  /** هل يحتاج المزوّد مفاتيح حقيقية قبل التفعيل؟ */
  readonly requiresCredentials: boolean;
  readonly requiredCredentialKeys: string[];
  createPayment(
    input: CreatePaymentInput,
    creds: ProviderCredentials,
  ): Promise<ProviderPaymentState>;
  verifyPayment(
    providerPaymentId: string,
    creds: ProviderCredentials,
  ): Promise<ProviderPaymentState>;
  getPaymentStatus(
    providerPaymentId: string,
    creds: ProviderCredentials,
  ): Promise<ProviderPaymentState>;
  refundPayment(
    providerPaymentId: string,
    amount: number,
    creds: ProviderCredentials,
  ): Promise<{
    providerRefundId: string | null;
    status: "processing" | "completed" | "failed";
    raw: unknown;
  }>;
  validateWebhookSignature(input: {
    rawBody: string;
    headers: Record<string, string>;
    creds: ProviderCredentials;
  }): boolean;
  handleWebhook(rawBody: string): WebhookEvent;
  /** اختبار اتصال حقيقي — لا يُفعّل المزوّد إلا عند نجاحه. */
  testConnection(creds: ProviderCredentials): Promise<{ ok: boolean; message: string }>;
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/* --------------------------------------------------------- التحصيل اليدوي */

/**
 * التحصيل اليدوي/التحويل البنكي: لا يوجد اتصال خارجي.
 * الدفعة تُسجّل بانتظار اعتماد إداري مسجّل في سجل التدقيق.
 */
const manualProvider: PaymentProvider = {
  code: "manual",
  requiresCredentials: false,
  requiredCredentialKeys: [],
  async createPayment(input) {
    return {
      providerPaymentId: null,
      status: "pending",
      amount: input.amount,
      reference: null,
      raw: { mode: "manual" },
    };
  },
  async verifyPayment() {
    throw new Error("التحصيل اليدوي يُعتمد بقرار إداري مسجّل، ولا يمر بتحقق مزوّد.");
  },
  async getPaymentStatus() {
    throw new Error("لا توجد حالة خارجية للتحصيل اليدوي.");
  },
  async refundPayment() {
    return { providerRefundId: null, status: "completed", raw: { mode: "manual" } };
  },
  validateWebhookSignature() {
    return false;
  },
  handleWebhook() {
    throw new Error("التحصيل اليدوي لا يستقبل رسائل مزوّد.");
  },
  async testConnection() {
    return { ok: true, message: "التحصيل اليدوي جاهز دائماً." };
  },
};

/* ---------------------------------------------------------------- مُيسّر */

const MOYASAR_BASE = "https://api.moyasar.com/v1";

function moyasarAuth(creds: ProviderCredentials): string {
  const key = creds["secret_key"] ?? "";
  if (!key) throw new Error("مفاتيح مُيسّر غير مُعرّفة.");
  return `Basic ${Buffer.from(`${key}:`).toString("base64")}`;
}

type MoyasarPayment = {
  id?: string;
  status?: string;
  amount?: number;
  invoice_id?: string;
  source?: { transaction_url?: string; message?: string };
  refunded?: number;
};

function mapMoyasarStatus(
  status: string | undefined,
  refunded?: number,
  amount?: number,
): ProviderPaymentState["status"] {
  switch (status) {
    case "paid":
      if (refunded && amount && refunded >= amount) return "refunded";
      if (refunded && refunded > 0) return "partially_refunded";
      return "paid";
    case "authorized":
    case "initiated":
      return "processing";
    case "failed":
      return "failed";
    case "voided":
      return "cancelled";
    case "refunded":
      return "refunded";
    default:
      return "pending";
  }
}

async function moyasarRequest(
  path: string,
  creds: ProviderCredentials,
  init?: { method?: string; body?: Record<string, unknown> },
): Promise<{ status: number; json: unknown }> {
  const response = await fetch(`${MOYASAR_BASE}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: moyasarAuth(creds),
      "Content-Type": "application/json",
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await response.text();
  let json: unknown = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text.slice(0, 2000) };
  }
  return { status: response.status, json };
}

const moyasarProvider: PaymentProvider = {
  code: "moyasar",
  requiresCredentials: true,
  requiredCredentialKeys: ["secret_key", "webhook_secret"],
  async createPayment(input, creds) {
    const { status, json } = await moyasarRequest("/invoices", creds, {
      method: "POST",
      body: {
        amount: Math.round(input.amount * 100),
        currency: input.currency,
        description: input.description,
        callback_url: input.callbackUrl,
        metadata: {
          invoice_id: input.invoiceId,
          invoice_number: input.invoiceNumber,
          correlation_id: input.correlationId,
        },
      },
    });
    const body = json as { id?: string; status?: string; url?: string; message?: string };
    if (status >= 400 || !body.id) {
      return {
        providerPaymentId: null,
        status: "failed",
        amount: input.amount,
        reference: null,
        raw: json,
        failureCode: String(status),
        failureMessage: body.message ?? "تعذّر إنشاء عملية الدفع عند المزوّد.",
      };
    }
    return {
      providerPaymentId: body.id,
      status: "processing",
      amount: input.amount,
      reference: body.id,
      raw: json,
      redirectUrl: body.url ?? null,
    };
  },
  async verifyPayment(providerPaymentId, creds) {
    return moyasarProvider.getPaymentStatus(providerPaymentId, creds);
  },
  async getPaymentStatus(providerPaymentId, creds) {
    const { status, json } = await moyasarRequest(
      `/payments/${encodeURIComponent(providerPaymentId)}`,
      creds,
    );
    const body = json as MoyasarPayment;
    if (status >= 400) {
      return {
        providerPaymentId,
        status: "failed",
        amount: null,
        reference: null,
        raw: json,
        failureCode: String(status),
        failureMessage: body.source?.message ?? "تعذّر قراءة حالة العملية.",
      };
    }
    return {
      providerPaymentId: body.id ?? providerPaymentId,
      status: mapMoyasarStatus(body.status, body.refunded, body.amount),
      amount: body.amount ? body.amount / 100 : null,
      reference: body.id ?? null,
      raw: json,
    };
  },
  async refundPayment(providerPaymentId, amount, creds) {
    const { status, json } = await moyasarRequest(
      `/payments/${encodeURIComponent(providerPaymentId)}/refund`,
      creds,
      {
        method: "POST",
        body: { amount: Math.round(amount * 100) },
      },
    );
    const body = json as MoyasarPayment;
    return {
      providerRefundId: body.id ?? null,
      status: status >= 400 ? "failed" : "completed",
      raw: json,
    };
  },
  validateWebhookSignature({ rawBody, headers, creds }) {
    const secret = creds["webhook_secret"] ?? "";
    if (!secret) return false;
    const provided = headers["x-moyasar-signature"] ?? headers["x-signature"] ?? "";
    if (!provided) {
      // مُيسّر يدعم أيضاً التحقق عبر سرّ داخل الحمولة
      try {
        const body = JSON.parse(rawBody) as { secret_token?: string };
        return Boolean(body.secret_token) && safeEqual(body.secret_token ?? "", secret);
      } catch {
        return false;
      }
    }
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    return safeEqual(provided.trim(), expected);
  },
  handleWebhook(rawBody) {
    const body = JSON.parse(rawBody) as {
      id?: string;
      type?: string;
      created_at?: string;
      data?: MoyasarPayment;
    };
    const payment = body.data ?? {};
    return {
      eventId: body.id ?? payment.id ?? null,
      eventType: body.type ?? null,
      providerPaymentId: payment.id ?? null,
      status: mapMoyasarStatus(payment.status, payment.refunded, payment.amount),
      amount: payment.amount ? payment.amount / 100 : null,
      occurredAt: body.created_at ?? null,
      raw: body,
    };
  },
  async testConnection(creds) {
    try {
      const { status, json } = await moyasarRequest("/payments?per=1", creds);
      if (status === 401 || status === 403)
        return { ok: false, message: "المفاتيح مرفوضة من المزوّد." };
      if (status >= 400) return { ok: false, message: `المزوّد أعاد الحالة ${status}.` };
      void json;
      return { ok: true, message: "تم الاتصال بالمزوّد بنجاح." };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "تعذّر الاتصال بالمزوّد.",
      };
    }
  },
};

const PROVIDERS: Record<ProviderCode, PaymentProvider> = {
  manual: manualProvider,
  moyasar: moyasarProvider,
};

export function getProvider(code: string): PaymentProvider {
  const provider = PROVIDERS[code as ProviderCode];
  if (!provider) throw new Error("مزوّد دفع غير معروف.");
  return provider;
}

export function listProviderCodes(): ProviderCode[] {
  return Object.keys(PROVIDERS) as ProviderCode[];
}
