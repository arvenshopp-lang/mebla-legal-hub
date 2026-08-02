/**
 * منطق قراءة/كتابة الحقول الحساسة — خادم فقط.
 * كل دالة هنا تعمل بهوية المستخدم الموقّع (RLS مطبّق)، ولا تُستدعى من المتصفح.
 */
import { buildPiiColumns, decryptPii } from "./crypto/pii.server";
import { maskPiiValue, type PiiField } from "./crypto/pii.shared";
import { PII_REVEAL_LIMITS } from "./security/security-policy";
import {
  assuranceLevel,
  newTraceRef,
  requestSecurityMeta,
  requireSensitiveAccess,
} from "./security/sensitive-guard.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

export type PiiEntity = "client" | "case_party";

const TABLE: Record<PiiEntity, string> = {
  client: "clients",
  case_party: "case_parties",
};

const ENTITY_LABEL: Record<PiiEntity, string> = {
  client: "عميل",
  case_party: "طرف قضية",
};

/** الأدوار المسموح لها بكشف القيمة الصريحة. المشاهد لا يرى إلا القناع. */
const REVEAL_ROLES = ["owner", "admin", "lawyer", "legal_assistant"] as const;

export async function requireMemberRole(
  supabase: Client,
  organizationId: string,
  userId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("organization_members")
    .select("role, status")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error || !data) throw new Error("لا تملك وصولاً إلى بيانات هذا المكتب.");
  return data.role as string;
}

export async function encryptedColumnsFor(
  organizationId: string,
  values: Partial<Record<PiiField, string | null | undefined>>,
) {
  return buildPiiColumns(organizationId, values);
}

/** أقنعة العرض: تُحسب على الخادم بعد فك التشفير، ولا تُسجَّل كعملية كشف. */
export async function maskedPiiFor(
  supabase: Client,
  organizationId: string,
  entity: PiiEntity,
  ids: string[],
): Promise<Record<string, { national_id: string; commercial_registration: string }>> {
  if (!ids.length) return {};
  const { data, error } = await supabase
    .from(TABLE[entity])
    .select("id, national_id_enc, commercial_registration_enc")
    .eq("organization_id", organizationId)
    .in("id", ids);
  if (error) throw new Error("تعذّر تحميل البيانات المحمية.");

  const out: Record<string, { national_id: string; commercial_registration: string }> = {};
  for (const row of data ?? []) {
    const [nid, cr] = await Promise.all([
      decryptPii(row.national_id_enc, organizationId, "national_id"),
      decryptPii(row.commercial_registration_enc, organizationId, "commercial_registration"),
    ]);
    out[row.id as string] = {
      national_id: nid ? maskPiiValue(nid) : "—",
      commercial_registration: cr ? maskPiiValue(cr) : "—",
    };
  }
  return out;
}

type RevealOutcome = "success" | "denied" | "rate_limited";

/** كتابة سجل الكشف — يشمل المحاولات المرفوضة كي لا تمر محاولة بلا أثر. */
async function logReveal(
  supabase: Client,
  input: {
    organizationId: string;
    entity: PiiEntity;
    entityId: string;
    field: PiiField;
    reason: string | null;
    keyVersion: number | null;
    outcome: RevealOutcome;
    traceRef: string;
    aal: string;
  },
) {
  const meta = requestSecurityMeta();
  await supabase.from("pii_access_logs").insert({
    organization_id: input.organizationId,
    entity_type: ENTITY_LABEL[input.entity],
    entity_id: input.entityId,
    field: input.field,
    reason: input.reason?.slice(0, 300) ?? null,
    key_version: input.keyVersion,
    outcome: input.outcome,
    trace_ref: input.traceRef,
    aal: input.aal,
    ip: meta.ip,
    user_agent: meta.userAgent,
  });
}

