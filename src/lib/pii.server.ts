/**
 * منطق قراءة/كتابة الحقول الحساسة — خادم فقط.
 * كل دالة هنا تعمل بهوية المستخدم الموقّع (RLS مطبّق)، ولا تُستدعى من المتصفح.
 */
import { getRequest } from "@tanstack/react-start/server";
import { buildPiiColumns, decryptPii } from "./crypto/pii.server";
import { maskPiiValue, type PiiField } from "./crypto/pii.shared";

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
const REVEAL_ROLES = new Set(["owner", "admin", "lawyer", "legal_assistant"]);

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

/** كشف القيمة الصريحة: تحقق دور + سجل تدقيق غير قابل للتعديل قبل الإرجاع. */
export async function revealPiiValue(
  supabase: Client,
  userId: string,
  input: {
    organizationId: string;
    entity: PiiEntity;
    entityId: string;
    field: PiiField;
    reason?: string | null;
  },
): Promise<string> {
  const role = await requireMemberRole(supabase, input.organizationId, userId);
  if (!REVEAL_ROLES.has(role)) {
    throw new Error("دورك في المكتب لا يسمح بكشف البيانات الحساسة.");
  }

  const { data, error } = await supabase
    .from(TABLE[input.entity])
    .select("id, national_id_enc, commercial_registration_enc, pii_key_version")
    .eq("organization_id", input.organizationId)
    .eq("id", input.entityId)
    .maybeSingle();
  if (error || !data) throw new Error("السجل غير موجود.");

  const value = await decryptPii(
    data[`${input.field}_enc`] as string | null,
    input.organizationId,
    input.field,
  );
  if (!value) throw new Error("لا توجد قيمة محفوظة لهذا الحقل.");

  const request = (() => {
    try {
      return getRequest();
    } catch {
      return null;
    }
  })();
  const headers = request?.headers;

  await supabase.from("pii_access_logs").insert({
    organization_id: input.organizationId,
    entity_type: ENTITY_LABEL[input.entity],
    entity_id: input.entityId,
    field: input.field,
    reason: input.reason?.slice(0, 300) ?? null,
    key_version: (data.pii_key_version as number | null) ?? null,
    ip:
      headers?.get("cf-connecting-ip") ??
      headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      null,
    user_agent: headers?.get("user-agent") ?? null,
  });

  return value;
}