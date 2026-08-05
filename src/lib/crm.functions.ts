/**
 * وحدة CRM (عملاء محتملون / شركات / جهات اتصال / صفقات / أنشطة) للوحة إدارة المنصة.
 * كل دالة هنا تتحقق من صلاحية crm.* قبل أي عملية، وتُسجّل عمليات الكتابة في سجل التدقيق.
 * القراءات والكتابات تمر عبر عميل إداري (admin) بعد التحقق من الصلاحية، أسوة بوحدة إدارة المكاتب.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { buildCsv } from "@/lib/csv";
import type {
  CrmActivityRow,
  CrmCompanyRow,
  CrmContactRow,
  CrmDealRow,
  CrmForecast,
  CrmLeadRow,
  CrmPipelineStageRow,
  CrmPipelineSummary,
  CrmSourceReport,
  CrmUtmReport,
  StaffOption,
} from "@/lib/crm.shared";

/* --------------------------------------------------------------- أدوات مشتركة */

const optionalTrimmed = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));
const nullify = (v?: string) => (v && v.trim() !== "" ? v.trim() : null);
const emailOrEmpty = z
  .string()
  .trim()
  .max(160)
  .email("بريد إلكتروني غير صحيح")
  .optional()
  .or(z.literal(""));

const PageInput = {
  search: z.string().trim().max(120).default(""),
  page: z.number().int().min(1).max(2000).default(1),
  pageSize: z.number().int().min(5).max(100).default(20),
};

async function staffOptionsMap(db: AnyClient): Promise<Map<string, StaffOption>> {
  const { data } = await db.from("platform_staff").select("id, full_name, email");
  const map = new Map<string, StaffOption>();
  for (const s of data ?? []) map.set(s.id, { id: s.id, full_name: s.full_name, email: s.email });
  return map;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

async function assertStaffActive(db: AnyClient, staffId: string) {
  const { data } = await db
    .from("platform_staff")
    .select("id, status")
    .eq("id", staffId)
    .maybeSingle();
  if (!data || data.status !== "active") throw new Error("الموظف المحدد غير متاح للإسناد.");
}

/* ======================================================================== */
/* مراحل خط البيع                                                            */
/* ======================================================================== */

export const listPipelineStages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const g = await import("@/lib/admin-guard.server");
    await g.requireStaff(context.supabase, context.userId, "crm.read");
    const db = await g.admin();
    const { data, error } = await db.from("crm_pipeline_stages").select("*").order("sort_order");
    if (error) throw new Error("تعذّر جلب مراحل خط البيع.");
    return { stages: (data ?? []) as CrmPipelineStageRow[] };
  });

export const upsertPipelineStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().trim().min(2, "اسم المرحلة مطلوب").max(80),
        sort_order: z.number().int().min(0).max(1000).default(0),
        probability: z.number().int().min(0).max(100).default(0),
        is_won: z.boolean().default(false),
        is_lost: z.boolean().default(false),
        is_active: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    const staff = await g.requireStaff(context.supabase, context.userId, "crm.manage_pipeline");
    const db = await g.admin();
    if (data.is_won && data.is_lost)
      throw new Error("لا يمكن أن تكون المرحلة مكسوبة ومفقودة معاً.");
    const { id, ...fields } = data;
    if (id) {
      const { data: before } = await db
        .from("crm_pipeline_stages")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (!before) throw new Error("المرحلة غير موجودة.");
      const { error } = await db.from("crm_pipeline_stages").update(fields).eq("id", id);
      if (error) throw new Error("تعذّر تحديث المرحلة.");
      await g.writeAudit(db, staff, {
        action: "crm.pipeline_stage.update",
        entity_type: "crm_pipeline_stage",
        entity_id: id,
        description: `تعديل مرحلة خط البيع «${data.name}»`,
        before,
        after: fields,
      });
    } else {
      const { data: row, error } = await db
        .from("crm_pipeline_stages")
        .insert(fields)
        .select("id")
        .maybeSingle();
      if (error) throw new Error("تعذّر إنشاء المرحلة.");
      await g.writeAudit(db, staff, {
        action: "crm.pipeline_stage.create",
        entity_type: "crm_pipeline_stage",
        entity_id: row?.id ?? null,
        description: `إنشاء مرحلة خط البيع «${data.name}»`,
        after: fields,
      });
    }
    return { ok: true as const };
  });

export const deletePipelineStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    const staff = await g.requireStaff(context.supabase, context.userId, "crm.manage_pipeline");
    const db = await g.admin();
    const { count } = await db
      .from("crm_deals")
      .select("id", { count: "exact", head: true })
      .eq("stage_id", data.id);
    if ((count ?? 0) > 0)
      throw new Error("لا يمكن حذف مرحلة مرتبطة بصفقات. عطّلها بدلاً من الحذف.");
    const { data: before } = await db
      .from("crm_pipeline_stages")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!before) throw new Error("المرحلة غير موجودة.");
    const { error } = await db.from("crm_pipeline_stages").delete().eq("id", data.id);
    if (error) throw new Error("تعذّر حذف المرحلة.");
    await g.writeAudit(db, staff, {
      action: "crm.pipeline_stage.delete",
      entity_type: "crm_pipeline_stage",
      entity_id: data.id,
      description: `حذف مرحلة خط البيع «${before.name}»`,
      before,
    });
    return { ok: true as const };
  });

export const listStaffOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const g = await import("@/lib/admin-guard.server");
    await g.requireStaff(context.supabase, context.userId, "crm.read");
    const db = await g.admin();
    const { data } = await db
      .from("platform_staff")
      .select("id, full_name, email")
      .eq("status", "active")
      .order("full_name");
    return { staff: (data ?? []) as StaffOption[] };
  });

/* ======================================================================== */
/* العملاء المحتملون (Leads)                                                */
/* ======================================================================== */

const LeadStatusEnum = z.enum([
  "new",
  "contacted",
  "qualified",
  "unqualified",
  "converted",
  "lost",
]);

export const listLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        ...PageInput,
        status: z.union([LeadStatusEnum, z.literal("all")]).default("all"),
        source: z.string().trim().max(80).default(""),
        ownerStaffId: z.string().uuid().optional().or(z.literal("")),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    await g.requireStaff(context.supabase, context.userId, "crm.read");
    const db = await g.admin();
    let q = db.from("crm_leads").select("*", { count: "exact" });
    if (data.search)
      q = q.or(
        `full_name.ilike.%${data.search}%,email.ilike.%${data.search}%,phone.ilike.%${data.search}%,company_name.ilike.%${data.search}%`,
      );
    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.source) q = q.eq("source", data.source);
    if (data.ownerStaffId) q = q.eq("owner_staff_id", data.ownerStaffId);
    const from = (data.page - 1) * data.pageSize;
    const {
      data: rows,
      count,
      error,
    } = await q.order("created_at", { ascending: false }).range(from, from + data.pageSize - 1);
    if (error) throw new Error("تعذّر جلب قائمة العملاء المحتملين.");
    const staffMap = await staffOptionsMap(db);
    const list: CrmLeadRow[] = (rows ?? []).map((r: AnyClient) => ({
      ...r,
      owner: r.owner_staff_id ? (staffMap.get(r.owner_staff_id) ?? null) : null,
    }));
    return { rows: list, total: count ?? 0 };
  });

