/**
 * محرك الإشعارات — تحويل أحداث المنصة إلى صفوف طابور قابلة للإرسال.
 *
 * المسار: `notification_events` → قاعدة المكتب → المستلم → ربط القالب → الطابور.
 * لا يتصل هذا الملف بالمزوّد إطلاقاً؛ الإرسال في `queue.server.ts` فقط.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { CASE_STATUS } from "@/lib/enums";
import {
  NOTIFICATION_CHANNEL,
  WHATSAPP_PROVIDER,
  normalizePhone,
  type TemplateVariableToken,
} from "./notifications.shared";

type Db = SupabaseClient<Database>;

type EventRow = Database["public"]["Tables"]["notification_events"]["Row"];
type MappingRow = Database["public"]["Tables"]["notification_template_mappings"]["Row"];
type StateRow = Database["public"]["Tables"]["whatsapp_provider_state"]["Row"];

export type MaterializeReport = {
  events: number;
  queued: number;
  cancelled: number;
  skipped: number;
};

function stringList(value: Json | null): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function firstName(fullName: string | null): string {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  return parts[0] ?? "";
}

/** قيمة كل متغير مسموح — محتوى عام فقط، بلا تفاصيل قانونية حساسة. */
function resolveVariable(
  token: string,
  context: {
    clientName: string;
    caseNumber: string | null;
    publicCode: string | null;
    status: string | null;
    courtName: string | null;
    orgName: string | null;
  },
): string {
  switch (token as TemplateVariableToken) {
    case "client.first_name":
      return firstName(context.clientName) || context.clientName;
    case "client.display_name":
      return context.clientName;
    case "case.safe_reference":
      return context.caseNumber ?? context.publicCode ?? "";
    case "case.status_label":
      return context.status ? (CASE_STATUS[context.status] ?? context.status) : "";
    case "case.court_name":
      return context.courtName ?? "";
    case "organization.name":
      return context.orgName ?? "";
    case "track.code":
      return context.publicCode ?? "";
    default:
      return "";
  }
}

async function readState(db: Db): Promise<StateRow | null> {
  const { data } = await db
    .from("whatsapp_provider_state")
    .select("*")
    .eq("provider", WHATSAPP_PROVIDER)
    .maybeSingle();
  return data ?? null;
}

async function resolveMapping(
  db: Db,
  organizationId: string,
  eventType: string,
  mappingId: string | null,
): Promise<MappingRow | null> {
  if (mappingId) {
    const { data } = await db
      .from("notification_template_mappings")
      .select("*")
      .eq("id", mappingId)
      .maybeSingle();
    if (data) return data;
  }
  const { data: orgMapping } = await db
    .from("notification_template_mappings")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("event_type", eventType)
    .eq("channel", NOTIFICATION_CHANNEL)
    .eq("provider", WHATSAPP_PROVIDER)
    .maybeSingle();
  if (orgMapping) return orgMapping;
  const { data: globalMapping } = await db
    .from("notification_template_mappings")
    .select("*")
    .is("organization_id", null)
    .eq("event_type", eventType)
    .eq("channel", NOTIFICATION_CHANNEL)
    .eq("provider", WHATSAPP_PROVIDER)
    .maybeSingle();
  return globalMapping ?? null;
}

type QueueInsert = Database["public"]["Tables"]["notification_queue"]["Insert"];

async function insertQueueRow(db: Db, row: QueueInsert): Promise<"inserted" | "duplicate"> {
  const { error } = await db.from("notification_queue").insert(row);
  if (!error) return "inserted";
  // تفرّد `idempotency_key` يمنع تكرار نفس الرسالة لنفس الحدث والمستلم.
  if (error.code === "23505") return "duplicate";
  throw new Error(error.message);
}

/**
 * يعالج الأحداث غير المعالَجة ويحوّلها إلى صفوف طابور.
 * كل حدث يُعلَّم معالَجاً بعد اتخاذ قرار واضح: إدراج، أو إلغاء بسبب مسجّل، أو تجاوز.
 */
