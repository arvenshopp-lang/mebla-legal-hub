/**
 * استقبال ومعالجة رسائل مزودي الدفع (Webhooks).
 *
 * الضمانات:
 * - قائمة سماح للمزودين: لا يُقبل إلا مزوّد مُعرّف يدعم الرسائل الواردة.
 * - تحقق توقيع إلزامي قبل أي معالجة.
 * - منع التكرار (Idempotency) وحماية إعادة الإرسال (Replay) بمعرّف الحدث.
 * - عدم تكرار احتساب الدفعة: التحديث يتم بالمعرّف الخارجي فقط داخل المحرك.
 * - Payload يُحفظ بعد إخفاء الحقول الحساسة.
 * - طابور إعادة محاولة ثم طابور رسائل فاشلة نهائياً (Dead Letter).
 * - تحديد معدل الطلبات، وسجل نجاح/فشل، ولا تُكشف أي أسرار أو أثر تنفيذ.
 */
import { getProvider } from "./providers.server";
import {
  applyProviderPaymentState,
  logAttempt,
  newCorrelationId,
  type BillingCtx,
} from "./billing.server";
import type { BillingRow } from "./billing.shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

const MAX_BODY_BYTES = 64 * 1024;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_PER_WINDOW = 120;
const MAX_ATTEMPTS = 5;
const RETRY_BACKOFF_MS = [60_000, 300_000, 900_000, 3_600_000, 10_800_000];

const SENSITIVE_KEY =
  /(secret|token|password|api[_-]?key|authorization|cvv|cvc|pan|iban|card[_-]?number|number$)/i;

async function db(): Promise<AnyClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as AnyClient;
}

/** إخفاء الحقول الحساسة قبل الحفظ — يُحتفظ بآخر 4 خانات فقط عند وجود قيمة. */
export function maskSensitive(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[عميق]";
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => maskSensitive(item, depth + 1));
  if (value && typeof value === "object") {
    const out: BillingRow = {};
    for (const [key, raw] of Object.entries(value as BillingRow)) {
      if (SENSITIVE_KEY.test(key)) {
        const text = typeof raw === "string" ? raw : "";
        out[key] = text.length > 4 ? `••••${text.slice(-4)}` : "••••";
      } else {
        out[key] = maskSensitive(raw, depth + 1) as never;
      }
    }
    return out;
  }
  if (typeof value === "string") return value.length > 2000 ? `${value.slice(0, 2000)}…` : value;
  return value;
}

const SAFE_HEADERS = [
  "content-type",
  "user-agent",
  "cf-ray",
  "x-request-id",
  "x-moyasar-signature",
  "x-forwarded-for",
];

function safeHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (!SAFE_HEADERS.includes(lower)) return;
    out[lower] = lower.includes("signature")
      ? `${value.slice(0, 8)}…(${value.length})`
      : value.slice(0, 200);
  });
  return out;
}

function allHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}

type Outcome = { status: number; body: BillingRow };

const ok = (body: BillingRow = {}): Outcome => ({ status: 200, body: { received: true, ...body } });

/** المزوّدون المسموح لهم بإرسال رسائل واردة — يجب أن يكونوا مُعرّفين في قاعدة البيانات. */
const PROVIDER_ALLOWLIST = new Set(["moyasar"]);