export const getLeadDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    await g.requireStaff(context.supabase, context.userId, "crm.read");
    const db = await g.admin();
    const { data: lead } = await db.from("crm_leads").select("*").eq("id", data.id).maybeSingle();
    if (!lead) throw new Error("العميل المحتمل غير موجود.");
    const staffMap = await staffOptionsMap(db);
    const { data: activities } = await db
      .from("crm_activities")
      .select("*")
      .eq("lead_id", data.id)
      .order("created_at", { ascending: false });
    return {
      lead: {
        ...lead,
        owner: lead.owner_staff_id ? (staffMap.get(lead.owner_staff_id) ?? null) : null,
      } as CrmLeadRow,
      activities: ((activities ?? []) as AnyClient[]).map((a) => ({
        ...a,
        owner: a.owner_staff_id ? (staffMap.get(a.owner_staff_id) ?? null) : null,
      })) as CrmActivityRow[],
    };
  });

const leadInputShape = {
  full_name: z.string().trim().min(2, "اسم العميل المحتمل مطلوب").max(160),
  company_name: optionalTrimmed(160),
  email: emailOrEmpty,
  phone: optionalTrimmed(40),
  city: optionalTrimmed(80),
  source: optionalTrimmed(60),
  notes: optionalTrimmed(2000),
  owner_staff_id: z.string().uuid().optional().or(z.literal("")),
  utm: z.record(z.string(), z.string().max(200)).optional(),
};

export const createLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object(leadInputShape).parse(input))
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    const staff = await g.requireStaff(context.supabase, context.userId, "crm.create");
    const db = await g.admin();
    if (data.owner_staff_id) await assertStaffActive(db, data.owner_staff_id);
    const payload = {
      full_name: data.full_name,
      company_name: nullify(data.company_name),
      email: nullify(data.email),
      phone: nullify(data.phone),
      city: nullify(data.city),
      source: nullify(data.source),
      notes: nullify(data.notes),
      owner_staff_id: nullify(data.owner_staff_id),
      utm: data.utm ?? {},
      created_by: staff.user_id,
    };
    const { data: row, error } = await db
      .from("crm_leads")
      .insert(payload)
      .select("id")
      .maybeSingle();
    if (error) throw new Error("تعذّر إنشاء العميل المحتمل.");
    await g.writeAudit(db, staff, {
      action: "crm.lead.create",
      entity_type: "crm_lead",
      entity_id: row?.id ?? null,
      description: `إنشاء عميل محتمل «${data.full_name}»`,
      after: payload,
    });
    return { ok: true as const, id: row?.id };
  });

export const updateLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), ...leadInputShape }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    const staff = await g.requireStaff(context.supabase, context.userId, "crm.update");
    const db = await g.admin();
    const { data: before } = await db.from("crm_leads").select("*").eq("id", data.id).maybeSingle();
    if (!before) throw new Error("العميل المحتمل غير موجود.");
    if (data.owner_staff_id) await assertStaffActive(db, data.owner_staff_id);
    const patch = {
      full_name: data.full_name,
      company_name: nullify(data.company_name),
      email: nullify(data.email),
      phone: nullify(data.phone),
      city: nullify(data.city),
      source: nullify(data.source),
      notes: nullify(data.notes),
      owner_staff_id: nullify(data.owner_staff_id),
      utm: data.utm ?? before.utm,
      updated_by: staff.user_id,
    };
    const { error } = await db.from("crm_leads").update(patch).eq("id", data.id);
    if (error) throw new Error("تعذّر تحديث العميل المحتمل.");
    await g.writeAudit(db, staff, {
      action: "crm.lead.update",
      entity_type: "crm_lead",
      entity_id: data.id,
      description: `تعديل العميل المحتمل «${data.full_name}»`,
      before,
      after: patch,
    });
    return { ok: true as const };
  });

export const deleteLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    const staff = await g.requireStaff(context.supabase, context.userId, "crm.delete");
    const db = await g.admin();
    const { data: before } = await db.from("crm_leads").select("*").eq("id", data.id).maybeSingle();
    if (!before) throw new Error("العميل المحتمل غير موجود.");
    const { error } = await db.from("crm_leads").delete().eq("id", data.id);
    if (error) throw new Error("تعذّر حذف العميل المحتمل.");
    await g.writeAudit(db, staff, {
      action: "crm.lead.delete",
      entity_type: "crm_lead",
      entity_id: data.id,
      description: `حذف العميل المحتمل «${before.full_name}»`,
      before,
    });
    return { ok: true as const };
  });

export const assignLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), staffId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    const staff = await g.requireStaff(context.supabase, context.userId, "crm.assign");
    const db = await g.admin();
    await assertStaffActive(db, data.staffId);
    const { data: before } = await db
      .from("crm_leads")
      .select("id, full_name, owner_staff_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!before) throw new Error("العميل المحتمل غير موجود.");
    const { error } = await db
      .from("crm_leads")
      .update({ owner_staff_id: data.staffId })
      .eq("id", data.id);
    if (error) throw new Error("تعذّر إسناد العميل المحتمل.");
    await g.writeAudit(db, staff, {
      action: "crm.lead.assign",
      entity_type: "crm_lead",
      entity_id: data.id,
      description: `إسناد العميل المحتمل «${before.full_name}»`,
      before: { owner_staff_id: before.owner_staff_id },
      after: { owner_staff_id: data.staffId },
    });
    return { ok: true as const };
  });

export const disqualifyLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        reason: z.string().trim().min(3, "اذكر سبب الاستبعاد").max(400),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    const staff = await g.requireStaff(context.supabase, context.userId, "crm.update");
    const db = await g.admin();
    const { data: before } = await db
      .from("crm_leads")
      .select("id, full_name, status")
      .eq("id", data.id)
      .maybeSingle();
    if (!before) throw new Error("العميل المحتمل غير موجود.");
    if (before.status === "converted")
      throw new Error("لا يمكن استبعاد عميل محتمل تم تحويله بالفعل.");
    const { error } = await db
      .from("crm_leads")
      .update({ status: "unqualified", disqualify_reason: data.reason })
      .eq("id", data.id);
    if (error) throw new Error("تعذّر استبعاد العميل المحتمل.");
    await g.writeAudit(db, staff, {
      action: "crm.lead.disqualify",
      entity_type: "crm_lead",
      entity_id: data.id,
      description: `استبعاد العميل المحتمل «${before.full_name}»: ${data.reason}`,
      before: { status: before.status },
      after: { status: "unqualified", reason: data.reason },
    });
    return { ok: true as const };
  });

