/**
 * دوال خادم مركز الدعم — الواجهة الوحيدة بين لوحة الإدارة والمحرك.
 *
 * قواعد ثابتة في كل دالة:
 *  - تحقق صلاحية `support.*` فعلي على الخادم قبل أي قراءة أو كتابة.
 *  - تحقق مدخلات بـ Zod (لا ثقة بأي قيمة من الواجهة، ولا مهل محسوبة عندها).
 *  - سجل تدقيق يحمل معرّف الطلب ومعرّف الارتباط لكل عملية كتابة.
 *  - رسائل خطأ عربية آمنة لا تكشف تفاصيل داخلية.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assignSchema,
  categorySchema,
  createTicketSchema,
  csatRequestSchema,
  csatSubmitSchema,
  csatTokenSchema,
  escalateSchema,
  escalationRuleSchema,
  mergeSchema,
  noteSchema,
  replySchema,
  reportRangeSchema,
  slaPolicySchema,
  splitSchema,
  tagsSchema,
  teamMemberSchema,
  teamSchema,
  ticketFiltersSchema,
  ticketIdSchema,
  transitionSchema,
  updateTicketSchema,
  uuid,
} from "./support.schemas";

/* ------------------------------------------------------------------ القراءة */

export const listSupportTickets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ticketFiltersSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { supportCtx } = await import("./ctx.server");
    const ctx = await supportCtx(context.supabase, context.userId, "support.read");
    const { listTickets } = await import("./tickets.server");
    return listTickets(ctx.db, ctx.actor, data);
  });

export const getSupportTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ticketId: string }) => ticketIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supportCtx } = await import("./ctx.server");
    const ctx = await supportCtx(context.supabase, context.userId, "support.read");
    const { getTicket } = await import("./tickets.server");
    return getTicket(ctx.db, ctx.actor, data.ticketId);
  });

/** بيانات التشغيل: الفرق والتصنيفات والوسوم والموظفون + صلاحيات المستخدم الحالي. */
export const getSupportQueueCounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supportCtx } = await import("./ctx.server");
    const ctx = await supportCtx(context.supabase, context.userId, "support.read");
    const { queueCounts } = await import("./tickets.server");
    return queueCounts(ctx.db, ctx.actor);
  });

export const getSupportWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supportCtx, canDo } = await import("./ctx.server");
    const ctx = await supportCtx(context.supabase, context.userId, "support.read");
    const { loadSupportConfig } = await import("./config.server");
    const config = await loadSupportConfig(ctx.db);
    return {
      teams: config.teams.map((t) => ({ id: t.id, name: t.name_ar, isActive: t.is_active })),
      categories: config.categories.map((c) => ({
        code: c.code,
        name: c.name_ar,
        isActive: c.is_active,
        defaultPriority: c.default_priority,
      })),
      tags: config.tags,
      staff: config.staff.map((s) => ({ userId: s.user_id, name: s.full_name })),
      me: {
        userId: ctx.actor.userId,
        name: ctx.actor.name,
        teamIds: ctx.actor.teamIds,
        canViewAllOffices: ctx.actor.canViewAllOffices,
      },
      permissions: {
        create: canDo(ctx, "support.create"),
        reply: canDo(ctx, "support.reply"),
        assign: canDo(ctx, "support.assign"),
        escalate: canDo(ctx, "support.escalate"),
        close: canDo(ctx, "support.close"),
        reopen: canDo(ctx, "support.reopen"),
        merge: canDo(ctx, "support.merge"),
        manageSla: canDo(ctx, "support.manage_sla"),
        manageCategories: canDo(ctx, "support.manage_categories"),
        export: canDo(ctx, "support.export"),
      },
    };
  });

/* ------------------------------------------------------------------ الكتابة */

