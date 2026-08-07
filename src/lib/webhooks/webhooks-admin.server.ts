/**
 * منطق إدارة بوابة الويب هوك — خادم فقط.
 * لا تُعاد أسرار التحقق للمتصفح إلا مرة واحدة عند توليدها، لأنها سرّ مشترك
 * يجب على الموظف لصقه في لوحة المزوّد.
 */
import { IntegrationSecretVault, newSecretReference } from "@/lib/integrations/vault.server";
import { getWebhookAdapter } from "./adapters/registry.server";
import { dispatchNormalizedEvents } from "./dispatch.server";
import {
  WEBHOOK_SECRET_FIELD,
  maskWebhookSecret,
  buildWebhookUrl,
  type JsonValue,
  type WebhookEndpointView,
  type WebhookConnectionTestResult,
  type WebhookEventStatus,
  type WebhookEventView,
  type WebhookVerificationMode,
} from "./webhooks.shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

type EndpointRecord = {
  id: string;
  slug: string;
  display_name: string;
  adapter_type: string;
  verification_mode: WebhookVerificationMode;
  signature_header: string;
  timestamp_header: string | null;
  signing_secret: string | null;
  is_enabled: boolean;
  test_mode: boolean;
  rate_limit_per_minute: number;
  last_event_at: string | null;
  last_error: string | null;
  notes: string | null;
  created_at: string;
};

type EventRecord = {
  id: string;
  slug: string;
  adapter_type: string | null;
  event_type: string | null;
  provider_event_id: string | null;
  status: WebhookEventStatus;
  attempts: number;
  signature_valid: boolean;
  replay_detected: boolean;
  reject_reason: string | null;
  last_error: string | null;
  correlation_id: string;
  received_at: string;
  processed_at: string | null;
  redacted_payload: Record<string, unknown> | null;
};

export function publicWebhookUrl(origin: string, slug: string): string {
  return `${origin.replace(/\/$/, "")}/api/public/webhooks/${slug}`;
}

/** سرّ مشترك قوي: 32 بايت عشوائية بترميز سداسي عشري. */
export function generateWebhookSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function toEventView(row: EventRecord): WebhookEventView {
  return {
    id: row.id,
    slug: row.slug,
    adapterType: row.adapter_type,
    eventType: row.event_type,
    providerEventId: row.provider_event_id,
    status: row.status,
    attempts: row.attempts,
    signatureValid: row.signature_valid,
    replayDetected: row.replay_detected,
    rejectReason: row.reject_reason,
    lastError: row.last_error,
    correlationId: row.correlation_id,
    receivedAt: row.received_at,
    processedAt: row.processed_at,
    // الحمولة مخزّنة منقّحة أصلاً في قاعدة البيانات كـ JSONB، فهي قابلة للتسلسل بطبيعتها.
    redactedPayload: (row.redacted_payload ?? {}) as Record<string, JsonValue>,
  };
}

export async function readEndpoints(db: Db, origin: string): Promise<WebhookEndpointView[]> {
  const { data, error } = await db
    .from("webhook_endpoints")
    .select(
      "id, slug, display_name, adapter_type, verification_mode, signature_header, timestamp_header, signing_secret, is_enabled, test_mode, rate_limit_per_minute, last_event_at, last_error, notes, created_at",
    )
    .order("created_at", { ascending: true });
  if (error) throw new Error("تعذّر تحميل مزوّدي الويب هوك.");
  const rows = (data ?? []) as EndpointRecord[];

  const views: WebhookEndpointView[] = [];
  for (const row of rows) {
    const [{ count: total }, { count: failed }, { data: latestRows }] = await Promise.all([
      db.from("webhook_events").select("id", { count: "exact", head: true }).eq("slug", row.slug),
      db
        .from("webhook_events")
        .select("id", { count: "exact", head: true })
        .eq("slug", row.slug)
        .in("status", ["failed", "dead_letter", "unauthorized"]),
      db
        .from("webhook_events")
        .select("status, received_at")
        .eq("slug", row.slug)
        .order("received_at", { ascending: false })
        .limit(1),
    ]);
    const latest = ((latestRows ?? [])[0] ?? null) as {
      status: WebhookEventStatus;
      received_at: string;
    } | null;

    let secretHint: string | null = null;
    let secretRotatedAt: string | null = null;
    if (row.signing_secret) {
      const hints = await IntegrationSecretVault.listHints(row.signing_secret);
      const hint = hints.find(
        (item) => item.fieldKey === WEBHOOK_SECRET_FIELD && item.status === "active",
      );
      secretHint = hint?.hint ?? null;
      secretRotatedAt = hint?.rotatedAt ?? null;
    }

    views.push({
      id: row.id,
      slug: row.slug,
      displayName: row.display_name,
      adapterType: row.adapter_type,
      verificationMode: row.verification_mode,
      signatureHeader: row.signature_header,
      timestampHeader: row.timestamp_header,
      isEnabled: row.is_enabled,
      testMode: row.test_mode,
      rateLimitPerMinute: row.rate_limit_per_minute,
      hasSecret: Boolean(secretHint),
      secretHint,
      secretRotatedAt,
      lastEventAt: row.last_event_at,
      lastError: row.last_error,
      notes: row.notes,
      createdAt: row.created_at,
      url: publicWebhookUrl(origin, row.slug),
      eventsTotal: total ?? 0,
      eventsFailed: failed ?? 0,
      latestEventStatus: latest?.status ?? null,
      latestEventAt: latest?.received_at ?? null,
    });
  }
  return views;
}