export const convertLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        companyName: z.string().trim().max(160).optional().or(z.literal("")),
        dealTitle: z.string().trim().min(2, "عنوان الصفقة مطلوب").max(160),
        dealAmount: z.number().min(0).max(100_000_000).default(0),
        dealCurrency: z.string().trim().length(3).default("SAR"),
        stageId: z.string().uuid(),
        ownerStaffId: z.string().uuid().optional().or(z.literal("")),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    const staff = await g.requireStaff(context.supabase, context.userId, "crm.update");
    const db = await g.admin();

    const { data: lead } = await db.from("crm_leads").select("*").eq("id", data.id).maybeSingle();
    if (!lead) throw new Error("العميل المحتمل غير موجود.");
    if (lead.status === "converted") throw new Error("تم تحويل هذا العميل المحتمل مسبقاً.");

    const { data: stage } = await db
      .from("crm_pipeline_stages")
      .select("*")
      .eq("id", data.stageId)
      .maybeSingle();
    if (!stage) throw new Error("مرحلة خط البيع غير موجودة.");

    if (data.ownerStaffId) await assertStaffActive(db, data.ownerStaffId);
    const ownerStaffId = nullify(data.ownerStaffId) ?? lead.owner_staff_id;

    // منع التكرار: مطابقة بريد أو جوال جهة اتصال موجودة مسبقاً
    let contactId: string | null = null;
    let companyId: string | null = null;
    const orParts: string[] = [];
    if (lead.email) orParts.push(`email.eq.${lead.email}`);
    if (lead.phone) orParts.push(`phone.eq.${lead.phone}`);
    if (orParts.length > 0) {
      const { data: existingContact } = await db
        .from("crm_contacts")
        .select("*")
        .or(orParts.join(","))
        .limit(1)
        .maybeSingle();
      if (existingContact) {
        contactId = existingContact.id;
        companyId = existingContact.company_id;
      }
    }

    const desiredCompanyName = nullify(data.companyName) ?? lead.company_name ?? lead.full_name;
    if (!companyId) {
      const { data: existingCompany } = await db
        .from("crm_companies")
        .select("id")
        .ilike("name", desiredCompanyName)
        .limit(1)
        .maybeSingle();
      if (existingCompany) {
        companyId = existingCompany.id;
      } else {
        const { data: newCompany, error: companyErr } = await db
          .from("crm_companies")
          .insert({
            name: desiredCompanyName,
            city: lead.city,
            email: lead.email,
            phone: lead.phone,
            source: lead.source,
            owner_staff_id: ownerStaffId,
            created_by: staff.user_id,
          })
          .select("id")
          .maybeSingle();
        if (companyErr) throw new Error("تعذّر إنشاء الشركة أثناء التحويل.");
        companyId = newCompany!.id;
      }
    }

    if (!contactId) {
      const { data: newContact, error: contactErr } = await db
        .from("crm_contacts")
        .insert({
          full_name: lead.full_name,
          company_id: companyId,
          email: lead.email,
          phone: lead.phone,
          city: lead.city,
          is_primary: true,
          owner_staff_id: ownerStaffId,
          created_by: staff.user_id,
        })
        .select("id")
        .maybeSingle();
      if (contactErr) throw new Error("تعذّر إنشاء جهة الاتصال أثناء التحويل.");
      contactId = newContact!.id;
    }

    const { data: deal, error: dealErr } = await db
      .from("crm_deals")
      .insert({
        title: data.dealTitle,
        amount: data.dealAmount,
        currency: data.dealCurrency.toUpperCase(),
        probability: stage.probability,
        status: "open",
        stage_id: data.stageId,
        company_id: companyId,
        contact_id: contactId,
        lead_id: lead.id,
        owner_staff_id: ownerStaffId,
        source: lead.source,
        utm: lead.utm ?? {},
        created_by: staff.user_id,
      })
      .select("id")
      .maybeSingle();
    if (dealErr) throw new Error("تعذّر إنشاء الصفقة أثناء التحويل.");

    const { error: leadUpdateErr } = await db
      .from("crm_leads")
      .update({
        status: "converted",
        converted_at: new Date().toISOString(),
        converted_company_id: companyId,
        converted_contact_id: contactId,
        converted_deal_id: deal!.id,
        updated_by: staff.user_id,
      })
      .eq("id", lead.id);
    if (leadUpdateErr) throw new Error("تعذّر تحديث حالة العميل المحتمل بعد التحويل.");

    await g.writeAudit(db, staff, {
      action: "crm.lead.convert",
      entity_type: "crm_lead",
      entity_id: lead.id,
      description: `تحويل العميل المحتمل «${lead.full_name}» إلى شركة وصفقة`,
      after: { companyId, contactId, dealId: deal!.id },
    });
    return { ok: true as const, companyId, contactId, dealId: deal!.id };
  });

/* ======================================================================== */
/* الشركات (Companies)                                                       */
/* ======================================================================== */

export const listCompanies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        ...PageInput,
        status: z.string().trim().max(40).default(""),
        ownerStaffId: z.string().uuid().optional().or(z.literal("")),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    await g.requireStaff(context.supabase, context.userId, "crm.read");
    const db = await g.admin();
    let q = db.from("crm_companies").select("*", { count: "exact" });
    if (data.search)
      q = q.or(
        `name.ilike.%${data.search}%,legal_name.ilike.%${data.search}%,email.ilike.%${data.search}%,city.ilike.%${data.search}%`,
      );
    if (data.status) q = q.eq("status", data.status);
    if (data.ownerStaffId) q = q.eq("owner_staff_id", data.ownerStaffId);
    const from = (data.page - 1) * data.pageSize;
    const {
      data: rows,
      count,
      error,
    } = await q.order("created_at", { ascending: false }).range(from, from + data.pageSize - 1);
    if (error) throw new Error("تعذّر جلب قائمة الشركات.");
    const staffMap = await staffOptionsMap(db);
    const list: CrmCompanyRow[] = (rows ?? []).map((r: AnyClient) => ({
      ...r,
      owner: r.owner_staff_id ? (staffMap.get(r.owner_staff_id) ?? null) : null,
    }));
    return { rows: list, total: count ?? 0 };
  });

export const getCompanyDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    const staffCtx = await g.requireStaff(context.supabase, context.userId, "crm.read");
    const db = await g.admin();
    const { data: company } = await db
      .from("crm_companies")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!company) throw new Error("الشركة غير موجودة.");
    const staffMap = await staffOptionsMap(db);
    const [{ data: contacts }, { data: deals }, { data: activities }] = await Promise.all([
      db
        .from("crm_contacts")
        .select("*")
        .eq("company_id", data.id)
        .order("is_primary", { ascending: false }),
      db
        .from("crm_deals")
        .select("*")
        .eq("company_id", data.id)
        .order("created_at", { ascending: false }),
      db
        .from("crm_activities")
        .select("*")
        .eq("company_id", data.id)
        .order("created_at", { ascending: false }),
    ]);
    let documents: AnyClient[] = [];
    const canReadDocs = await g
      .requireStaff(context.supabase, context.userId, "sales_docs.read")
      .then(() => true)
      .catch(() => false);
    if (canReadDocs) {
      const { data: docs } = await db
        .from("sales_documents")
        .select("id, kind, title, status, total, currency, created_at")
        .eq("company_id", data.id)
        .order("created_at", { ascending: false });
      documents = docs ?? [];
    }
    void staffCtx;
    return {
      company: {
        ...company,
        owner: company.owner_staff_id ? (staffMap.get(company.owner_staff_id) ?? null) : null,
      } as CrmCompanyRow,
      contacts: (contacts ?? []).map((c) => ({
        ...c,
        company_name: company.name,
        owner: c.owner_staff_id ? (staffMap.get(c.owner_staff_id) ?? null) : null,
      })) as CrmContactRow[],
      deals: ((deals ?? []) as AnyClient[]).map((d) => ({
        ...d,
        owner: d.owner_staff_id ? (staffMap.get(d.owner_staff_id) ?? null) : null,
      })) as CrmDealRow[],
      activities: ((activities ?? []) as AnyClient[]).map((a) => ({
        ...a,
        owner: a.owner_staff_id ? (staffMap.get(a.owner_staff_id) ?? null) : null,
      })) as CrmActivityRow[],
      documents,
    };
  });