export const createSupportTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createTicketSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supportCtx, auditSupport, safeMessage } = await import("./ctx.server");
    const ctx = await supportCtx(context.supabase, context.userId, "support.create");
    const { createTicket } = await import("./tickets.server");
    try {
      const created = await createTicket(ctx.db, {
        subject: data.subject,
        description: data.description,
        category: data.category,
        priority: data.priority ?? null,
        channel: data.channel,
        requesterEmail: data.requesterEmail ?? null,
        requesterName: data.requesterName ?? null,
        organizationId: data.organizationId ?? null,
        actor: { userId: ctx.actor.userId, name: ctx.actor.name },
      });
      if (data.teamId) {
        const { assignTicket } = await import("./tickets.server");
        await assignTicket(ctx.db, ctx.actor, { ticketId: created.id, teamId: data.teamId });
      }
      await auditSupport(ctx, {
        action: "support.ticket.create",
        entityId: created.id,
        description: `إنشاء تذكرة ${created.ticketNumber}`,
        after: { subject: data.subject, category: data.category, channel: data.channel },
      });
      const { notifyOffice } = await import("./notify.server");
      const { data: row } = await ctx.db
        .from("support_tickets")
        .select("organization_id, user_id")
        .eq("id", created.id)
        .maybeSingle();
      await notifyOffice(
        ctx.db,
        {
          id: created.id,
          ticket_number: created.ticketNumber,
          organization_id:
            (row as { organization_id: string | null } | null)?.organization_id ?? null,
          user_id: (row as { user_id: string | null } | null)?.user_id ?? null,
        },
        "ticket_created",
      );
      return created;
    } catch (error) {
      throw new Error(safeMessage(error, "تعذّر إنشاء التذكرة."));
    }
  });

export const replySupportTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => replySchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supportCtx, auditSupport, safeMessage, claimIdempotency } =
      await import("./ctx.server");
    const ctx = await supportCtx(context.supabase, context.userId, "support.reply");
    if (data.clientRequestId) {
      const claim = await claimIdempotency(ctx.db, `reply:${data.clientRequestId}`, data.ticketId);
      if (!claim.fresh) return { emailSent: false, duplicate: true as const };
    }
    if (data.nextStatus === "closed" || data.nextStatus === "resolved") {
      const { ensurePermission } = await import("./ctx.server");
      ensurePermission(ctx, "support.close");
    }
    try {
      const { replyToTicket } = await import("./tickets.server");
      const result = await replyToTicket(ctx.db, ctx.actor, {
        ticketId: data.ticketId,
        body: data.body,
        nextStatus: data.nextStatus ?? null,
      });
      await auditSupport(ctx, {
        action: "support.ticket.reply",
        entityId: data.ticketId,
        description: "رد على المكتب",
        after: {
          length: data.body.length,
          email_sent: result.emailSent,
          next_status: data.nextStatus ?? null,
        },
      });
      const { notifyOffice } = await import("./notify.server");
      const { data: row } = await ctx.db
        .from("support_tickets")
        .select("id, ticket_number, reference, organization_id, user_id, status")
        .eq("id", data.ticketId)
        .maybeSingle();
      const ticket = row as Record<string, unknown> | null;
      if (ticket) {
        await notifyOffice(
          ctx.db,
          {
            id: data.ticketId,
            ticket_number: (ticket["ticket_number"] as string | null) ?? null,
            reference: (ticket["reference"] as string | null) ?? null,
            organization_id: (ticket["organization_id"] as string | null) ?? null,
            user_id: (ticket["user_id"] as string | null) ?? null,
          },
          ticket["status"] === "awaiting_reply" ? "awaiting_customer" : "new_reply",
          new Date().toISOString().slice(0, 16),
        );
      }
      return { ...result, duplicate: false as const };
    } catch (error) {
      throw new Error(safeMessage(error, "تعذّر إرسال الرد."));
    }
  });

export const addSupportNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => noteSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supportCtx, auditSupport, safeMessage, claimIdempotency } =
      await import("./ctx.server");
    const ctx = await supportCtx(context.supabase, context.userId, "support.reply");
    if (data.clientRequestId) {
      const claim = await claimIdempotency(ctx.db, `note:${data.clientRequestId}`, data.ticketId);
      if (!claim.fresh) return { ok: true as const, duplicate: true as const };
    }
    try {
      const { addInternalNote } = await import("./tickets.server");
      await addInternalNote(ctx.db, ctx.actor, {
        ticketId: data.ticketId,
        body: data.body,
        mentions: data.mentions ?? [],
      });
      await auditSupport(ctx, {
        action: "support.ticket.note",
        entityId: data.ticketId,
        description: "ملاحظة داخلية",
        after: { length: data.body.length },
      });
      return { ok: true as const, duplicate: false as const };
    } catch (error) {
      throw new Error(safeMessage(error, "تعذّر حفظ الملاحظة."));
    }
  });

