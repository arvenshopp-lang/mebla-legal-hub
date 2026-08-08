/**
 * مشغّل طابور الإشعارات — الموضع الوحيد الذي يتصل فيه النظام بمزوّد واتساب.
 *
 * المسار: `claim_notification_batch` (قفل صفوف مع SKIP LOCKED) → حدود الإرسال
 * → إرسال القالب الرسمي → تسجيل محاولة → تحديث حالة الصف.
 * لا يُخزَّن أي محتوى قانوني، والأرقام لا تُسجَّل إلا مقنّعة.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { maskPhoneValue, providerErrorMessage, WHATSAPP_PROVIDER } from "./notifications.shared";
import { WhatsLineError, credentialsReady, sendTemplateMessage } from "./whatsline.server";

type Db = SupabaseClient<Database>;
type QueueRow = Database["public"]["Tables"]["notification_queue"]["Row"];
type StateRow = Database["public"]["Tables"]["whatsapp_provider_state"]["Row"];

export type DispatchReport = {
  claimed: number;
  accepted: number;
  failed: number;
  retried: number;
  blocked: number;
  skipped: string | null;
};

/** تراجع أُسّي مع حد أعلى: 1د، 5د، 15د، 60د. */
function backoffMs(attempt: number): number {
  const ladder = [60_000, 300_000, 900_000, 3_600_000];
  return ladder[Math.min(attempt - 1, ladder.length - 1)] ?? 3_600_000;
}

function stringList(value: Json | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function payloadRecord(value: Json | null): Record<string, Json> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Json>)
    : {};
}

async function countAcceptedSince(
  db: Db,
  since: string,
  scope: { organizationId?: string; recipientId?: string | null },
): Promise<number> {
  let query = db
    .from("notification_queue")
    .select("id", { count: "exact", head: true })
    .eq("channel", "whatsapp")
    .eq("provider", WHATSAPP_PROVIDER)
    .gte("accepted_at", since);
  if (scope.organizationId) query = query.eq("organization_id", scope.organizationId);
  if (scope.recipientId) query = query.eq("recipient_id", scope.recipientId);
  const { count } = await query;
  return count ?? 0;
}

async function recordAttempt(
  db: Db,
  row: QueueRow,
  outcome:
    | {
        status: "accepted";
        httpStatus: number;
        latencyMs: number;
        providerMessageId: string | null;
      }
    | { status: "failed"; httpStatus: number | null; code: string; message: string },
): Promise<void> {
  await db.from("notification_attempts").insert({
    queue_id: row.id,
    organization_id: row.organization_id,
    provider: row.provider,
    attempt_number: row.attempts,
    status: outcome.status,
    http_status: outcome.httpStatus,
    latency_ms: outcome.status === "accepted" ? outcome.latencyMs : null,
    error_code: outcome.status === "failed" ? outcome.code : null,
    error_message: outcome.status === "failed" ? outcome.message.slice(0, 400) : null,
    request_metadata: {
      template_id: row.provider_template_id,
      device_id: row.provider_device_id,
      recipient: maskPhoneValue(row.recipient_phone),
      is_test: row.is_test,
    } as Json,
    response_metadata:
      outcome.status === "accepted"
        ? ({ provider_message_id: outcome.providerMessageId } as Json)
        : ({} as Json),
  });
}

async function finalizeFailure(
  db: Db,
  row: QueueRow,
  code: string,
  message: string,
  retryable: boolean,
): Promise<"retried" | "failed"> {
  const canRetry = retryable && row.attempts < row.max_attempts;
  if (canRetry) {
    await db
      .from("notification_queue")
      .update({
        status: "scheduled",
        scheduled_at: new Date(Date.now() + backoffMs(row.attempts)).toISOString(),
        last_error_code: code,
        last_error_message: message.slice(0, 400),
      })
      .eq("id", row.id);
    return "retried";
  }
  await db
    .from("notification_queue")
    .update({
      status: "failed",
      failed_at: new Date().toISOString(),
      last_error_code: row.attempts >= row.max_attempts && retryable ? "MAX_ATTEMPTS" : code,
      last_error_message: message.slice(0, 400),
    })
    .eq("id", row.id);
  return "failed";
}

async function readState(db: Db): Promise<StateRow | null> {
  const { data } = await db
    .from("whatsapp_provider_state")
    .select("*")
    .eq("provider", WHATSAPP_PROVIDER)
    .maybeSingle();
  return data ?? null;
}

/** إرجاع الصف المسحوب إلى الطابور دون استهلاك محاولة — عند توقف عام. */
async function releaseRow(db: Db, row: QueueRow, code: string, message: string): Promise<void> {
  await db
    .from("notification_queue")
    .update({
      status: "queued",
      attempts: Math.max(0, row.attempts - 1),
      last_error_code: code,
      last_error_message: message.slice(0, 400),
    })
    .eq("id", row.id);
}

/**
 * يسحب دفعة مستحقة ويحاول إرسالها. آمن للتشغيل الدوري والمتوازي:
 * `claim_notification_batch` يقفل الصفوف، والأخطاء تُصنّف نهائية أو قابلة للإعادة.
 */