const companyInputShape = {
  name: z.string().trim().min(2, "اسم الشركة مطلوب").max(160),
  legal_name: optionalTrimmed(160),
  sector: optionalTrimmed(80),
  size_bracket: optionalTrimmed(40),
  city: optionalTrimmed(80),
  website: optionalTrimmed(200),
  email: emailOrEmpty,
  phone: optionalTrimmed(40),
  status: z.string().trim().max(40).default("active"),
  source: optionalTrimmed(60),
  notes: optionalTrimmed(2000),
  owner_staff_id: z.string().uuid().optional().or(z.literal("")),
};

export const createCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object(companyInputShape).parse(input))
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    const staff = await g.requireStaff(context.supabase, context.userId, "crm.create");
    const db = await g.admin();
    if (data.owner_staff_id) await assertStaffActive(db, data.owner_staff_id);
    const payload = {
      name: data.name,
      legal_name: nullify(data.legal_name),
      sector: nullify(data.sector),
      size_bracket: nullify(data.size_bracket),
      city: nullify(data.city),
      website: nullify(data.website),
      email: nullify(data.email),
      phone: nullify(data.phone),
      status: data.status || "active",
      source: nullify(data.source),
      notes: nullify(data.notes),
      owner_staff_id: nullify(data.owner_staff_id),
      created_by: staff.user_id,
    };
    const { data: row, error } = await db
      .from("crm_companies")
      .insert(payload)
      .select("id")
      .maybeSingle();
    if (error) throw new Error("تعذّر إنشاء الشركة.");
    await g.writeAudit(db, staff, {
      action: "crm.company.create",
      entity_type: "crm_company",
      entity_id: row?.id ?? null,
      description: `إنشاء شركة «${data.name}»`,
      after: payload,
    });
    return { ok: true as const, id: row?.id };
  });

export const updateCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), ...companyInputShape }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    const staff = await g.requireStaff(context.supabase, context.userId, "crm.update");
    const db = await g.admin();
    const { data: before } = await db
      .from("crm_companies")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!before) throw new Error("الشركة غير موجودة.");
    if (data.owner_staff_id) await assertStaffActive(db, data.owner_staff_id);
    const patch = {
      name: data.name,
      legal_name: nullify(data.legal_name),
      sector: nullify(data.sector),
      size_bracket: nullify(data.size_bracket),
      city: nullify(data.city),
      website: nullify(data.website),
      email: nullify(data.email),
      phone: nullify(data.phone),
      status: data.status || "active",
      source: nullify(data.source),
      notes: nullify(data.notes),
      owner_staff_id: nullify(data.owner_staff_id),
      updated_by: staff.user_id,
    };
    const { error } = await db.from("crm_companies").update(patch).eq("id", data.id);
    if (error) throw new Error("تعذّر تحديث الشركة.");
    await g.writeAudit(db, staff, {
      action: "crm.company.update",
      entity_type: "crm_company",
      entity_id: data.id,
      description: `تعديل الشركة «${data.name}»`,
      before,
      after: patch,
    });
    return { ok: true as const };
  });

export const deleteCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    const staff = await g.requireStaff(context.supabase, context.userId, "crm.delete");
    const db = await g.admin();
    const { data: before } = await db
      .from("crm_companies")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!before) throw new Error("الشركة غير موجودة.");
    const { error } = await db.from("crm_companies").delete().eq("id", data.id);
    if (error) throw new Error("تعذّر حذف الشركة. تأكد من عدم وجود جهات اتصال أو صفقات مرتبطة.");
    await g.writeAudit(db, staff, {
      action: "crm.company.delete",
      entity_type: "crm_company",
      entity_id: data.id,
      description: `حذف الشركة «${before.name}»`,
      before,
    });
    return { ok: true as const };
  });

export const assignCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), staffId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    const staff = await g.requireStaff(context.supabase, context.userId, "crm.assign");
    const db = await g.admin();
    await assertStaffActive(db, data.staffId);
    const { data: before } = await db
      .from("crm_companies")
      .select("id, name, owner_staff_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!before) throw new Error("الشركة غير موجودة.");
    const { error } = await db
      .from("crm_companies")
      .update({ owner_staff_id: data.staffId })
      .eq("id", data.id);
    if (error) throw new Error("تعذّر إسناد الشركة.");
    await g.writeAudit(db, staff, {
      action: "crm.company.assign",
      entity_type: "crm_company",
      entity_id: data.id,
      description: `إسناد الشركة «${before.name}»`,
      before: { owner_staff_id: before.owner_staff_id },
      after: { owner_staff_id: data.staffId },
    });
    return { ok: true as const };
  });

/* ======================================================================== */
/* جهات الاتصال (Contacts)                                                   */
/* ======================================================================== */

export const listContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        ...PageInput,
        companyId: z.string().uuid().optional().or(z.literal("")),
        ownerStaffId: z.string().uuid().optional().or(z.literal("")),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    await g.requireStaff(context.supabase, context.userId, "crm.read");
    const db = await g.admin();
    let q = db.from("crm_contacts").select("*", { count: "exact" });
    if (data.search)
      q = q.or(
        `full_name.ilike.%${data.search}%,email.ilike.%${data.search}%,phone.ilike.%${data.search}%`,
      );
    if (data.companyId) q = q.eq("company_id", data.companyId);
    if (data.ownerStaffId) q = q.eq("owner_staff_id", data.ownerStaffId);
    const from = (data.page - 1) * data.pageSize;
    const {
      data: rows,
      count,
      error,
    } = await q.order("created_at", { ascending: false }).range(from, from + data.pageSize - 1);
    if (error) throw new Error("تعذّر جلب قائمة جهات الاتصال.");
    const staffMap = await staffOptionsMap(db);
    const companyIds = [
      ...new Set((rows ?? []).map((r: AnyClient) => r.company_id).filter(Boolean)),
    ];
    const companyMap = new Map<string, string>();
    if (companyIds.length) {
      const { data: companies } = await db
        .from("crm_companies")
        .select("id, name")
        .in("id", companyIds);
      for (const c of companies ?? []) companyMap.set(c.id, c.name);
    }
    const list: CrmContactRow[] = (rows ?? []).map((r: AnyClient) => ({
      ...r,
      company_name: r.company_id ? (companyMap.get(r.company_id) ?? null) : null,
      owner: r.owner_staff_id ? (staffMap.get(r.owner_staff_id) ?? null) : null,
    }));
    return { rows: list, total: count ?? 0 };
  });