export const transitionSupportTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => transitionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supportCtx, auditSupport, safeMessage, ensurePermission } =
      await import("./ctx.server");
    const permission =
      data.to === "closed" || data.to === "resolved" ? "support.close" : "support.reply";
    const ctx = await supportCtx(context.supabase, context.userId, permission);
    const { data: current } = await ctx.db
      .from("support_tickets")
      .select("status, organization_id, user_id, ticket_number, reference")
      .eq("id", data.ticketId)
      .maybeSingle();
    const before = current as Record<string, unknown> | null;
    if (before?.["status"] === "closed" && data.to !== "closed")
      ensurePermission(ctx, "support.reopen");

    try {
      const { transitionTicket } = await import("./tickets.server");
      const result = await transitionTicket(ctx.db, ctx.actor, {
        ticketId: data.ticketId,
        to: data.to,
        reason: data.reason ?? null,
      });
      await auditSupport(ctx, {
        action: "support.ticket.transition",
        entityId: data.ticketId,
        description: `تغيير الحالة إلى ${data.to}`,
        before: { status: before?.["status"] ?? null },
        after: { status: result.status, sla_state: result.slaState },
        metadata: { reason: data.reason ?? null },
      });
      const { notifyOffice } = await import("./notify.server");
      const notifyEvent =
        data.to === "resolved"
          ? "resolved"
          : data.to === "closed"
            ? "closed"
            : before?.["status"] === "closed"
              ? "reopened"
              : null;
      if (notifyEvent && before) {
        await notifyOffice(
          ctx.db,
          {
            id: data.ticketId,
            ticket_number: (before["ticket_number"] as string | null) ?? null,
            reference: (before["reference"] as string | null) ?? null,
            organization_id: (before["organization_id"] as string | null) ?? null,
            user_id: (before["user_id"] as string | null) ?? null,
          },
          notifyEvent,
        );
      }
      return result;
    } catch (error) {
      throw new Error(safeMessage(error, "تعذّر تحديث حالة التذكرة."));
    }
  });

export const assignSupportTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => assignSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supportCtx, auditSupport, safeMessage } = await import("./ctx.server");
    const ctx = await supportCtx(context.supabase, context.userId, "support.assign");
    try {
      const { assignTicket } = await import("./tickets.server");
      const { data: before } = await ctx.db
        .from("support_tickets")
        .select("assigned_to, team_id, ticket_number, reference, subject")
        .eq("id", data.ticketId)
        .maybeSingle();
      await assignTicket(ctx.db, ctx.actor, {
        ticketId: data.ticketId,
        ...(data.assignedTo === undefined ? {} : { assignedTo: data.assignedTo }),
        ...(data.teamId === undefined ? {} : { teamId: data.teamId }),
        reason: data.reason ?? null,
      });
      await auditSupport(ctx, {
        action: "support.ticket.assign",
        entityId: data.ticketId,
        description: "إسناد التذكرة",
        before: before ?? null,
        after: { assigned_to: data.assignedTo ?? null, team_id: data.teamId ?? null },
      });
      if (data.assignedTo) {
        const { notifyStaff } = await import("./notify.server");
        const row = before as Record<string, unknown> | null;
        await notifyStaff(
          ctx.db,
          {
            id: data.ticketId,
            ticket_number: (row?.["ticket_number"] as string | null) ?? null,
            reference: (row?.["reference"] as string | null) ?? null,
            subject: (row?.["subject"] as string | null) ?? null,
          },
          "assigned",
          { targetUserId: data.assignedTo, stamp: new Date().toISOString().slice(0, 16) },
        );
      }
      return { ok: true as const };
    } catch (error) {
      throw new Error(safeMessage(error, "تعذّر تنفيذ الإسناد."));
    }
  });