export async function handleProviderWebhook(
  providerCode: string,
  request: Request,
): Promise<Outcome> {
  const correlationId = newCorrelationId("whk");
  const requestId =
    request.headers.get("cf-ray") ?? request.headers.get("x-request-id") ?? correlationId;
  const code = String(providerCode ?? "").toLowerCase();

  if (!PROVIDER_ALLOWLIST.has(code)) return { status: 404, body: { error: "مزوّد غير معروف." } };

  const client = await db();

  const { data: config } = await client
    .from("platform_payment_provider_configs")
    .select("code, supports_webhooks, settings")
    .eq("code", code)
    .maybeSingle();
  if (!config || !config.supports_webhooks)
    return { status: 404, body: { error: "مزوّد غير معروف." } };

  // تحديد معدل الطلبات لكل مزوّد
  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
  const { count: recent } = await client
    .from("platform_payment_webhooks")
    .select("id", { count: "exact", head: true })
    .eq("provider", code)
    .gte("received_at", since);
  if ((recent ?? 0) >= RATE_MAX_PER_WINDOW) {
    return { status: 429, body: { error: "تم تجاوز الحد المسموح مؤقتاً." } };
  }

  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES)
    return { status: 413, body: { error: "حجم الرسالة كبير جداً." } };

  const provider = getProvider(code);
  const headers = allHeaders(request.headers);
  const storedHeaders = safeHeaders(request.headers);

  // تحقق التوقيع قبل أي معالجة
  let signatureValid = false;
  try {
    const { IntegrationSecretVault } = await import("@/lib/integrations/vault.server");
    const settings = (config.settings ?? {}) as BillingRow;
    const reference =
      typeof settings["secret_reference"] === "string" && settings["secret_reference"]
        ? (settings["secret_reference"] as string)
        : `payment_provider_${code}`;
    const creds = await IntegrationSecretVault.getSecretsServerSide(reference);
    signatureValid = provider.validateWebhookSignature({ rawBody, headers, creds });
  } catch {
    signatureValid = false;
  }

  let parsed: ReturnType<typeof provider.handleWebhook> | null = null;
  try {
    parsed = provider.handleWebhook(rawBody);
  } catch {
    parsed = null;
  }

  let maskedBody = "{}";
  try {
    maskedBody = JSON.stringify(maskSensitive(JSON.parse(rawBody))).slice(0, 20_000);
  } catch {
    maskedBody = JSON.stringify({ note: "تعذّر تحليل الرسالة" });
  }

  if (!signatureValid) {
    await client.from("platform_payment_webhooks").insert({
      provider: code,
      event_id: parsed?.eventId ?? null,
      event_type: parsed?.eventType ?? null,
      signature_valid: false,
      replay_detected: false,
      request_id: requestId,
      correlation_id: correlationId,
      raw_headers: storedHeaders as never,
      raw_body: maskedBody,
      status: "failed",
      last_error: "توقيع غير صالح",
      attempts: 0,
    });
    await logAttempt({
      provider: code,
      operation: "webhook",
      status: "failed",
      errorCode: "INVALID_SIGNATURE",
      errorMessage: "توقيع غير صالح",
      requestId,
      correlationId,
      response: { signature_valid: false },
    });
    return { status: 401, body: { error: "توقيع غير صالح." } };
  }

  // منع التكرار وحماية إعادة الإرسال
  if (parsed?.eventId) {
    const { data: existing } = await client
      .from("platform_payment_webhooks")
      .select("id, status")
      .eq("provider", code)
      .eq("event_id", parsed.eventId)
      .in("status", ["processed", "ignored"])
      .maybeSingle();
    if (existing) {
      await client.from("platform_payment_webhooks").insert({
        provider: code,
        event_id: parsed.eventId,
        event_type: parsed.eventType ?? null,
        signature_valid: true,
        replay_detected: true,
        request_id: requestId,
        correlation_id: correlationId,
        raw_headers: storedHeaders as never,
        raw_body: maskedBody,
        status: "ignored",
        last_error: "حدث مكرر — تم تجاهله دون احتساب الدفعة مرتين",
        processed_at: new Date().toISOString(),
        attempts: 0,
      });
      return ok({ duplicate: true });
    }
  }

  const { data: inserted } = await client
    .from("platform_payment_webhooks")
    .insert({
      provider: code,
      event_id: parsed?.eventId ?? null,
      event_type: parsed?.eventType ?? null,
      signature_valid: true,
      replay_detected: false,
      request_id: requestId,
      correlation_id: correlationId,
      raw_headers: storedHeaders as never,
      raw_body: maskedBody,
      status: "received",
      attempts: 0,
    })
    .select("id")
    .maybeSingle();

  const rowId = (inserted?.id as string | undefined) ?? null;
  const result = await processEvent({
    rowId,
    provider: code,
    correlationId,
    requestId,
    event: parsed,
    attempts: 0,
  });
  return result;
}

type ProcessInput = {
  rowId: string | null;
  provider: string;
  correlationId: string;
  requestId: string;
  event: {
    eventId: string | null;
    eventType: string | null;
    providerPaymentId: string | null;
    status: string | null;
    amount: number | null;
    currency?: string | null;
  } | null;
  attempts: number;
};