const contactInputShape = {
  full_name: z.string().trim().min(2, "اسم جهة الاتصال مطلوب").max(160),
  company_id: z.string().uuid().optional().or(z.literal("")),
  job_title: optionalTrimmed(120),
  email: emailOrEmpty,
  phone: optionalTrimmed(40),
  city: optionalTrimmed(80),
  is_primary: z.boolean().default(false),
  notes: optionalTrimmed(2000),
  owner_staff_id: z.string().uuid().optional().or(z.literal("")),
};

export const createContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object(contactInputShape).parse(input))
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    const staff = await g.requireStaff(context.supabase, context.userId, "crm.create");
    const db = await g.admin();
    if (data.owner_staff_id) await assertStaffActive(db, data.owner_staff_id);
    const payload = {
      full_name: data.full_name,
      company_id: nullify(data.company_id),
      job_title: nullify(data.job_title),
      email: nullify(data.email),
      phone: nullify(data.phone),
      city: nullify(data.city),
      is_primary: data.is_primary,
      notes: nullify(data.notes),
      owner_staff_id: nullify(data.owner_staff_id),
      created_by: staff.user_id,
    };
    const { data: row, error } = await db
      .from("crm_contacts")
      .insert(payload)
      .select("id")
      .maybeSingle();
    if (error) throw new Error("تعذّر إنشاء جهة الاتصال.");
    await g.writeAudit(db, staff, {
      action: "crm.contact.create",
      entity_type: "crm_contact",
      entity_id: row?.id ?? null,
      description: `إنشاء جهة اتصال «${data.full_name}»`,
      after: payload,
    });
    return { ok: true as const, id: row?.id };
  });

export const updateContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), ...contactInputShape }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    const staff = await g.requireStaff(context.supabase, context.userId, "crm.update");
    const db = await g.admin();
    const { data: before } = await db
      .from("crm_contacts")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!before) throw new Error("جهة الاتصال غير موجودة.");
    if (data.owner_staff_id) await assertStaffActive(db, data.owner_staff_id);
    const patch = {
      full_name: data.full_name,
      company_id: nullify(data.company_id),
      job_title: nullify(data.job_title),
      email: nullify(data.email),
      phone: nullify(data.phone),
      city: nullify(data.city),
      is_primary: data.is_primary,
      notes: nullify(data.notes),
      owner_staff_id: nullify(data.owner_staff_id),
      updated_by: staff.user_id,
    };
    const { error } = await db.from("crm_contacts").update(patch).eq("id", data.id);
    if (error) throw new Error("تعذّر تحديث جهة الاتصال.");
    await g.writeAudit(db, staff, {
      action: "crm.contact.update",
      entity_type: "crm_contact",
      entity_id: data.id,
      description: `تعديل جهة اتصال «${data.full_name}»`,
      before,
      after: patch,
    });
    return { ok: true as const };
  });

export const deleteContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    const staff = await g.requireStaff(context.supabase, context.userId, "crm.delete");
    const db = await g.admin();
    const { data: before } = await db
      .from("crm_contacts")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!before) throw new Error("جهة الاتصال غير موجودة.");
    const { error } = await db.from("crm_contacts").delete().eq("id", data.id);
    if (error) throw new Error("تعذّر حذف جهة الاتصال.");
    await g.writeAudit(db, staff, {
      action: "crm.contact.delete",
      entity_type: "crm_contact",
      entity_id: data.id,
      description: `حذف جهة اتصال «${before.full_name}»`,
      before,
    });
    return { ok: true as const };
  });

/* ======================================================================== */
/* الصفقات (Deals)                                                           */
/* ======================================================================== */

const DealStatusEnum = z.enum(["open", "won", "lost", "abandoned"]);

export const listDeals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        ...PageInput,
        status: z.union([DealStatusEnum, z.literal("all")]).default("all"),
        stageId: z.string().uuid().optional().or(z.literal("")),
        ownerStaffId: z.string().uuid().optional().or(z.literal("")),
        companyId: z.string().uuid().optional().or(z.literal("")),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    await g.requireStaff(context.supabase, context.userId, "crm.read");
    const db = await g.admin();
    let q = db.from("crm_deals").select("*", { count: "exact" });
    if (data.search) q = q.ilike("title", `%${data.search}%`);
    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.stageId) q = q.eq("stage_id", data.stageId);
    if (data.ownerStaffId) q = q.eq("owner_staff_id", data.ownerStaffId);
    if (data.companyId) q = q.eq("company_id", data.companyId);
    const from = (data.page - 1) * data.pageSize;
    const {
      data: rows,
      count,
      error,
    } = await q.order("created_at", { ascending: false }).range(from, from + data.pageSize - 1);
    if (error) throw new Error("تعذّر جلب قائمة الصفقات.");
    const staffMap = await staffOptionsMap(db);
    const [{ data: stages }, { data: companies }, { data: contacts }] = await Promise.all([
      db.from("crm_pipeline_stages").select("id, name"),
      db.from("crm_companies").select("id, name"),
      db.from("crm_contacts").select("id, full_name"),
    ]);
    const stageMap = new Map((stages ?? []).map((s: AnyClient) => [s.id, s.name]));
    const companyMap = new Map((companies ?? []).map((c: AnyClient) => [c.id, c.name]));
    const contactMap = new Map((contacts ?? []).map((c: AnyClient) => [c.id, c.full_name]));
    const list: CrmDealRow[] = (rows ?? []).map((r: AnyClient) => ({
      ...r,
      stage_name: r.stage_id ? (stageMap.get(r.stage_id) ?? null) : null,
      company_name: r.company_id ? (companyMap.get(r.company_id) ?? null) : null,
      contact_name: r.contact_id ? (contactMap.get(r.contact_id) ?? null) : null,
      owner: r.owner_staff_id ? (staffMap.get(r.owner_staff_id) ?? null) : null,
    }));
    return { rows: list, total: count ?? 0 };
  });