export const escalateSupportTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => escalateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supportCtx, auditSupport, safeMessage } = await import("./ctx.server");
    const ctx = await supportCtx(context.supabase, context.userId, "support.escalate");
    try {
      const { escalateTicket } = await import("./tickets.server");
      const result = await escalateTicket(ctx.db, ctx.actor, {
        ticketId: data.ticketId,
        reason: data.reason,
      });
      await auditSupport(ctx, {
        action: "support.ticket.escalate",
        entityId: data.ticketId,
        description: `تصعيد إلى المستوى ${result.level}`,
        after: result,
        metadata: { reason: data.reason },
      });
      const { notifyStaff } = await import("./notify.server");
      const { data: row } = await ctx.db
        .from("support_tickets")
        .select("ticket_number, reference, subject, assigned_to")
        .eq("id", data.ticketId)
        .maybeSingle();
      const ticket = row as Record<string, unknown> | null;
      await notifyStaff(
        ctx.db,
        {
          id: data.ticketId,
          ticket_number: (ticket?.["ticket_number"] as string | null) ?? null,
          reference: (ticket?.["reference"] as string | null) ?? null,
          subject: (ticket?.["subject"] as string | null) ?? null,
          assigned_to: (ticket?.["assigned_to"] as string | null) ?? null,
        },
        "escalated",
        { reason: data.reason, stamp: String(result.level) },
      );
      return result;
    } catch (error) {
      throw new Error(safeMessage(error, "تعذّر تصعيد التذكرة."));
    }
  });

export const mergeSupportTickets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => mergeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supportCtx, auditSupport, safeMessage } = await import("./ctx.server");
    const ctx = await supportCtx(context.supabase, context.userId, "support.merge");
    try {
      const { mergeTickets } = await import("./tickets.server");
      await mergeTickets(ctx.db, ctx.actor, data);
      await auditSupport(ctx, {
        action: "support.ticket.merge",
        entityId: data.sourceId,
        description: "دمج تذكرتين",
        after: { target_id: data.targetId },
        metadata: { reason: data.reason },
      });
      return { ok: true as const };
    } catch (error) {
      throw new Error(safeMessage(error, "تعذّر دمج التذاكر."));
    }
  });

export const splitSupportTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => splitSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supportCtx, auditSupport, safeMessage } = await import("./ctx.server");
    const ctx = await supportCtx(context.supabase, context.userId, "support.merge");
    try {
      const { splitTicket } = await import("./tickets.server");
      const created = await splitTicket(ctx.db, ctx.actor, {
        ticketId: data.ticketId,
        subject: data.subject,
        description: data.description,
        category: data.category ?? null,
        reason: data.reason,
      });
      await auditSupport(ctx, {
        action: "support.ticket.split",
        entityId: data.ticketId,
        description: `تقسيم إلى ${created.ticketNumber}`,
        after: created,
        metadata: { reason: data.reason },
      });
      return created;
    } catch (error) {
      throw new Error(safeMessage(error, "تعذّر تقسيم التذكرة."));
    }
  });

export const setSupportTicketTags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => tagsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supportCtx, auditSupport, safeMessage } = await import("./ctx.server");
    const ctx = await supportCtx(context.supabase, context.userId, "support.reply");
    try {
      const { setTicketTags } = await import("./tickets.server");
      await setTicketTags(ctx.db, ctx.actor, data);
      await auditSupport(ctx, {
        action: "support.ticket.tags",
        entityId: data.ticketId,
        description: "تحديث وسوم التذكرة",
        after: { tag_ids: data.tagIds },
      });
      return { ok: true as const };
    } catch (error) {
      throw new Error(safeMessage(error, "تعذّر تحديث الوسوم."));
    }
  });

export const updateSupportTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateTicketSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supportCtx, auditSupport, safeMessage } = await import("./ctx.server");
    const ctx = await supportCtx(context.supabase, context.userId, "support.reply");
    try {
      const { updateTicketFields } = await import("./tickets.server");
      await updateTicketFields(ctx.db, ctx.actor, {
        ticketId: data.ticketId,
        ...(data.priority ? { priority: data.priority } : {}),
        ...(data.category ? { category: data.category } : {}),
        reason: data.reason ?? null,
      });
      if (data.subject) {
        await ctx.db
          .from("support_tickets")
          .update({ subject: data.subject })
          .eq("id", data.ticketId);
      }
      await auditSupport(ctx, {
        action: "support.ticket.update",
        entityId: data.ticketId,
        description: "تحديث بيانات التذكرة",
        after: {
          priority: data.priority ?? null,
          category: data.category ?? null,
          subject: data.subject ?? null,
        },
      });
      return { ok: true as const };
    } catch (error) {
      throw new Error(safeMessage(error, "تعذّر تحديث التذكرة."));
    }
  });