export async function materializeDueEvents(db: Db, limit = 50): Promise<MaterializeReport> {
  const report: MaterializeReport = { events: 0, queued: 0, cancelled: 0, skipped: 0 };
  const { data: events } = await db
    .from("notification_events")
    .select("*")
    .is("processed_at", null)
    .order("created_at", { ascending: true })
    .limit(Math.max(1, Math.min(limit, 200)));

  const rows = (events ?? []) as EventRow[];
  if (rows.length === 0) return report;
  const state = await readState(db);

  for (const event of rows) {
    report.events += 1;
    const finish = async () => {
      await db
        .from("notification_events")
        .update({ processed_at: new Date().toISOString() })
        .eq("id", event.id);
    };

    const { data: rule } = await db
      .from("notification_rules")
      .select("*")
      .eq("organization_id", event.organization_id)
      .eq("event_type", event.event_type)
      .eq("channel", NOTIFICATION_CHANNEL)
      .maybeSingle();

    // قاعدة غير موجودة أو مغلقة = لا إشعار ولا ضجيج في الطابور.
    if (!rule || !rule.is_enabled) {
      report.skipped += 1;
      await finish();
      continue;
    }

    const baseKey = `${event.organization_id}:${event.event_type}:${event.id}`;
    const cancel = async (code: string, message: string, recipientId: string | null) => {
      await insertQueueRow(db, {
        organization_id: event.organization_id,
        event_id: event.id,
        event_type: event.event_type,
        channel: NOTIFICATION_CHANNEL,
        provider: WHATSAPP_PROVIDER,
        recipient_type: "client",
        recipient_id: recipientId,
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        last_error_code: code,
        last_error_message: message,
        idempotency_key: `${baseKey}:${recipientId ?? "none"}:${NOTIFICATION_CHANNEL}`,
      });
      report.cancelled += 1;
      await finish();
    };

    if (!state || !state.is_enabled) {
      await cancel("PROVIDER_DISABLED", "تكامل واتساب معطّل على مستوى المنصة.", null);
      continue;
    }

    const mapping = await resolveMapping(
      db,
      event.organization_id,
      event.event_type,
      rule.template_mapping_id,
    );
    if (!mapping) {
      await cancel("MAPPING_MISSING", "لا يوجد ربط قالب لهذا الحدث.", null);
      continue;
    }
    if (!mapping.is_enabled || !mapping.provider_template_id) {
      await cancel("MAPPING_DISABLED", "ربط القالب غير مفعّل أو بلا قالب معتمد.", null);
      continue;
    }

    const deviceId = mapping.provider_device_id ?? state.default_device_id;
    if (!deviceId) {
      await cancel("DEVICE_MISSING", "لم يُحدَّد مُرسِل رسمي افتراضي.", null);
      continue;
    }

    if (event.entity_type !== "case" || !event.entity_id) {
      report.skipped += 1;
      await finish();
      continue;
    }

    const { data: caseRow } = await db
      .from("cases")
      .select("id, case_number, case_title, status, court_name, client_id, public_code")
      .eq("id", event.entity_id)
      .maybeSingle();
    if (!caseRow) {
      await cancel("ENTITY_MISSING", "القضية غير موجودة عند وقت المعالجة.", null);
      continue;
    }

    const { data: client } = caseRow.client_id
      ? await db
          .from("clients")
          .select("id, full_name, company_name, phone, client_type")
          .eq("id", caseRow.client_id)
          .maybeSingle()
      : { data: null };
    if (!client) {
      await cancel("ENTITY_MISSING", "عميل القضية غير موجود.", null);
      continue;
    }

    const { data: prefs } = await db
      .from("notification_client_preferences")
      .select("whatsapp_enabled")
      .eq("organization_id", event.organization_id)
      .eq("client_id", client.id)
      .maybeSingle();
    if (prefs && !prefs.whatsapp_enabled) {
      await cancel("RECIPIENT_OPTED_OUT", "العميل أوقف إشعارات واتساب.", client.id);
      continue;
    }

    const realPhone = normalizePhone(client.phone);
    const testPhone = state.test_mode ? normalizePhone(state.test_phone) : null;
    if (state.test_mode && (!testPhone || !testPhone.ok)) {
      await cancel("TEST_PHONE_MISSING", "وضع الاختبار مفعّل بلا رقم اختبار مصرّح.", client.id);
      continue;
    }
    if (!state.test_mode && !realPhone.ok) {
      await cancel("PHONE_MISSING", realPhone.ok ? "" : realPhone.reason, client.id);
      continue;
    }
    const targetPhone =
      state.test_mode && testPhone && testPhone.ok
        ? testPhone.e164
        : realPhone.ok
          ? realPhone.e164
          : "";

    /* تهدئة: أحداث متقاربة لنفس المستلم ونفس النوع لا تُكرَّر */
    if (rule.cooldown_seconds > 0) {
      const since = new Date(Date.now() - rule.cooldown_seconds * 1000).toISOString();
      const { count } = await db
        .from("notification_queue")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", event.organization_id)
        .eq("event_type", event.event_type)
        .eq("recipient_id", client.id)
        .in("status", ["queued", "scheduled", "processing", "provider_accepted"])
        .gte("created_at", since);
      if ((count ?? 0) > 0) {
        await cancel("COOLDOWN", "حدث مشابه أُرسل حديثاً لنفس المستلم.", client.id);
        continue;
      }
    }

    const { data: template } = await db
      .from("whatsapp_templates")
      .select("body_variable_count, button_variable_count, name, language")
      .eq("provider", WHATSAPP_PROVIDER)
      .eq("provider_template_id", mapping.provider_template_id)
      .maybeSingle();

    const bodyTokens = stringList(mapping.body_variable_mapping);
    const buttonTokens = stringList(mapping.button_variable_mapping);
    if (
      template &&
      (bodyTokens.length !== template.body_variable_count ||
        buttonTokens.length !== template.button_variable_count)
    ) {
      await cancel(
        "VARIABLE_MISMATCH",
        `القالب يتطلب ${template.body_variable_count} متغير جسم و${template.button_variable_count} متغير زر.`,
        client.id,
      );
      continue;
    }

    const { data: org } = await db
      .from("organizations")
      .select("name")
      .eq("id", event.organization_id)
      .maybeSingle();

    const clientName =
      client.client_type === "individual"
        ? (client.full_name ?? "")
        : (client.company_name ?? client.full_name ?? "");

    const variableContext = {
      clientName,
      caseNumber: caseRow.case_number,
      publicCode: caseRow.public_code,
      status: caseRow.status,
      courtName: caseRow.court_name,
      orgName: org?.name ?? null,
    };

    const bodyVariables = bodyTokens.map((token) => resolveVariable(token, variableContext));
    const buttonVariables = buttonTokens.map((token) => resolveVariable(token, variableContext));

    const scheduledAt = new Date(Date.now() + rule.delay_seconds * 1000).toISOString();
    const outcome = await insertQueueRow(db, {
      organization_id: event.organization_id,
      event_id: event.id,
      event_type: event.event_type,
      channel: NOTIFICATION_CHANNEL,
      provider: WHATSAPP_PROVIDER,
      recipient_type: state.test_mode ? "test" : "client",
      recipient_id: client.id,
      recipient_phone: targetPhone,
      template_mapping_id: mapping.id,
      provider_template_id: mapping.provider_template_id,
      provider_device_id: deviceId,
      status: rule.delay_seconds > 0 ? "scheduled" : "queued",
      is_test: state.test_mode,
      scheduled_at: scheduledAt,
      idempotency_key: `${baseKey}:${client.id}:${NOTIFICATION_CHANNEL}`,
      payload: {
        template_name: template?.name ?? null,
        language: template?.language ?? null,
        body_variables: bodyVariables,
        button_variables: buttonVariables,
      } as Json,
    });
    if (outcome === "inserted") report.queued += 1;
    else report.skipped += 1;
    await finish();
  }

  return report;
}

/** إدراج رسالة اختبار مباشرة في الطابور — تُرسل بنفس المسار الحقيقي. */
export async function enqueueTestMessage(
  db: Db,
  input: {
    organizationId: string;
    phoneE164: string;
    deviceId: string;
    templateId: string;
    templateName: string | null;
    language: string | null;
    bodyVariables: string[];
    buttonVariables: string[];
  },
): Promise<string> {
  const id = crypto.randomUUID();
  const { error } = await db.from("notification_queue").insert({
    id,
    organization_id: input.organizationId,
    event_type: "manual.test",
    channel: NOTIFICATION_CHANNEL,
    provider: WHATSAPP_PROVIDER,
    recipient_type: "test",
    recipient_phone: input.phoneE164,
    provider_template_id: input.templateId,
    provider_device_id: input.deviceId,
    status: "queued",
    is_test: true,
    max_attempts: 1,
    idempotency_key: `manual-test:${id}`,
    payload: {
      template_name: input.templateName,
      language: input.language,
      body_variables: input.bodyVariables,
      button_variables: input.buttonVariables,
    } as Json,
  });
  if (error) throw new Error(error.message);
  return id;
}