export const getDealDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    await g.requireStaff(context.supabase, context.userId, "crm.read");
    const db = await g.admin();
    const { data: deal } = await db.from("crm_deals").select("*").eq("id", data.id).maybeSingle();
    if (!deal) throw new Error("الصفقة غير موجودة.");
    const staffMap = await staffOptionsMap(db);
    const [{ data: stage }, { data: company }, { data: contact }, { data: activities }] =
      await Promise.all([
        deal.stage_id
          ? db.from("crm_pipeline_stages").select("id, name").eq("id", deal.stage_id).maybeSingle()
          : Promise.resolve({ data: null }),
        deal.company_id
          ? db.from("crm_companies").select("id, name").eq("id", deal.company_id).maybeSingle()
          : Promise.resolve({ data: null }),
        deal.contact_id
          ? db.from("crm_contacts").select("id, full_name").eq("id", deal.contact_id).maybeSingle()
          : Promise.resolve({ data: null }),
        db
          .from("crm_activities")
          .select("*")
          .eq("deal_id", data.id)
          .order("created_at", { ascending: false }),
      ]);
    let documents: AnyClient[] = [];
    const canReadDocs = await g
      .requireStaff(context.supabase, context.userId, "sales_docs.read")
      .then(() => true)
      .catch(() => false);
    if (canReadDocs) {
      const { data: docs } = await db
        .from("sales_documents")
        .select("id, kind, title, status, total, currency, created_at")
        .eq("deal_id", data.id)
        .order("created_at", { ascending: false });
      documents = docs ?? [];
    }
    return {
      deal: {
        ...deal,
        stage_name: stage?.name ?? null,
        company_name: company?.name ?? null,
        contact_name: contact?.full_name ?? null,
        owner: deal.owner_staff_id ? (staffMap.get(deal.owner_staff_id) ?? null) : null,
      } as CrmDealRow,
      activities: ((activities ?? []) as AnyClient[]).map((a) => ({
        ...a,
        owner: a.owner_staff_id ? (staffMap.get(a.owner_staff_id) ?? null) : null,
      })) as CrmActivityRow[],
      documents,
    };
  });

const dealInputShape = {
  title: z.string().trim().min(2, "عنوان الصفقة مطلوب").max(160),
  amount: z.number().min(0).max(100_000_000).default(0),
  currency: z.string().trim().length(3).default("SAR"),
  stage_id: z.string().uuid(),
  company_id: z.string().uuid().optional().or(z.literal("")),
  contact_id: z.string().uuid().optional().or(z.literal("")),
  expected_close_date: z.string().trim().optional().or(z.literal("")),
  source: optionalTrimmed(60),
  notes: optionalTrimmed(2000),
  owner_staff_id: z.string().uuid().optional().or(z.literal("")),
};

export const createDeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object(dealInputShape).parse(input))
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    const staff = await g.requireStaff(context.supabase, context.userId, "crm.create");
    const db = await g.admin();
    const { data: stage } = await db
      .from("crm_pipeline_stages")
      .select("*")
      .eq("id", data.stage_id)
      .maybeSingle();
    if (!stage) throw new Error("مرحلة خط البيع غير موجودة.");
    if (data.owner_staff_id) await assertStaffActive(db, data.owner_staff_id);
    const payload = {
      title: data.title,
      amount: data.amount,
      currency: data.currency.toUpperCase(),
      probability: stage.probability,
      status: "open" as const,
      stage_id: data.stage_id,
      company_id: nullify(data.company_id),
      contact_id: nullify(data.contact_id),
      expected_close_date: nullify(data.expected_close_date),
      source: nullify(data.source),
      notes: nullify(data.notes),
      owner_staff_id: nullify(data.owner_staff_id),
      created_by: staff.user_id,
    };
    const { data: row, error } = await db
      .from("crm_deals")
      .insert(payload)
      .select("id")
      .maybeSingle();
    if (error) throw new Error("تعذّر إنشاء الصفقة.");
    await g.writeAudit(db, staff, {
      action: "crm.deal.create",
      entity_type: "crm_deal",
      entity_id: row?.id ?? null,
      description: `إنشاء صفقة «${data.title}»`,
      after: payload,
    });
    return { ok: true as const, id: row?.id };
  });

export const updateDeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), ...dealInputShape }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    const staff = await g.requireStaff(context.supabase, context.userId, "crm.update");
    const db = await g.admin();
    const { data: before } = await db.from("crm_deals").select("*").eq("id", data.id).maybeSingle();
    if (!before) throw new Error("الصفقة غير موجودة.");
    if (before.status !== "open")
      throw new Error("لا يمكن تعديل صفقة مغلقة (مكسوبة/مفقودة/متروكة).");
    if (data.owner_staff_id) await assertStaffActive(db, data.owner_staff_id);
    const patch = {
      title: data.title,
      amount: data.amount,
      currency: data.currency.toUpperCase(),
      company_id: nullify(data.company_id),
      contact_id: nullify(data.contact_id),
      expected_close_date: nullify(data.expected_close_date),
      source: nullify(data.source),
      notes: nullify(data.notes),
      owner_staff_id: nullify(data.owner_staff_id),
      updated_by: staff.user_id,
    };
    const { error } = await db.from("crm_deals").update(patch).eq("id", data.id);
    if (error) throw new Error("تعذّر تحديث الصفقة.");
    await g.writeAudit(db, staff, {
      action: "crm.deal.update",
      entity_type: "crm_deal",
      entity_id: data.id,
      description: `تعديل الصفقة «${data.title}»`,
      before,
      after: patch,
    });
    return { ok: true as const };
  });

export const deleteDeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    const staff = await g.requireStaff(context.supabase, context.userId, "crm.delete");
    const db = await g.admin();
    const { data: before } = await db.from("crm_deals").select("*").eq("id", data.id).maybeSingle();
    if (!before) throw new Error("الصفقة غير موجودة.");
    const { error } = await db.from("crm_deals").delete().eq("id", data.id);
    if (error) throw new Error("تعذّر حذف الصفقة.");
    await g.writeAudit(db, staff, {
      action: "crm.deal.delete",
      entity_type: "crm_deal",
      entity_id: data.id,
      description: `حذف الصفقة «${before.title}»`,
      before,
    });
    return { ok: true as const };
  });

export const assignDeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), staffId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    const staff = await g.requireStaff(context.supabase, context.userId, "crm.assign");
    const db = await g.admin();
    await assertStaffActive(db, data.staffId);
    const { data: before } = await db
      .from("crm_deals")
      .select("id, title, owner_staff_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!before) throw new Error("الصفقة غير موجودة.");
    const { error } = await db
      .from("crm_deals")
      .update({ owner_staff_id: data.staffId })
      .eq("id", data.id);
    if (error) throw new Error("تعذّر إسناد الصفقة.");
    await g.writeAudit(db, staff, {
      action: "crm.deal.assign",
      entity_type: "crm_deal",
      entity_id: data.id,
      description: `إسناد الصفقة «${before.title}»`,
      before: { owner_staff_id: before.owner_staff_id },
      after: { owner_staff_id: data.staffId },
    });
    return { ok: true as const };
  });