/** مراجعة هوية مُقدّم الطلب وربطه بمكتب. */
export const reviewSupportIdentity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        ticketId: uuid,
        organizationId: uuid.nullable().optional(),
        note: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supportCtx, auditSupport, safeMessage } = await import("./ctx.server");
    const ctx = await supportCtx(context.supabase, context.userId, "support.reply");
    try {
      const { data: before } = await ctx.db
        .from("support_tickets")
        .select("organization_id, identity_source, needs_identity_review")
        .eq("id", data.ticketId)
        .maybeSingle();
      const patch: Record<string, unknown> = {
        needs_identity_review: false,
        identity_source: "manual",
      };
      if (data.organizationId !== undefined) patch["organization_id"] = data.organizationId;
      const { error } = await ctx.db.from("support_tickets").update(patch).eq("id", data.ticketId);
      if (error) throw new Error("تعذّر تحديث هوية مُقدّم الطلب.");

      const { writeTicketEvent } = await import("./tickets.server");
      await writeTicketEvent(ctx.db, {
        ticketId: data.ticketId,
        eventType: "identity_reviewed",
        actorId: ctx.actor.userId,
        actorName: ctx.actor.name,
        before: before ?? null,
        after: patch,
        reason: data.note ?? null,
      });
      await auditSupport(ctx, {
        action: "support.ticket.identity_review",
        entityId: data.ticketId,
        description: "مراجعة هوية مُقدّم الطلب",
        before: before ?? null,
        after: patch,
      });
      return { ok: true as const };
    } catch (error) {
      throw new Error(safeMessage(error, "تعذّر تحديث هوية مُقدّم الطلب."));
    }
  });

/* ------------------------------------------------------------------ التقييم */

export const requestSupportCsat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => csatRequestSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supportCtx, auditSupport, safeMessage } = await import("./ctx.server");
    const ctx = await supportCtx(context.supabase, context.userId, "support.close");
    try {
      const { requestCsat } = await import("./csat.server");
      const { siteOrigin } = await import("@/lib/admin-guard.server");
      const result = await requestCsat(
        ctx.db,
        data.ticketId,
        { userId: ctx.actor.userId, email: ctx.actor.email, name: ctx.actor.name },
        siteOrigin(),
      );
      await auditSupport(ctx, {
        action: "support.csat.request",
        entityId: data.ticketId,
        description: "إرسال طلب تقييم",
        after: result,
      });
      return result;
    } catch (error) {
      throw new Error(safeMessage(error, "تعذّر إرسال طلب التقييم."));
    }
  });

/** قراءة دعوة تقييم — عامة بحكم أن الرمز نفسه هو الإثبات. */
export const getCsatInvitation = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => csatTokenSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadCsatInvite } = await import("./csat.server");
    return loadCsatInvite(supabaseAdmin, data.token);
  });

export const submitCsatRating = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => csatSubmitSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { submitCsat } = await import("./csat.server");
    return submitCsat(supabaseAdmin, data.token, data.rating, data.comment ?? null);
  });

/* ------------------------------------------------------------------ التقارير */

export const getSupportReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => reportRangeSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { supportCtx } = await import("./ctx.server");
    const ctx = await supportCtx(context.supabase, context.userId, "support.read");
    const { buildSupportReport } = await import("./reports.server");
    return buildSupportReport(ctx.db, ctx.actor, data);
  });

/** تصدير التذاكر — يُسجَّل في التدقيق لأنه إخراج بيانات. */
export const exportSupportTickets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ticketFiltersSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { supportCtx, auditSupport } = await import("./ctx.server");
    const ctx = await supportCtx(context.supabase, context.userId, "support.export");
    const { listTickets } = await import("./tickets.server");
    const result = await listTickets(ctx.db, ctx.actor, { ...data, limit: 200, offset: 0 });
    await auditSupport(ctx, {
      action: "support.tickets.export",
      entityType: "support_report",
      description: `تصدير ${result.rows.length} تذكرة`,
      after: { filters: data, count: result.rows.length },
    });
    return result;
  });

/* ------------------------------------------------------------------ الإعدادات */

export const getSupportConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supportCtx, canDo } = await import("./ctx.server");
    const ctx = await supportCtx(context.supabase, context.userId, "support.read");
    const { loadSupportConfig } = await import("./config.server");
    const config = await loadSupportConfig(ctx.db);
    return {
      ...config,
      permissions: {
        manageSla: canDo(ctx, "support.manage_sla"),
        manageCategories: canDo(ctx, "support.manage_categories"),
      },
    };
  });