/** يفحص المسار المنشور بنفس عقد Whats Line، دون إعادة السر أو الرابط للمتصفح. */
export async function testEndpointConnection(
  db: Db,
  endpointId: string,
): Promise<WebhookConnectionTestResult> {
  const { data } = await db
    .from("webhook_endpoints")
    .select("id, slug, signing_secret, verification_mode, signature_header, is_enabled")
    .eq("id", endpointId)
    .maybeSingle();
  const row = data as {
    id: string;
    slug: string;
    signing_secret: string | null;
    verification_mode: WebhookVerificationMode;
    signature_header: string;
    is_enabled: boolean;
  } | null;
  if (!row) throw new Error("المزوّد غير موجود.");
  if (!row.is_enabled) throw new Error("فعّل استقبال الأحداث قبل فحص الاتصال.");
  if (!row.signing_secret) throw new Error("ولّد سرّ التحقق قبل فحص الاتصال.");

  const secret = await IntegrationSecretVault.getSecretServerSide(
    row.signing_secret,
    WEBHOOK_SECRET_FIELD,
  );
  if (!secret) throw new Error("تعذّر قراءة سرّ التحقق من الخزنة الآمنة.");

  const url = buildWebhookUrl(row.slug, row.verification_mode === "url_token" ? secret : null);
  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
    "user-agent": "Mehla-Webhook-Connection-Test/1.0",
  };
  if (row.verification_mode === "shared_secret") headers[row.signature_header] = secret;

  const testedAt = new Date().toISOString();
  let status = 0;
  let ok = false;
  try {
    const response = await fetch(url, { method: "POST", headers, body: "" });
    status = response.status;
    ok = response.status === 200;
  } catch {
    ok = false;
  }

  const message = ok
    ? "تم الوصول إلى المسار المنشور والتحقق من المفتاح بنجاح."
    : status > 0
      ? `رفض المسار المنشور الفحص برمز HTTP ${status}. أعد توليد الرابط الكامل وانشر آخر نسخة.`
      : "تعذّر الوصول إلى المسار المنشور. تحقق من النطاق والنشر.";
  await db
    .from("webhook_endpoints")
    .update({ last_error: ok ? null : message })
    .eq("id", row.id);
  return { ok, status, testedAt, message };
}

export async function readEvents(
  db: Db,
  filters: { slug: string | null; status: string; page: number; pageSize: number },
): Promise<{ rows: WebhookEventView[]; total: number }> {
  let query = db
    .from("webhook_events")
    .select(
      "id, slug, adapter_type, event_type, provider_event_id, status, attempts, signature_valid, replay_detected, reject_reason, last_error, correlation_id, received_at, processed_at, redacted_payload",
      { count: "exact" },
    )
    .order("received_at", { ascending: false });
  if (filters.slug) query = query.eq("slug", filters.slug);
  if (filters.status !== "all") query = query.eq("status", filters.status);
  const from = (filters.page - 1) * filters.pageSize;
  const { data, count, error } = await query.range(from, from + filters.pageSize - 1);
  if (error) throw new Error("تعذّر تحميل سجل الأحداث الواردة.");
  return { rows: ((data ?? []) as EventRecord[]).map(toEventView), total: count ?? 0 };
}

/** توليد/تدوير سرّ التحقق. القيمة تُعاد مرة واحدة فقط لنسخها في لوحة المزوّد. */
export async function rotateEndpointSecret(
  db: Db,
  endpointId: string,
  actorId: string | null,
): Promise<{ secret: string; hint: string; slug: string; url: string }> {
  const { data } = await db
    .from("webhook_endpoints")
    .select("id, slug, signing_secret, verification_mode")
    .eq("id", endpointId)
    .maybeSingle();
  const row = data as {
    id: string;
    slug: string;
    signing_secret: string | null;
    verification_mode: WebhookVerificationMode;
  } | null;
  if (!row) throw new Error("المزوّد غير موجود.");

  const reference = row.signing_secret ?? newSecretReference();
  const secret = generateWebhookSecret();
  await IntegrationSecretVault.updateSecret(reference, WEBHOOK_SECRET_FIELD, secret, actorId);
  const { error } = await db
    .from("webhook_endpoints")
    .update({ signing_secret: reference })
    .eq("id", row.id);
  if (error) throw new Error("تعذّر ربط السرّ بالمزوّد.");
  return {
    secret,
    hint: maskWebhookSecret(secret),
    slug: row.slug,
    // في وضع «سرّ داخل الرابط» يحتاج الموظف الرابط الكامل جاهزاً للّصق لدى المزوّد.
    url: buildWebhookUrl(row.slug, row.verification_mode === "url_token" ? secret : null),
  };
}