export const moveDealStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        stageId: z.string().uuid(),
        lostReason: z.string().trim().max(400).optional().or(z.literal("")),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    const staff = await g.requireStaff(context.supabase, context.userId, "crm.update");
    const db = await g.admin();
    const { data: before } = await db.from("crm_deals").select("*").eq("id", data.id).maybeSingle();
    if (!before) throw new Error("الصفقة غير موجودة.");
    if (before.status !== "open") throw new Error("لا يمكن تحريك صفقة مغلقة.");
    const { data: stage } = await db
      .from("crm_pipeline_stages")
      .select("*")
      .eq("id", data.stageId)
      .maybeSingle();
    if (!stage) throw new Error("مرحلة خط البيع غير موجودة.");
    if (stage.is_lost && !nullify(data.lostReason)) throw new Error("اذكر سبب خسارة الصفقة.");

    const patch: CrmDealUpdate = {
      stage_id: data.stageId,
      probability: stage.probability,
      updated_by: staff.user_id,
    };
    if (stage.is_won) {
      patch.status = "won";
      patch.closed_at = new Date().toISOString();
      patch.lost_reason = null;
    } else if (stage.is_lost) {
      patch.status = "lost";
      patch.closed_at = new Date().toISOString();
      patch.lost_reason = nullify(data.lostReason);
    }
    const { error } = await db.from("crm_deals").update(patch).eq("id", data.id);
    if (error) throw new Error("تعذّر تحريك الصفقة.");
    await g.writeAudit(db, staff, {
      action: "crm.deal.move_stage",
      entity_type: "crm_deal",
      entity_id: data.id,
      description: `تحريك الصفقة «${before.title}» إلى مرحلة «${stage.name}»`,
      before: { stage_id: before.stage_id, status: before.status },
      after: patch,
    });
    return { ok: true as const };
  });

/* ======================================================================== */
/* الأنشطة (Activities)                                                      */
/* ======================================================================== */

const ActivityKindEnum = z.enum(["meeting", "call", "note", "task", "followup", "email"]);
const EntityKindEnum = z.enum(["lead", "company", "contact", "deal"]);

export const listActivities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        ...PageInput,
        kind: z.union([ActivityKindEnum, z.literal("all")]).default("all"),
        entityKind: z.union([EntityKindEnum, z.literal("all")]).default("all"),
        ownerStaffId: z.string().uuid().optional().or(z.literal("")),
        onlyOpen: z.boolean().default(false),
        leadId: z.string().uuid().optional().or(z.literal("")),
        companyId: z.string().uuid().optional().or(z.literal("")),
        dealId: z.string().uuid().optional().or(z.literal("")),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    await g.requireStaff(context.supabase, context.userId, "crm.read");
    const db = await g.admin();
    let q = db.from("crm_activities").select("*", { count: "exact" });
    if (data.search) q = q.ilike("subject", `%${data.search}%`);
    if (data.kind !== "all") q = q.eq("kind", data.kind);
    if (data.entityKind !== "all") q = q.eq("entity_kind", data.entityKind);
    if (data.ownerStaffId) q = q.eq("owner_staff_id", data.ownerStaffId);
    if (data.onlyOpen) q = q.is("completed_at", null);
    if (data.leadId) q = q.eq("lead_id", data.leadId);
    if (data.companyId) q = q.eq("company_id", data.companyId);
    if (data.dealId) q = q.eq("deal_id", data.dealId);
    const from = (data.page - 1) * data.pageSize;
    const {
      data: rows,
      count,
      error,
    } = await q
      .order("due_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .range(from, from + data.pageSize - 1);
    if (error) throw new Error("تعذّر جلب قائمة الأنشطة.");
    const staffMap = await staffOptionsMap(db);
    const list: CrmActivityRow[] = (rows ?? []).map((r: AnyClient) => ({
      ...r,
      owner: r.owner_staff_id ? (staffMap.get(r.owner_staff_id) ?? null) : null,
    }));
    return { rows: list, total: count ?? 0 };
  });

const activityInputShape = {
  kind: ActivityKindEnum,
  entity_kind: EntityKindEnum,
  subject: z.string().trim().min(2, "عنوان النشاط مطلوب").max(200),
  body: optionalTrimmed(2000),
  due_at: z.string().trim().optional().or(z.literal("")),
  owner_staff_id: z.string().uuid().optional().or(z.literal("")),
  lead_id: z.string().uuid().optional().or(z.literal("")),
  company_id: z.string().uuid().optional().or(z.literal("")),
  contact_id: z.string().uuid().optional().or(z.literal("")),
  deal_id: z.string().uuid().optional().or(z.literal("")),
};

export const createActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object(activityInputShape).parse(input))
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    const staff = await g.requireStaff(context.supabase, context.userId, "crm.create");
    const db = await g.admin();
    if (data.owner_staff_id) await assertStaffActive(db, data.owner_staff_id);
    const linkId = {
      lead: data.lead_id,
      company: data.company_id,
      contact: data.contact_id,
      deal: data.deal_id,
    }[data.entity_kind];
    if (!nullify(linkId)) throw new Error("يجب اختيار السجل المرتبط بالنشاط.");
    const payload = {
      kind: data.kind,
      entity_kind: data.entity_kind,
      subject: data.subject,
      body: nullify(data.body),
      due_at: nullify(data.due_at),
      owner_staff_id: nullify(data.owner_staff_id) ?? staff.id,
      lead_id: nullify(data.lead_id),
      company_id: nullify(data.company_id),
      contact_id: nullify(data.contact_id),
      deal_id: nullify(data.deal_id),
      created_by: staff.user_id,
    };
    const { data: row, error } = await db
      .from("crm_activities")
      .insert(payload)
      .select("id")
      .maybeSingle();
    if (error) throw new Error("تعذّر إنشاء النشاط.");
    if (data.lead_id)
      await db
        .from("crm_leads")
        .update({ last_activity_at: new Date().toISOString() })
        .eq("id", data.lead_id);
    await g.writeAudit(db, staff, {
      action: "crm.activity.create",
      entity_type: "crm_activity",
      entity_id: row?.id ?? null,
      description: `إنشاء نشاط «${data.subject}»`,
      after: payload,
    });
    return { ok: true as const, id: row?.id };
  });

export const completeActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), outcome: optionalTrimmed(500) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    const staff = await g.requireStaff(context.supabase, context.userId, "crm.update");
    const db = await g.admin();
    const { data: before } = await db
      .from("crm_activities")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!before) throw new Error("النشاط غير موجود.");
    const { error } = await db
      .from("crm_activities")
      .update({ completed_at: new Date().toISOString(), outcome: nullify(data.outcome) })
      .eq("id", data.id);
    if (error) throw new Error("تعذّر إكمال النشاط.");
    await g.writeAudit(db, staff, {
      action: "crm.activity.complete",
      entity_type: "crm_activity",
      entity_id: data.id,
      description: `إكمال نشاط «${before.subject}»`,
      after: { outcome: nullify(data.outcome) },
    });
    return { ok: true as const };
  });

export const deleteActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    const staff = await g.requireStaff(context.supabase, context.userId, "crm.delete");
    const db = await g.admin();
    const { data: before } = await db
      .from("crm_activities")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!before) throw new Error("النشاط غير موجود.");
    const { error } = await db.from("crm_activities").delete().eq("id", data.id);
    if (error) throw new Error("تعذّر حذف النشاط.");
    await g.writeAudit(db, staff, {
      action: "crm.activity.delete",
      entity_type: "crm_activity",
      entity_id: data.id,
      description: `حذف نشاط «${before.subject}»`,
      before,
    });
    return { ok: true as const };
  });

/* ======================================================================== */
/* التقارير: ملخص خط البيع، التوقعات، المصادر                                */
/* ======================================================================== */