export const saveSupportTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => teamSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supportCtx, auditSupport, safeMessage } = await import("./ctx.server");
    const ctx = await supportCtx(context.supabase, context.userId, "support.manage_sla");
    const mod = await import("./config.server");
    try {
      await mod.saveTeam(ctx.db, data);
      await auditSupport(ctx, {
        action: "support.team.save",
        entityType: "support_config",
        description: "support.team.save",
        after: data as Record<string, unknown>,
      });
      return { ok: true as const };
    } catch (error) {
      throw new Error(safeMessage(error, "تعذّر حفظ الإعداد."));
    }
  });

export const saveSupportTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    teamMemberSchema.extend({ remove: z.boolean().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supportCtx, auditSupport, safeMessage } = await import("./ctx.server");
    const ctx = await supportCtx(context.supabase, context.userId, "support.manage_sla");
    const mod = await import("./config.server");
    try {
      await mod.setTeamMember(ctx.db, data);
      await auditSupport(ctx, {
        action: "support.team.member",
        entityType: "support_config",
        description: "support.team.member",
        after: data as Record<string, unknown>,
      });
      return { ok: true as const };
    } catch (error) {
      throw new Error(safeMessage(error, "تعذّر حفظ الإعداد."));
    }
  });

export const saveSupportCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => categorySchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supportCtx, auditSupport, safeMessage } = await import("./ctx.server");
    const ctx = await supportCtx(context.supabase, context.userId, "support.manage_categories");
    const mod = await import("./config.server");
    try {
      await mod.saveCategory(ctx.db, data);
      await auditSupport(ctx, {
        action: "support.category.save",
        entityType: "support_config",
        description: "support.category.save",
        after: data as Record<string, unknown>,
      });
      return { ok: true as const };
    } catch (error) {
      throw new Error(safeMessage(error, "تعذّر حفظ الإعداد."));
    }
  });

export const saveSupportPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => slaPolicySchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supportCtx, auditSupport, safeMessage } = await import("./ctx.server");
    const ctx = await supportCtx(context.supabase, context.userId, "support.manage_sla");
    const mod = await import("./config.server");
    try {
      await mod.savePolicy(ctx.db, data);
      await auditSupport(ctx, {
        action: "support.sla_policy.save",
        entityType: "support_config",
        description: "support.sla_policy.save",
        after: data as Record<string, unknown>,
      });
      return { ok: true as const };
    } catch (error) {
      throw new Error(safeMessage(error, "تعذّر حفظ الإعداد."));
    }
  });

export const saveSupportRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => escalationRuleSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supportCtx, auditSupport, safeMessage } = await import("./ctx.server");
    const ctx = await supportCtx(context.supabase, context.userId, "support.manage_sla");
    const mod = await import("./config.server");
    try {
      await mod.saveRule(ctx.db, data);
      await auditSupport(ctx, {
        action: "support.escalation_rule.save",
        entityType: "support_config",
        description: "support.escalation_rule.save",
        after: data as Record<string, unknown>,
      });
      return { ok: true as const };
    } catch (error) {
      throw new Error(safeMessage(error, "تعذّر حفظ الإعداد."));
    }
  });

export const saveSupportTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: uuid.optional(),
        nameAr: z.string().trim().min(1, "اسم الوسم مطلوب").max(60),
        color: z
          .string()
          .trim()
          .regex(/^#[0-9a-fA-F]{6}$/, "اللون بصيغة #RRGGBB"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supportCtx, auditSupport, safeMessage } = await import("./ctx.server");
    const ctx = await supportCtx(context.supabase, context.userId, "support.manage_categories");
    const mod = await import("./config.server");
    try {
      await mod.saveTag(ctx.db, data);
      await auditSupport(ctx, {
        action: "support.tag.save",
        entityType: "support_config",
        description: "support.tag.save",
        after: data as Record<string, unknown>,
      });
      return { ok: true as const };
    } catch (error) {
      throw new Error(safeMessage(error, "تعذّر حفظ الإعداد."));
    }
  });