/** تغيير وضع التحقق لمزوّد قائم — يُستخدم عندما تكون واجهة المزوّد غير قادرة على إرسال ترويسات. */
export async function setEndpointVerificationMode(
  db: Db,
  input: { id: string; verificationMode: WebhookVerificationMode },
): Promise<void> {
  const { error } = await db
    .from("webhook_endpoints")
    .update({ verification_mode: input.verificationMode })
    .eq("id", input.id);
  if (error) throw new Error("تعذّر تحديث وضع التحقق.");
}

export async function setEndpointState(
  db: Db,
  input: { id: string; isEnabled?: boolean; testMode?: boolean },
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (typeof input.isEnabled === "boolean") patch.is_enabled = input.isEnabled;
  if (typeof input.testMode === "boolean") patch.test_mode = input.testMode;
  if (Object.keys(patch).length === 0) return;

  if (patch.is_enabled === true) {
    const { data } = await db
      .from("webhook_endpoints")
      .select("signing_secret")
      .eq("id", input.id)
      .maybeSingle();
    const reference = (data as { signing_secret: string | null } | null)?.signing_secret ?? null;
    const secret = reference
      ? await IntegrationSecretVault.getSecretServerSide(reference, WEBHOOK_SECRET_FIELD)
      : null;
    if (!secret) throw new Error("ولّد سرّ التحقق أولاً قبل تفعيل استقبال الأحداث.");
  }

  const { error } = await db.from("webhook_endpoints").update(patch).eq("id", input.id);
  if (error) throw new Error("تعذّر تحديث حالة المزوّد.");
}

export async function createEndpoint(
  db: Db,
  input: {
    slug: string;
    displayName: string;
    adapterType: string;
    verificationMode: WebhookVerificationMode;
    signatureHeader: string;
    timestampHeader: string | null;
    notes: string | null;
  },
): Promise<string> {
  const { data, error } = await db
    .from("webhook_endpoints")
    .insert({
      slug: input.slug,
      display_name: input.displayName,
      adapter_type: input.adapterType,
      verification_mode: input.verificationMode,
      signature_header: input.signatureHeader,
      timestamp_header: input.timestampHeader,
      notes: input.notes,
      is_enabled: false,
      test_mode: true,
    })
    .select("id")
    .maybeSingle();
  if (error) {
    const message = String(error.message ?? "");
    throw new Error(
      error.code === "23505" || message.includes("duplicate")
        ? "المُعرّف مستخدم بالفعل — اختر مُعرّفاً آخر."
        : "تعذّر إضافة المزوّد.",
    );
  }
  return (data as { id: string }).id;
}

/** إعادة معالجة حدث فاشل من الحمولة المنقّحة المحفوظة — دون أي استدعاء خارجي. */
export async function reprocessEvent(
  db: Db,
  eventId: string,
): Promise<{ status: WebhookEventStatus }> {
  const { data } = await db
    .from("webhook_events")
    .select("id, slug, adapter_type, attempts, redacted_payload, status")
    .eq("id", eventId)
    .maybeSingle();
  const row = data as {
    id: string;
    slug: string;
    adapter_type: string | null;
    attempts: number;
    redacted_payload: Record<string, unknown> | null;
    status: WebhookEventStatus;
  } | null;
  if (!row) throw new Error("الحدث غير موجود.");
  if (row.status === "processed") throw new Error("الحدث مُعالَج بالفعل.");

  const adapter = getWebhookAdapter(row.adapter_type ?? "generic_json");
  const events = adapter.normalize(row.redacted_payload ?? {});
  const outcome = await dispatchNormalizedEvents(events, {
    slug: row.slug,
    adapterType: adapter.adapterType,
    testMode: true,
    correlationId: crypto.randomUUID().replace(/-/g, ""),
  });

  const status: WebhookEventStatus = outcome.status;
  await db
    .from("webhook_events")
    .update({
      status,
      attempts: row.attempts + 1,
      last_error: outcome.error ?? null,
      processed_at: status === "processed" ? new Date().toISOString() : null,
    })
    .eq("id", row.id);
  return { status };
}

export async function markEventDeadLetter(db: Db, eventId: string, reason: string): Promise<void> {
  const { error } = await db
    .from("webhook_events")
    .update({ status: "dead_letter", reject_reason: reason })
    .eq("id", eventId);
  if (error) throw new Error("تعذّر ترحيل الحدث.");
}
