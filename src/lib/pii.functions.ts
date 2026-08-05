import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const piiField = z.enum(["national_id", "commercial_registration"]);
const entity = z.enum(["client", "case_party"]);

const clientPayload = z.object({
  organizationId: z.string().uuid(),
  id: z.string().uuid().optional(),
  values: z.object({
    full_name: z.string().trim().min(2).max(150),
    client_type: z.enum(["individual", "company", "government"]),
    company_name: z.string().trim().max(150).nullable().optional(),
    email: z.string().trim().max(150).nullable().optional(),
    phone: z.string().trim().max(30).nullable().optional(),
    city: z.string().trim().max(60).nullable().optional(),
    address: z.string().trim().max(300).nullable().optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
  }),
  /** يُرسَل فقط عندما يعدّل المستخدم الحقل الحساس فعلياً. */
  pii: z
    .object({
      national_id: z.string().trim().max(30).nullable().optional(),
      commercial_registration: z.string().trim().max(30).nullable().optional(),
    })
    .optional(),
});

const partyPayload = z.object({
  organizationId: z.string().uuid(),
  caseId: z.string().uuid(),
  id: z.string().uuid().optional(),
  values: z.object({
    party_name: z.string().trim().min(2).max(200),
    party_type: z.string().trim().max(80).nullable().optional(),
    legal_role: z.string().trim().max(80).nullable().optional(),
    phone: z.string().trim().max(30).nullable().optional(),
    email: z.string().trim().max(150).nullable().optional(),
    representative_name: z.string().trim().max(150).nullable().optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
  }),
  pii: z
    .object({
      national_id: z.string().trim().max(30).nullable().optional(),
      commercial_registration: z.string().trim().max(30).nullable().optional(),
    })
    .optional(),
});

function blankToNull<T extends Record<string, unknown>>(values: T) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    out[key] = value === "" ? null : value;
  }
  return out;
}

/** حفظ عميل: أرقام الهوية/السجل تُشفّر على الخادم قبل أي كتابة. */
export const saveClientSecure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => clientPayload.parse(d))
  .handler(async ({ data, context }) => {
    const { requireMemberRole, encryptedColumnsFor } = await import("./pii.server");
    await requireMemberRole(context.supabase, data.organizationId, context.userId);

    const base = blankToNull(data.values);
    const secure = await encryptedColumnsFor(data.organizationId, data.pii ?? {});
    const payload = { ...base, ...secure };

    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("clients")
        .update(payload as never)
        .eq("id", data.id)
        .eq("organization_id", data.organizationId)
        .select("id, full_name, client_type, company_name, phone, email, city, status, created_at")
        .single();
      if (error) throw new Error(error.message);
      return row;
    }

    const { data: row, error } = await context.supabase
      .from("clients")
      .insert({
        ...payload,
        organization_id: data.organizationId,
        created_by: context.userId,
      } as never)
      .select("id, full_name, client_type, company_name, phone, email, city, status, created_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

/** حفظ طرف قضية بنفس ضمانات التشفير. */
export const saveCasePartySecure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => partyPayload.parse(d))
  .handler(async ({ data, context }) => {
    const { requireMemberRole, encryptedColumnsFor } = await import("./pii.server");
    await requireMemberRole(context.supabase, data.organizationId, context.userId);
    const { requireCasePartyPermission } = await import("./case-parties.server");
    await requireCasePartyPermission(
      context.supabase,
      data.organizationId,
      data.id ? "case_parties.update" : "case_parties.create",
    );

    const base = blankToNull(data.values);
    const secure = await encryptedColumnsFor(data.organizationId, data.pii ?? {});
    const payload = { ...base, ...secure };

    if (data.id) {
      const { error } = await context.supabase
        .from("case_parties")
        .update(payload as never)
        .eq("id", data.id)
        .eq("organization_id", data.organizationId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }

    const { data: row, error } = await context.supabase
      .from("case_parties")
      .insert({
        ...payload,
        organization_id: data.organizationId,
        case_id: data.caseId,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

/** أقنعة العرض (آخر أربعة أرقام) لعدة سجلات — بلا تسجيل كشف. */
export const getMaskedPii = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        entity,
        ids: z.array(z.string().uuid()).max(100),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireMemberRole, maskedPiiFor } = await import("./pii.server");
    await requireMemberRole(context.supabase, data.organizationId, context.userId);
    return maskedPiiFor(context.supabase, data.organizationId, data.entity, data.ids);
  });

/** كشف القيمة الصريحة: يتطلب AAL2 وسبباً إلزامياً، ويُسجَّل في سجل التدقيق. */
export const revealPii = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        entity,
        entityId: z.string().uuid(),
        field: piiField,
        reason: z.string().trim().min(8, "سبب الكشف إلزامي").max(300),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { revealPiiValue } = await import("./pii.server");
    const value = await revealPiiValue(context.supabase, context.userId, {
      organizationId: data.organizationId,
      entity: data.entity,
      entityId: data.entityId,
      field: data.field,
      reason: data.reason,
      claims: context.claims,
    });
    return { value };
  });

/** بحث بالرقم الحساس عبر البصمة الحتمية — الرقم لا يُخزَّن صريحاً أبداً. */
export const searchClientsByPii = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ organizationId: z.string().uuid(), value: z.string().trim().min(3).max(40) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireMemberRole } = await import("./pii.server");
    const { blindIndex } = await import("./crypto/pii.server");
    await requireMemberRole(context.supabase, data.organizationId, context.userId);

    const [nid, cr] = await Promise.all([
      blindIndex(data.value, data.organizationId, "national_id"),
      blindIndex(data.value, data.organizationId, "commercial_registration"),
    ]);
    const filters: string[] = [];
    if (nid) filters.push(`national_id_bidx.eq.${nid}`);
    if (cr) filters.push(`commercial_registration_bidx.eq.${cr}`);
    if (!filters.length) return { ids: [] as string[] };

    const { data: rows, error } = await context.supabase
      .from("clients")
      .select("id")
      .eq("organization_id", data.organizationId)
      .or(filters.join(","))
      .limit(50);
    if (error) throw new Error("تعذّر تنفيذ البحث المحمي.");
    return { ids: (rows ?? []).map((r) => r.id as string) };
  });
