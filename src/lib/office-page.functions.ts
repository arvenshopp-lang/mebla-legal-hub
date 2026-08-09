/**
 * دوال خادم الصفحة العامة للمكتب.
 * كل عملية تمر عبر جلسة المستخدم (RLS) + بوابة استحقاق الباقة، وتُسجّل في سجل نشاط المكتب.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  OFFICE_LEAD_STATUSES,
  officeSnapshotSchema,
  slugSchema,
  type OfficeSnapshot,
} from "@/lib/office-page.shared";

const orgInput = z.object({ organizationId: z.string().uuid() });

export const getOfficePageState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => orgInput.parse(d))
  .handler(async ({ data, context }) => {
    const ops = await import("@/lib/office-page.ops.server");
    return await ops.readState(context.supabase, data.organizationId);
  });

export const saveOfficePageDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    orgInput.extend({ draft: officeSnapshotSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const ops = await import("@/lib/office-page.ops.server");
    return await ops.saveDraft(context.supabase, context.userId, data.organizationId, data.draft as OfficeSnapshot);
  });

export const changeOfficePageSlug = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => orgInput.extend({ slug: slugSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const ops = await import("@/lib/office-page.ops.server");
    return await ops.changeSlug(context.supabase, context.userId, data.organizationId, data.slug);
  });

export const publishOfficePage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => orgInput.parse(d))
  .handler(async ({ data, context }) => {
    const ops = await import("@/lib/office-page.ops.server");
    return await ops.publish(context.supabase, context.userId, data.organizationId);
  });

export const unpublishOfficePage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => orgInput.parse(d))
  .handler(async ({ data, context }) => {
    const ops = await import("@/lib/office-page.ops.server");
    return await ops.unpublish(context.supabase, context.userId, data.organizationId);
  });

export const uploadOfficePageMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    orgInput
      .extend({
        kind: z.enum(["logo", "cover", "team"]),
        contentType: z.string().trim().max(80),
        /** الملف بترميز base64 — يُتحقق من بايتاته الفعلية على الخادم. */
        base64: z.string().min(16).max(3_500_000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ops = await import("@/lib/office-page.ops.server");
    return await ops.uploadMedia(context.supabase, context.userId, data);
  });

export const previewOfficePage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => orgInput.parse(d))
  .handler(async ({ data, context }) => {
    const ops = await import("@/lib/office-page.ops.server");
    return await ops.previewView(context.supabase, data.organizationId);
  });

export const listOfficeLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    orgInput
      .extend({
        search: z.string().trim().max(120).default(""),
        status: z.enum(["all", ...OFFICE_LEAD_STATUSES]).default("all"),
        page: z.number().int().min(1).max(500).default(1),
        pageSize: z.number().int().min(5).max(50).default(20),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ops = await import("@/lib/office-page.ops.server");
    return await ops.listLeads(context.supabase, data);
  });

export const updateOfficeLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    orgInput
      .extend({
        leadId: z.string().uuid(),
        status: z.enum(OFFICE_LEAD_STATUSES).optional(),
        internalNote: z.string().trim().max(2000).optional(),
        assignedTo: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ops = await import("@/lib/office-page.ops.server");
    return await ops.updateLead(context.supabase, context.userId, data);
  });

export const convertOfficeLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => orgInput.extend({ leadId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ops = await import("@/lib/office-page.ops.server");
    return await ops.convertLead(context.supabase, context.userId, data.organizationId, data.leadId);
  });

export const getOfficePageAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    orgInput.extend({ days: z.number().int().min(7).max(90).default(30) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const ops = await import("@/lib/office-page.ops.server");
    return await ops.analytics(context.supabase, data.organizationId, data.days);
  });