export const pipelineSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const g = await import("@/lib/admin-guard.server");
    await g.requireStaff(context.supabase, context.userId, "crm.read");
    const db = await g.admin();
    const [{ data: stages }, { data: deals }] = await Promise.all([
      db.from("crm_pipeline_stages").select("*").order("sort_order"),
      db.from("crm_deals").select("id, amount, stage_id, status, closed_at"),
    ]);
    const summary: CrmPipelineSummary[] = ((stages ?? []) as AnyClient[]).map((s) => {
      const stageDeals = ((deals ?? []) as AnyClient[]).filter(
        (d) => d.stage_id === s.id && d.status === "open",
      );
      const total = stageDeals.reduce((acc, d) => acc + Number(d.amount), 0);
      return {
        stage_id: s.id,
        stage_name: s.name,
        probability: s.probability,
        is_won: s.is_won,
        is_lost: s.is_lost,
        deals_count: stageDeals.length,
        total_amount: total,
        weighted_amount: Math.round(total * (s.probability / 100)),
      };
    });

    const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
    const openDeals = ((deals ?? []) as AnyClient[]).filter((d) => d.status === "open");
    const stageProbMap = new Map(((stages ?? []) as AnyClient[]).map((s) => [s.id, s.probability]));
    const forecast: CrmForecast = {
      total_open_amount: openDeals.reduce((acc, d) => acc + Number(d.amount), 0),
      total_weighted_amount: Math.round(
        openDeals.reduce(
          (acc, d) => acc + Number(d.amount) * ((stageProbMap.get(d.stage_id) ?? 0) / 100),
          0,
        ),
      ),
      won_amount_30d: ((deals ?? []) as AnyClient[])
        .filter((d) => d.status === "won" && d.closed_at && d.closed_at >= since30)
        .reduce((acc, d) => acc + Number(d.amount), 0),
      lost_amount_30d: ((deals ?? []) as AnyClient[])
        .filter((d) => d.status === "lost" && d.closed_at && d.closed_at >= since30)
        .reduce((acc, d) => acc + Number(d.amount), 0),
      open_deals_count: openDeals.length,
    };
    return { summary, forecast };
  });

export const sourceReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const g = await import("@/lib/admin-guard.server");
    await g.requireStaff(context.supabase, context.userId, "crm.read");
    const db = await g.admin();
    const [{ data: leads }, { data: deals }] = await Promise.all([
      db.from("crm_leads").select("source, status"),
      db.from("crm_deals").select("source, status, amount, utm"),
    ]);
    const bySource = new Map<string, CrmSourceReport>();
    for (const l of (leads ?? []) as AnyClient[]) {
      const key = l.source || "غير محدد";
      const row = bySource.get(key) ?? {
        source: key,
        leads_count: 0,
        converted_count: 0,
        deals_count: 0,
        won_deals_count: 0,
        won_amount: 0,
      };
      row.leads_count += 1;
      if (l.status === "converted") row.converted_count += 1;
      bySource.set(key, row);
    }
    for (const d of (deals ?? []) as AnyClient[]) {
      const key = d.source || "غير محدد";
      const row = bySource.get(key) ?? {
        source: key,
        leads_count: 0,
        converted_count: 0,
        deals_count: 0,
        won_deals_count: 0,
        won_amount: 0,
      };
      row.deals_count += 1;
      if (d.status === "won") {
        row.won_deals_count += 1;
        row.won_amount += Number(d.amount);
      }
      bySource.set(key, row);
    }

    const byUtm = new Map<string, CrmUtmReport>();
    for (const d of (deals ?? []) as AnyClient[]) {
      const utm = (d.utm ?? {}) as Record<string, string>;
      const key = `${utm.utm_source || "—"}|${utm.utm_medium || "—"}|${utm.utm_campaign || "—"}`;
      const row = byUtm.get(key) ?? {
        utm_source: utm.utm_source || "—",
        utm_medium: utm.utm_medium || "—",
        utm_campaign: utm.utm_campaign || "—",
        leads_count: 0,
        deals_count: 0,
        won_amount: 0,
      };
      row.deals_count += 1;
      if (d.status === "won") row.won_amount += Number(d.amount);
      byUtm.set(key, row);
    }

    return {
      sources: [...bySource.values()].sort((a, b) => b.leads_count - a.leads_count),
      utm: [...byUtm.values()].sort((a, b) => b.deals_count - a.deals_count),
    };
  });

/* ======================================================================== */
/* التصدير CSV                                                               */
/* ======================================================================== */

export const exportCrmCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ entity: z.enum(["leads", "companies", "contacts", "deals"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    const staff = await g.requireStaff(context.supabase, context.userId, "crm.export");
    const db = await g.admin();

    let csv = "";
    if (data.entity === "leads") {
      const { data: rows } = await db
        .from("crm_leads")
        .select("*")
        .order("created_at", { ascending: false });
      csv = buildCsv(
        ["الاسم", "الشركة", "البريد", "الجوال", "الحالة", "المصدر", "النقاط", "تاريخ الإنشاء"],
        ((rows ?? []) as AnyClient[]).map((r) => [
          r.full_name,
          r.company_name,
          r.email,
          r.phone,
          r.status,
          r.source,
          r.score,
          r.created_at,
        ]),
      );
    } else if (data.entity === "companies") {
      const { data: rows } = await db
        .from("crm_companies")
        .select("*")
        .order("created_at", { ascending: false });
      csv = buildCsv(
        ["الاسم", "القطاع", "المدينة", "البريد", "الجوال", "الحالة", "تاريخ الإنشاء"],
        ((rows ?? []) as AnyClient[]).map((r) => [
          r.name,
          r.sector,
          r.city,
          r.email,
          r.phone,
          r.status,
          r.created_at,
        ]),
      );
    } else if (data.entity === "contacts") {
      const { data: rows } = await db
        .from("crm_contacts")
        .select("*")
        .order("created_at", { ascending: false });
      csv = buildCsv(
        ["الاسم", "المسمى الوظيفي", "البريد", "الجوال", "أساسية", "تاريخ الإنشاء"],
        ((rows ?? []) as AnyClient[]).map((r) => [
          r.full_name,
          r.job_title,
          r.email,
          r.phone,
          r.is_primary ? "نعم" : "لا",
          r.created_at,
        ]),
      );
    } else {
      const { data: rows } = await db
        .from("crm_deals")
        .select("*")
        .order("created_at", { ascending: false });
      csv = buildCsv(
        [
          "العنوان",
          "القيمة",
          "العملة",
          "الاحتمالية",
          "الحالة",
          "تاريخ الإغلاق المتوقع",
          "تاريخ الإنشاء",
        ],
        ((rows ?? []) as AnyClient[]).map((r) => [
          r.title,
          r.amount,
          r.currency,
          r.probability,
          r.status,
          r.expected_close_date,
          r.created_at,
        ]),
      );
    }

    await g.writeAudit(db, staff, {
      action: "crm.export",
      entity_type: "crm_export",
      description: `تصدير بيانات CRM (${data.entity})`,
    });
    return { csv, filename: `crm-${data.entity}-${new Date().toISOString().slice(0, 10)}.csv` };
  });