/** حد معدّل الكشف لكل مستخدم — يمنع الكشف الجماعي أو المتكرر. */
async function assertRevealRate(userId: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const now = Date.now();
  const windows: { since: string; max: number; label: string }[] = [
    {
      since: new Date(now - 10 * 60 * 1000).toISOString(),
      max: PII_REVEAL_LIMITS.perTenMinutes,
      label: "خلال عشر دقائق",
    },
    {
      since: new Date(now - 60 * 60 * 1000).toISOString(),
      max: PII_REVEAL_LIMITS.perHour,
      label: "خلال ساعة",
    },
  ];
  for (const window of windows) {
    const { count } = await supabaseAdmin
      .from("pii_access_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("outcome", "success")
      .gte("created_at", window.since);
    if ((count ?? 0) >= window.max) {
      throw new Error(
        `تجاوزت الحد المسموح لكشف البيانات الحساسة (${window.max} عملية ${window.label}). حاول بعد قليل.`,
      );
    }
  }
}

/**
 * كشف القيمة الصريحة. لا تُرسَل القيمة للمتصفح إلا بعد: عضوية المكتب + دور مخوّل +
 * سبب إلزامي + عدم تجاوز حد المعدّل. وكل محاولة — ناجحة أو مرفوضة — تُسجَّل.
 * التحقق بخطوتين اختياري ولا يُشترط هنا؛ يُسجَّل مستوى الجلسة للتدقيق فقط.
 */
export async function revealPiiValue(
  supabase: Client,
  userId: string,
  input: {
    organizationId: string;
    entity: PiiEntity;
    entityId: string;
    field: PiiField;
    reason?: string | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    claims?: Record<string, any> | null;
  },
): Promise<string> {
  const traceRef = newTraceRef("MR");
  const aal = assuranceLevel(input.claims ?? null);
  const reason = (input.reason ?? "").trim();

  const deny = async (outcome: RevealOutcome, message: string): Promise<never> => {
    try {
      await logReveal(supabase, {
        organizationId: input.organizationId,
        entity: input.entity,
        entityId: input.entityId,
        field: input.field,
        reason: reason || null,
        keyVersion: null,
        outcome,
        traceRef,
        aal,
      });
    } catch {
      /* لا نُفشِل رسالة الرفض إذا تعذّر التسجيل */
    }
    throw new Error(`${message} (مرجع: ${traceRef})`);
  };

  const role = await requireMemberRole(supabase, input.organizationId, userId);
  if (!REVEAL_ROLES.includes(role as (typeof REVEAL_ROLES)[number])) {
    return deny("denied", "دورك في المكتب لا يسمح بكشف البيانات الحساسة.");
  }
  if (reason.length < PII_REVEAL_LIMITS.minReasonLength) {
    return deny(
      "denied",
      `سبب الكشف إلزامي (${PII_REVEAL_LIMITS.minReasonLength} أحرف على الأقل) ويُسجَّل في سجل التدقيق.`,
    );
  }
  try {
    await assertRevealRate(userId);
  } catch (error) {
    return deny("rate_limited", error instanceof Error ? error.message : "تجاوزت الحد المسموح.");
  }

  const { data, error } = await supabase
    .from(TABLE[input.entity])
    .select("id, national_id_enc, commercial_registration_enc, pii_key_version")
    .eq("organization_id", input.organizationId)
    .eq("id", input.entityId)
    .maybeSingle();
  if (error || !data) return deny("denied", "السجل غير موجود داخل هذا المكتب.");

  const value = await decryptPii(
    data[`${input.field}_enc`] as string | null,
    input.organizationId,
    input.field,
  );
  if (!value) return deny("denied", "لا توجد قيمة محفوظة لهذا الحقل.");

  await logReveal(supabase, {
    organizationId: input.organizationId,
    entity: input.entity,
    entityId: input.entityId,
    field: input.field,
    reason,
    keyVersion: (data.pii_key_version as number | null) ?? null,
    outcome: "success",
    traceRef,
    aal,
  });

  return value;
}

/** حارس مُعاد تصديره لاستخدامه من دوال الخادم الحساسة الأخرى. */
export { requireSensitiveAccess };