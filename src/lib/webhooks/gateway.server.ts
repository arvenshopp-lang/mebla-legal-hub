/**
 * محرك بوابة الويب هوك — الطبقة الأمنية الوحيدة لكل المزوّدين.
 *
 * ترتيب صريح لا يتغيّر:
 *  1) وجود المزوّد في `webhook_endpoints` وكونه مفعّلاً (Fail-closed).
 *  2) حد معدّل لكل مزوّد في نافذة دقيقة واحدة.
 *  3) تحقّق إلزامي من المُستدعي: HMAC-SHA256 على الجسم الخام، أو رمز سرّي
 *     في ترويسة — والمقارنة ثابتة الزمن في الحالتين.
 *  4) حماية إعادة الإرسال: نافذة زمنية + بصمة الحمولة.
 *  5) Idempotency عبر معرّف الحدث لدى المزوّد.
 *  6) الترجمة عبر المُحوِّل ثم التسليم للمُوجِّه الداخلي.
 *  7) تسجيل كل استدعاء في `webhook_events` بحمولة منقّحة.
 *
 * الاستجابة دائماً موجزة: لا أسرار ولا تفاصيل داخلية ولا أثر تنفيذ.
 */
import { getWebhookAdapter } from "./adapters/registry.server";
import { dispatchNormalizedEvents } from "./dispatch.server";
import { IntegrationSecretVault } from "@/lib/integrations/vault.server";
import {
  WEBHOOK_SECRET_FIELD,
  WEBHOOK_URL_TOKEN_PARAM,
  type WebhookEventStatus,
} from "./webhooks.shared";

const MAX_BODY_BYTES = 512 * 1024;
const REPLAY_WINDOW_SECONDS = 300;
const DUPLICATE_BODY_WINDOW_MS = 60_000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export type EndpointRow = {
  id: string;
  slug: string;
  display_name: string;
  adapter_type: string;
  verification_mode: "hmac_sha256" | "shared_secret" | "url_token";
  signature_header: string;
  timestamp_header: string | null;
  signing_secret: string | null;
  is_enabled: boolean;
  test_mode: boolean;
  rate_limit_per_minute: number;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacHex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function clientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    ""
  );
}

async function db(): Promise<Db> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Db;
}

async function logEvent(
  client: Db,
  entry: {
    endpointId: string | null;
    slug: string;
    adapterType: string | null;
    status: WebhookEventStatus;
    payloadHash: string;
    requestIp: string;
    signatureValid?: boolean;
    replayDetected?: boolean;
    eventType?: string | null;
    providerEventId?: string | null;
    rejectReason?: string | null;
    lastError?: string | null;
    redactedPayload?: Record<string, unknown>;
    processedAt?: string | null;
    attempts?: number;
  },
): Promise<void> {
  try {
    await client.from("webhook_events").insert({
      endpoint_id: entry.endpointId,
      slug: entry.slug,
      adapter_type: entry.adapterType,
      event_type: entry.eventType ?? null,
      provider_event_id: entry.providerEventId ?? null,
      status: entry.status,
      attempts: entry.attempts ?? 1,
      signature_valid: entry.signatureValid ?? false,
      replay_detected: entry.replayDetected ?? false,
      payload_hash: entry.payloadHash,
      redacted_payload: entry.redactedPayload ?? {},
      reject_reason: entry.rejectReason ?? null,
      last_error: entry.lastError ?? null,
      request_ip: entry.requestIp,
      processed_at: entry.processedAt ?? null,
    });
  } catch (error) {
    console.error("[webhooks] audit", error instanceof Error ? error.message : error);
  }
}

async function resolveSecret(endpoint: EndpointRow): Promise<string | null> {
  const reference = endpoint.signing_secret;
  if (!reference) return null;
  try {
    return await IntegrationSecretVault.getSecretServerSide(reference, WEBHOOK_SECRET_FIELD);
  } catch {
    return null;
  }
}

/** استجابة تحقّق للمزوّد (GET) — لا تكشف أي بيانات ولا تؤكد وجود سرّ. */
export async function handleWebhookVerification(slug: string, request: Request): Promise<Response> {
  const client = await db();
  const { data } = await client
    .from("webhook_endpoints")
    .select("slug, is_enabled")
    .eq("slug", slug)
    .maybeSingle();
  const row = data as { slug: string; is_enabled: boolean } | null;
  if (!row) return json({ error: "unknown_endpoint" }, 404);
  const challenge = new URL(request.url).searchParams.get("challenge");
  return json({ ok: true, endpoint: row.slug, enabled: row.is_enabled, challenge });
}