export async function processQueueBatch(db: Db, limit = 20): Promise<DispatchReport> {
  const report: DispatchReport = {
    claimed: 0,
    accepted: 0,
    failed: 0,
    retried: 0,
    blocked: 0,
    skipped: null,
  };

  const state = await readState(db);
  if (!state || !state.is_enabled) return { ...report, skipped: "provider_disabled" };
  if (!credentialsReady()) return { ...report, skipped: "credentials_missing" };

  const { data: claimed, error } = await db.rpc("claim_notification_batch", {
    _limit: Math.max(1, Math.min(limit, 100)),
  });
  if (error) throw new Error(error.message);

  const rows = (claimed ?? []) as QueueRow[];
  report.claimed = rows.length;
  if (rows.length === 0) return report;

  const since = new Date(Date.now() - 3_600_000).toISOString();
  let providerHourly = await countAcceptedSince(db, since, {});
  const orgHourly = new Map<string, number>();

  for (const row of rows) {
    const block = async (code: string) => {
      const message = providerErrorMessage(code);
      await recordAttempt(db, row, { status: "failed", httpStatus: null, code, message });
      const outcome = await finalizeFailure(db, row, code, message, false);
      report[outcome === "retried" ? "retried" : "failed"] += 1;
      report.blocked += 1;
    };

    if (!row.provider_template_id || !row.provider_device_id || !row.recipient_phone) {
      await block(!row.recipient_phone ? "PHONE_MISSING" : "MAPPING_DISABLED");
      continue;
    }

    // وضع الاختبار يمنع أي رقم غير رقم الاختبار المصرّح — حماية العملاء الحقيقيين.
    if (state.test_mode && state.test_phone && row.recipient_phone !== state.test_phone) {
      await block("TEST_MODE_BLOCKED");
      continue;
    }

    if (providerHourly >= state.provider_hourly_limit) {
      await releaseRow(
        db,
        row,
        "PROVIDER_HOURLY_LIMIT",
        providerErrorMessage("PROVIDER_HOURLY_LIMIT"),
      );
      report.blocked += 1;
      continue;
    }

    if (!orgHourly.has(row.organization_id)) {
      orgHourly.set(
        row.organization_id,
        await countAcceptedSince(db, since, { organizationId: row.organization_id }),
      );
    }
    if ((orgHourly.get(row.organization_id) ?? 0) >= state.per_org_hourly_limit) {
      await releaseRow(db, row, "ORG_HOURLY_LIMIT", providerErrorMessage("ORG_HOURLY_LIMIT"));
      report.blocked += 1;
      continue;
    }

    if (row.recipient_id) {
      const recipientHourly = await countAcceptedSince(db, since, {
        organizationId: row.organization_id,
        recipientId: row.recipient_id,
      });
      if (recipientHourly >= state.per_recipient_hourly_limit) {
        await block("RECIPIENT_HOURLY_LIMIT");
        continue;
      }
    }

    const payload = payloadRecord(row.payload);
    try {
      const result = await sendTemplateMessage({
        deviceId: row.provider_device_id,
        templateId: row.provider_template_id,
        templateName:
          typeof payload["template_name"] === "string" ? payload["template_name"] : null,
        language: typeof payload["language"] === "string" ? payload["language"] : null,
        phoneE164: row.recipient_phone,
        bodyVariables: stringList(payload["body_variables"] ?? null),
        buttonVariables: stringList(payload["button_variables"] ?? null),
      });

      await recordAttempt(db, row, {
        status: "accepted",
        httpStatus: result.status,
        latencyMs: result.latencyMs,
        providerMessageId: result.providerMessageId,
      });
      await db
        .from("notification_queue")
        .update({
          status: "provider_accepted",
          accepted_at: new Date().toISOString(),
          latency_ms: result.latencyMs,
          last_error_code: null,
          last_error_message: null,
          payload: { ...payload, provider_message_id: result.providerMessageId } as Json,
        })
        .eq("id", row.id);

      report.accepted += 1;
      providerHourly += 1;
      orgHourly.set(row.organization_id, (orgHourly.get(row.organization_id) ?? 0) + 1);
    } catch (thrown) {
      const providerError =
        thrown instanceof WhatsLineError
          ? thrown
          : new WhatsLineError(
              "UNKNOWN_PROVIDER_ERROR",
              thrown instanceof Error ? thrown.message : "unknown",
            );
      const message = providerErrorMessage(providerError.code);
      await recordAttempt(db, row, {
        status: "failed",
        httpStatus: providerError.status,
        code: providerError.code,
        message,
      });
      const outcome = await finalizeFailure(
        db,
        row,
        providerError.code,
        message,
        providerError.retryable,
      );
      report[outcome === "retried" ? "retried" : "failed"] += 1;
    }
  }

  return report;
}

/** يعيد الصفوف المعلّقة في `processing` إلى الطابور بعد انقطاع المشغّل. */
export async function reapStuckRows(db: Db, olderThanMinutes = 10): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000).toISOString();
  const { data } = await db
    .from("notification_queue")
    .update({
      status: "queued",
      last_error_code: "TIMEOUT",
      last_error_message: providerErrorMessage("TIMEOUT"),
    })
    .eq("status", "processing")
    .lt("processing_at", cutoff)
    .select("id");
  return (data ?? []).length;
}