async function processEvent(input: ProcessInput): Promise<Outcome> {
  const client = await db();
  const started = Date.now();

  const finish = async (patch: BillingRow) => {
    if (input.rowId)
      await client.from("platform_payment_webhooks").update(patch).eq("id", input.rowId);
  };

  if (!input.event?.providerPaymentId || !input.event.status) {
    await finish({
      status: "ignored",
      processed_at: new Date().toISOString(),
      last_error: "حدث غير مرتبط بدفعة",
    });
    return ok({ ignored: true });
  }

  try {
    const applied = await applyProviderPaymentState({
      provider: input.provider,
      providerPaymentId: input.event.providerPaymentId,
      status: input.event.status as never,
      amount: input.event.amount,
      currency: input.event.currency ?? null,
      correlationId: input.correlationId,
    });
    await finish({
      status: applied.applied ? "processed" : "ignored",
      payment_id: applied.paymentId,
      invoice_id: applied.invoiceId,
      processed_at: new Date().toISOString(),
      last_error: applied.applied ? null : "لا توجد دفعة مطابقة للمعرّف الخارجي",
      next_retry_at: null,
    });
    await logAttempt({
      paymentId: applied.paymentId,
      invoiceId: applied.invoiceId,
      provider: input.provider,
      operation: "webhook",
      status: "success",
      providerStatus: input.event.status,
      requestId: input.requestId,
      correlationId: input.correlationId,
      response: { applied: applied.applied },
      durationMs: Date.now() - started,
    });
    return ok({ processed: applied.applied });
  } catch (error) {
    const attempts = input.attempts + 1;
    const dead = attempts >= MAX_ATTEMPTS;
    const backoff = RETRY_BACKOFF_MS[Math.min(attempts - 1, RETRY_BACKOFF_MS.length - 1)] ?? 60_000;
    const message = error instanceof Error ? error.message : "خطأ غير معروف";
    await finish({
      status: dead ? "dead_letter" : "failed",
      attempts,
      last_error: message.slice(0, 300),
      next_retry_at: dead ? null : new Date(Date.now() + backoff).toISOString(),
    });
    await logAttempt({
      provider: input.provider,
      operation: "webhook",
      status: "failed",
      errorCode: dead ? "DEAD_LETTER" : "RETRY_SCHEDULED",
      errorMessage: message.slice(0, 300),
      requestId: input.requestId,
      correlationId: input.correlationId,
      durationMs: Date.now() - started,
    });
    // نُعيد 200 حتى لا يُغرق المزوّد المسار؛ إعادة المحاولة تتم من طابورنا الداخلي.
    return ok({ queued: true });
  }
}

/** إعادة معالجة الرسائل الفاشلة المستحقة، ثم ترحيل المستنفدة إلى طابور الرسائل الفاشلة نهائياً. */
export async function processRetryQueue(
  limit = 20,
): Promise<{ retried: number; processed: number; deadLetter: number }> {
  const client = await db();
  const { data } = await client
    .from("platform_payment_webhooks")
    .select("id, provider, event_id, event_type, raw_body, attempts, correlation_id, request_id")
    .eq("status", "failed")
    .lte("next_retry_at", new Date().toISOString())
    .order("next_retry_at")
    .limit(Math.min(Math.max(limit, 1), 50));

  const rows = (data ?? []) as BillingRow[];
  let processed = 0;
  let deadLetter = 0;

  for (const row of rows) {
    const provider = getProvider(row["provider"] as string);
    let event: ProcessInput["event"] = null;
    try {
      event = provider.handleWebhook(String(row["raw_body"] ?? "{}")) as never;
    } catch {
      event = null;
    }
    const outcome = await processEvent({
      rowId: row["id"] as string,
      provider: row["provider"] as string,
      correlationId: (row["correlation_id"] as string) ?? newCorrelationId("whk"),
      requestId: (row["request_id"] as string) ?? "retry",
      event,
      attempts: Number(row["attempts"] ?? 0),
    });
    if (outcome.body["processed"]) processed += 1;
    const { data: after } = await client
      .from("platform_payment_webhooks")
      .select("status")
      .eq("id", row["id"])
      .maybeSingle();
    if (after?.status === "dead_letter") deadLetter += 1;
  }

  return { retried: rows.length, processed, deadLetter };
}