export const deleteSupportTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { supportCtx, auditSupport, safeMessage } = await import("./ctx.server");
    const ctx = await supportCtx(context.supabase, context.userId, "support.manage_categories");
    const mod = await import("./config.server");
    try {
      await mod.deleteTag(ctx.db, data.id);
      await auditSupport(ctx, {
        action: "support.tag.delete",
        entityType: "support_config",
        description: "support.tag.delete",
        after: data as Record<string, unknown>,
      });
      return { ok: true as const };
    } catch (error) {
      throw new Error(safeMessage(error, "تعذّر حفظ الإعداد."));
    }
  });

export const saveSupportCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: uuid.optional(),
        code: z
          .string()
          .trim()
          .regex(/^[a-z0-9_-]{2,40}$/, "الرمز بحروف إنجليزية صغيرة وأرقام فقط"),
        nameAr: z.string().trim().min(1, "اسم التقويم مطلوب").max(120),
        timezone: z.string().trim().min(3).max(60),
        workDays: z.array(z.number().int().min(0).max(6)).min(1, "اختر أيام العمل").max(7),
        startMinute: z.number().int().min(0).max(1439),
        endMinute: z.number().int().min(1).max(1440),
        isActive: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supportCtx, auditSupport, safeMessage } = await import("./ctx.server");
    const ctx = await supportCtx(context.supabase, context.userId, "support.manage_sla");
    const mod = await import("./config.server");
    try {
      await mod.saveCalendar(ctx.db, data);
      await auditSupport(ctx, {
        action: "support.calendar.save",
        entityType: "support_config",
        description: "support.calendar.save",
        after: data as Record<string, unknown>,
      });
      return { ok: true as const };
    } catch (error) {
      throw new Error(safeMessage(error, "تعذّر حفظ الإعداد."));
    }
  });

export const saveSupportHoliday = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        calendarId: uuid,
        holidayDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "التاريخ بصيغة سنة-شهر-يوم"),
        nameAr: z.string().trim().min(1, "اسم العطلة مطلوب").max(120),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supportCtx, auditSupport, safeMessage } = await import("./ctx.server");
    const ctx = await supportCtx(context.supabase, context.userId, "support.manage_sla");
    const mod = await import("./config.server");
    try {
      await mod.saveHoliday(ctx.db, data);
      await auditSupport(ctx, {
        action: "support.holiday.save",
        entityType: "support_config",
        description: "support.holiday.save",
        after: data as Record<string, unknown>,
      });
      return { ok: true as const };
    } catch (error) {
      throw new Error(safeMessage(error, "تعذّر حفظ الإعداد."));
    }
  });

export const deleteSupportHoliday = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { supportCtx, auditSupport, safeMessage } = await import("./ctx.server");
    const ctx = await supportCtx(context.supabase, context.userId, "support.manage_sla");
    const mod = await import("./config.server");
    try {
      await mod.deleteHoliday(ctx.db, data.id);
      await auditSupport(ctx, {
        action: "support.holiday.delete",
        entityType: "support_config",
        description: "support.holiday.delete",
        after: data as Record<string, unknown>,
      });
      return { ok: true as const };
    } catch (error) {
      throw new Error(safeMessage(error, "تعذّر حفظ الإعداد."));
    }
  });

/* ------------------------------------------------- تذكرة من بوابة المكتب */

const officeTicketSchema = z.object({
  subject: z.string().trim().min(1, "الموضوع مطلوب").max(300),
  description: z.string().trim().min(1, "الوصف مطلوب").max(20_000),
  category: z.string().trim().min(1).max(40),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  clientRequestId: z.string().trim().min(6).max(80).optional(),
});

/**
 * فتح تذكرة من بوابة المكتب: تمر بالمحرك نفسه لتُطبَّق المهل والفريق
 * والتصنيف الافتراضي، ولا تُقبل أي حالة أو مهلة من الواجهة.
 */
export const createOfficeSupportTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => officeTicketSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("email, full_name")
      .eq("id", context.userId)
      .maybeSingle();
    const { data: membership } = await context.supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", context.userId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as never;

    const { createTicket } = await import("./tickets.server");
    const created = await createTicket(db as never, {
      subject: data.subject,
      description: data.description,
      category: data.category,
      priority: data.priority ?? null,
      channel: "portal",
      requesterEmail: (profile as { email: string | null } | null)?.email ?? null,
      requesterName: (profile as { full_name: string | null } | null)?.full_name ?? null,
      userId: context.userId,
      organizationId: (membership as { organization_id: string } | null)?.organization_id ?? null,
    });
    return created;
  });