/** المعالجة الكاملة لطلب POST قادم من مزوّد. */
export async function handleIncomingWebhook(slug: string, request: Request): Promise<Response> {
  const ip = clientIp(request);
  const client = await db();

  const { data } = await client
    .from("webhook_endpoints")
    .select(
      "id, slug, display_name, adapter_type, verification_mode, signature_header, timestamp_header, signing_secret, is_enabled, test_mode, rate_limit_per_minute",
    )
    .eq("slug", slug)
    .maybeSingle();
  const endpoint = data as EndpointRow | null;

  const raw = await request.text();
  const payloadHash = await sha256Hex(raw || "empty");

  if (!endpoint) return json({ error: "unknown_endpoint" }, 404);

  if (raw.length > MAX_BODY_BYTES) {
    await logEvent(client, {
      endpointId: endpoint.id,
      slug,
      adapterType: endpoint.adapter_type,
      status: "failed",
      payloadHash,
      requestIp: ip,
      rejectReason: "حجم الحمولة أكبر من الحد المسموح",
    });
    return json({ error: "payload_too_large" }, 413);
  }

  if (!endpoint.is_enabled) {
    await logEvent(client, {
      endpointId: endpoint.id,
      slug,
      adapterType: endpoint.adapter_type,
      status: "unauthorized",
      payloadHash,
      requestIp: ip,
      rejectReason: "المزوّد معطّل في لوحة الإدارة",
    });
    return json({ error: "endpoint_disabled" }, 403);
  }

  /* 2) حد المعدّل لكل مزوّد */
  const windowStart = new Date(Date.now() - 60_000).toISOString();
  const { count: recent } = await client
    .from("webhook_events")
    .select("id", { count: "exact", head: true })
    .eq("slug", slug)
    .gte("received_at", windowStart);
  if ((recent ?? 0) >= endpoint.rate_limit_per_minute) {
    await logEvent(client, {
      endpointId: endpoint.id,
      slug,
      adapterType: endpoint.adapter_type,
      status: "rate_limited",
      payloadHash,
      requestIp: ip,
      rejectReason: "تجاوز حد الاستدعاءات في الدقيقة",
    });
    return json({ error: "rate_limited" }, 429);
  }

  /* 3) التحقق من المُستدعي — الرفض هو الوضع الافتراضي */
  const secret = await resolveSecret(endpoint);
  if (!secret) {
    await logEvent(client, {
      endpointId: endpoint.id,
      slug,
      adapterType: endpoint.adapter_type,
      status: "unauthorized",
      payloadHash,
      requestIp: ip,
      rejectReason: "سرّ التحقق غير مهيأ على الخادم",
    });
    return json({ error: "unauthorized" }, 401);
  }

  const provided = (request.headers.get(endpoint.signature_header) ?? "").trim();
  if (endpoint.verification_mode === "hmac_sha256") {
    const timestampHeader = endpoint.timestamp_header
      ? (request.headers.get(endpoint.timestamp_header) ?? "")
      : "";
    const signature = provided.replace(/^sha256=/i, "").toLowerCase();
    if (!signature) {
      await logEvent(client, {
        endpointId: endpoint.id,
        slug,
        adapterType: endpoint.adapter_type,
        status: "unauthorized",
        payloadHash,
        requestIp: ip,
        rejectReason: "توقيع مفقود",
      });
      return json({ error: "unauthorized" }, 401);
    }
    if (endpoint.timestamp_header) {
      const ts = Number(timestampHeader);
      if (!Number.isFinite(ts)) {
        await logEvent(client, {
          endpointId: endpoint.id,
          slug,
          adapterType: endpoint.adapter_type,
          status: "unauthorized",
          payloadHash,
          requestIp: ip,
          rejectReason: "طابع زمني مفقود أو غير صالح",
        });
        return json({ error: "unauthorized" }, 401);
      }
      const seconds = ts > 1e12 ? ts / 1000 : ts;
      if (Math.abs(Date.now() / 1000 - seconds) > REPLAY_WINDOW_SECONDS) {
        await logEvent(client, {
          endpointId: endpoint.id,
          slug,
          adapterType: endpoint.adapter_type,
          status: "replayed",
          payloadHash,
          requestIp: ip,
          replayDetected: true,
          rejectReason: "طابع زمني خارج نافذة 5 دقائق",
        });
        return json({ error: "stale_timestamp" }, 401);
      }
    }
    const expected = await hmacHex(
      secret,
      endpoint.timestamp_header ? `${timestampHeader}.${raw}` : raw,
    );
    if (!safeEqual(signature, expected)) {
      await logEvent(client, {
        endpointId: endpoint.id,
        slug,
        adapterType: endpoint.adapter_type,
        status: "unauthorized",
        payloadHash,
        requestIp: ip,
        rejectReason: "توقيع غير مطابق",
      });
      return json({ error: "unauthorized" }, 401);
    }
  } else if (endpoint.verification_mode === "url_token") {
    // المزوّد لا يرسل ترويسات، فالمفتاح داخل الرابط هو بيانات الاعتماد.
    // لا يُسجَّل المفتاح ولا الرابط الكامل في أي سجل.
    const token = (new URL(request.url).searchParams.get(WEBHOOK_URL_TOKEN_PARAM) ?? "").trim();
    if (!token || !safeEqual(token, secret)) {
      await logEvent(client, {
        endpointId: endpoint.id,
        slug,
        adapterType: endpoint.adapter_type,
        status: "unauthorized",
        payloadHash,
        requestIp: ip,
        rejectReason: "مفتاح الرابط غير مطابق أو مفقود",
      });
      return json({ error: "unauthorized" }, 401);
    }
  } else if (!provided || !safeEqual(provided, secret)) {
    await logEvent(client, {
      endpointId: endpoint.id,
      slug,
      adapterType: endpoint.adapter_type,
      status: "unauthorized",
      payloadHash,
      requestIp: ip,
      rejectReason: "رمز سرّي غير مطابق",
    });
    return json({ error: "unauthorized" }, 401);
  }

  /* 4) إعادة إرسال نفس الحمولة الحرفية خلال نافذة قصيرة */
  const duplicateWindow = new Date(Date.now() - DUPLICATE_BODY_WINDOW_MS).toISOString();
  const { data: replayRows } = await client
    .from("webhook_events")
    .select("id")
    .eq("slug", slug)
    .eq("payload_hash", payloadHash)
    .gte("received_at", duplicateWindow)
    .limit(1);
  if ((replayRows ?? []).length > 0) {
    return json({ ok: true, duplicate: true });
  }

  const adapter = getWebhookAdapter(endpoint.adapter_type);
  let payload: unknown;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    // بعض المزوّدين يفحصون الاتصال بطلب بلا جسم JSON — يُسجَّل كفحص ويُرَد بنجاح
    // بعد نجاح التحقق، حتى لا يظهر الرابط لديهم كغير قابل للوصول.
    const trimmed = raw.trim();
    const looksLikeJson = trimmed.startsWith("{") || trimmed.startsWith("[");
    if (!looksLikeJson) {
      await logEvent(client, {
        endpointId: endpoint.id,
        slug,
        adapterType: endpoint.adapter_type,
        status: "ignored",
        payloadHash,
        requestIp: ip,
        signatureValid: true,
        eventType: "connection.test",
        processedAt: null,
      });
      return json({ ok: true, test: true });
    }
    await logEvent(client, {
      endpointId: endpoint.id,
      slug,
      adapterType: endpoint.adapter_type,
      status: "failed",
      payloadHash,
      requestIp: ip,
      signatureValid: true,
      rejectReason: "الحمولة ليست JSON صالحاً",
    });
    return json({ error: "invalid_payload" }, 400);
  }

  const redacted = adapter.redact(payload);
  const events = adapter.normalize(payload);
  const primary = events[0] ?? null;

  /* 5) Idempotency عبر معرّف الحدث لدى المزوّد */
  if (primary?.providerEventId) {
    const { data: existing } = await client
      .from("webhook_events")
      .select("id")
      .eq("slug", slug)
      .eq("provider_event_id", primary.providerEventId)
      .limit(1);
    if ((existing ?? []).length > 0) {
      return json({ ok: true, duplicate: true });
    }
  }

  /* 6) التسليم للمُوجِّه الداخلي */
  const correlationId = crypto.randomUUID().replace(/-/g, "");
  const outcome = await dispatchNormalizedEvents(events, {
    slug,
    adapterType: endpoint.adapter_type,
    testMode: endpoint.test_mode,
    correlationId,
  });

  await logEvent(client, {
    endpointId: endpoint.id,
    slug,
    adapterType: endpoint.adapter_type,
    status: outcome.status,
    payloadHash,
    requestIp: ip,
    signatureValid: true,
    eventType: primary?.type ?? null,
    providerEventId: primary?.providerEventId ?? null,
    lastError: outcome.error ?? null,
    redactedPayload: redacted,
    processedAt: outcome.status === "processed" ? new Date().toISOString() : null,
  });

  await client
    .from("webhook_endpoints")
    .update({
      last_event_at: new Date().toISOString(),
      last_error: outcome.error ?? null,
    })
    .eq("id", endpoint.id);

  /* الفشل في معالج داخلي لا يُعاد للمزوّد كخطأ إن كان الحدث محفوظاً بالكامل */
  return json({ ok: true, received: events.length });
}