export async function listWebhookEvents(
  _ctx: BillingCtx,
  filters: {
    status?: string | null;
    provider?: string | null;
    search?: string | null;
    page: number;
    pageSize: number;
  },
): Promise<{ rows: BillingRow[]; total: number }> {
  const client = await db();
  let query = client
    .from("platform_payment_webhooks")
    .select(
      "id, provider, event_id, event_type, signature_valid, replay_detected, status, attempts, last_error, next_retry_at, processed_at, received_at, payment_id, invoice_id, correlation_id",
      { count: "exact" },
    );
  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.provider && filters.provider !== "all")
    query = query.eq("provider", filters.provider);
  const search = filters.search?.trim();
  if (search) {
    const safe = search.replace(/[%,()]/g, " ");
    query = query.or(
      `event_id.ilike.%${safe}%,event_type.ilike.%${safe}%,correlation_id.ilike.%${safe}%`,
    );
  }
  const from = (filters.page - 1) * filters.pageSize;
  const { data, count } = await query
    .order("received_at", { ascending: false })
    .range(from, from + filters.pageSize - 1);
  return { rows: (data ?? []) as BillingRow[], total: count ?? 0 };
}

/* ------------------------------------------------------ الإجراءات الإدارية */

const WEBHOOK_DETAIL_COLUMNS =
  "id, provider, event_id, event_type, signature_valid, replay_detected, status, attempts, last_error, next_retry_at, processed_at, received_at, payment_id, invoice_id, correlation_id, request_id, raw_headers, raw_body";

/**
 * تفاصيل رسالة واردة — الحمولة تُعاد منقّحة مرة أخرى قبل الخروج من الخادم
 * حتى لو كانت مخزّنة منقّحة أصلاً (طبقة حماية ثانية).
 */
export async function getWebhookDetail(_ctx: BillingCtx, id: string): Promise<BillingRow> {
  const client = await db();
  const { data } = await client
    .from("platform_payment_webhooks")
    .select(WEBHOOK_DETAIL_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (!data) throw new Error("الرسالة غير موجودة.");
  const row = data as BillingRow;
  let payload: unknown = { note: "لا توجد حمولة قابلة للعرض." };
  try {
    payload = maskSensitive(JSON.parse(String(row["raw_body"] ?? "{}")));
  } catch {
    payload = { note: "تعذّر تحليل الحمولة." };
  }
  return {
    ...row,
    raw_body: JSON.stringify(payload, null, 2).slice(0, 20_000),
    raw_headers: maskSensitive(row["raw_headers"] ?? {}) as never,
  };
}

async function auditWebhook(
  ctx: BillingCtx,
  row: BillingRow,
  action: string,
  description: string,
  after: BillingRow,
): Promise<void> {
  const client = await db();
  const { writeAudit } = await import("@/lib/admin-guard.server");
  await writeAudit(client, ctx.staff, {
    action,
    entity_type: "payment_webhook",
    entity_id: row["id"] as string,
    description,
    metadata: {
      correlationId: ctx.correlationId,
      requestId: ctx.requestId,
      provider: row["provider"] as string,
      eventId: (row["event_id"] as string | null) ?? null,
    },
    before: { status: row["status"], attempts: row["attempts"] },
    after,
  });
}

async function webhookRow(id: string): Promise<BillingRow> {
  const client = await db();
  const { data } = await client
    .from("platform_payment_webhooks")
    .select(
      "id, provider, event_id, event_type, status, attempts, raw_body, correlation_id, request_id",
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) throw new Error("الرسالة غير موجودة.");
  return data as BillingRow;
}

/** إعادة معالجة رسالة واحدة يدوياً — لا يُعاد تحليل التوقيع لأن الرسالة موثّقة سابقاً. */
export async function retryWebhookEvent(
  ctx: BillingCtx,
  id: string,
): Promise<{ processed: boolean; status: string }> {
  const client = await db();
  const row = await webhookRow(id);
  const status = String(row["status"]);
  if (status === "processed") throw new Error("الرسالة مُعالجة مسبقاً.");
  if (status === "dead_letter") throw new Error("أعِد فتح الرسالة أولاً قبل إعادة المحاولة.");

  const provider = getProvider(row["provider"] as string);
  type ParsedEvent = {
    eventId: string | null;
    eventType: string | null;
    providerPaymentId: string | null;
    status: string | null;
    amount: number | null;
    currency?: string | null;
  };
  let parsed: ParsedEvent | null = null;
  try {
    parsed = provider.handleWebhook(String(row["raw_body"] ?? "{}")) as ParsedEvent | null;
  } catch {
    parsed = null;
  }

  let processed = false;
  let nextStatus = "ignored";
  let lastError: string | null = "حدث غير مرتبط بدفعة";
  let paymentId: string | null = null;
  let invoiceId: string | null = null;

  if (parsed?.providerPaymentId && parsed.status) {
    try {
      const applied = await applyProviderPaymentState({
        provider: row["provider"] as string,
        providerPaymentId: parsed.providerPaymentId,
        status: parsed.status as never,
        amount: parsed.amount,
        currency: parsed.currency ?? null,
        correlationId: ctx.correlationId,
      });
      processed = applied.applied;
      paymentId = applied.paymentId;
      invoiceId = applied.invoiceId;
      nextStatus = applied.applied ? "processed" : "ignored";
      lastError = applied.applied ? null : "لا توجد دفعة مطابقة للمعرّف الخارجي";
    } catch (error) {
      nextStatus = "failed";
      lastError = (error instanceof Error ? error.message : "خطأ غير معروف").slice(0, 300);
    }
  }

  await client
    .from("platform_payment_webhooks")
    .update({
      status: nextStatus,
      attempts: Number(row["attempts"] ?? 0) + 1,
      payment_id: paymentId,
      invoice_id: invoiceId,
      last_error: lastError,
      processed_at: nextStatus === "processed" ? new Date().toISOString() : null,
      next_retry_at: nextStatus === "failed" ? new Date(Date.now() + 60_000).toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  await logAttempt({
    paymentId,
    invoiceId,
    provider: row["provider"] as string,
    operation: "webhook_manual_retry",
    status: nextStatus === "processed" ? "success" : "failed",
    requestId: ctx.requestId,
    correlationId: ctx.correlationId,
    errorMessage: lastError,
  });
  await auditWebhook(ctx, row, "billing.webhook.retry", "إعادة معالجة رسالة مزوّد دفع يدوياً", {
    status: nextStatus,
    processed,
  });
  return { processed, status: nextStatus };
}

/** ترحيل رسالة إلى طابور الرسائل الفاشلة نهائياً بسبب مُسجّل. */
export async function markWebhookDeadLetter(
  ctx: BillingCtx,
  input: { id: string; reason: string },
): Promise<void> {
  const client = await db();
  const row = await webhookRow(input.id);
  if (String(row["status"]) === "processed") throw new Error("لا يمكن ترحيل رسالة مُعالجة.");
  await client
    .from("platform_payment_webhooks")
    .update({
      status: "dead_letter",
      next_retry_at: null,
      last_error: input.reason.slice(0, 300),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id);
  await auditWebhook(
    ctx,
    row,
    "billing.webhook.dead_letter",
    "ترحيل رسالة مزوّد دفع إلى الطابور الفاشل نهائياً",
    {
      status: "dead_letter",
      reason: input.reason,
    },
  );
}

/** إعادة فتح رسالة فاشلة نهائياً بعد معالجة سبب الفشل. */
export async function reopenWebhookEvent(
  ctx: BillingCtx,
  input: { id: string; reason: string },
): Promise<void> {
  const client = await db();
  const row = await webhookRow(input.id);
  if (String(row["status"]) !== "dead_letter")
    throw new Error("الرسالة ليست في الطابور الفاشل نهائياً.");
  await client
    .from("platform_payment_webhooks")
    .update({
      status: "failed",
      attempts: 0,
      next_retry_at: new Date().toISOString(),
      last_error: `أُعيد فتحها: ${input.reason.slice(0, 200)}`,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id);
  await auditWebhook(
    ctx,
    row,
    "billing.webhook.reopen",
    "إعادة فتح رسالة من الطابور الفاشل نهائياً",
    {
      status: "failed",
      reason: input.reason,
    },
  );
}
