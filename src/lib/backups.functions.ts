/**
 * دوال خادم مركز النسخ الاحتياطية: سجل قراءة/تسجيل (backups.manage)
 * واعتماد الاستعادة بمبدأ Four-Eyes (backups.restore). لا تنفيذ فعلي للاستعادة هنا؛
 * التنفيذ يتم يدوياً على مستوى الاستضافة ويُسجَّل تاريخه فقط بعد وقوعه.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { BackupSnapshot, RestoreRequest } from "@/lib/backups.shared";

const guard = () => import("@/lib/admin-guard.server");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

const SNAPSHOT_COLUMNS =
  "id, kind, source, external_id, status, started_at, finished_at, size_bytes, checksum, notes, recorded_by, retention_until, verified_at, verified_by, created_at";

export const listBackupSnapshots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        status: z.string().trim().max(30).default(""),
        kind: z.string().trim().max(30).default(""),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<{ rows: BackupSnapshot[] }> => {
    const g = await guard();
    await g.requireStaff(context.supabase, context.userId, "backups.manage");
    const db = await g.admin();
    let q = (db as AnyClient)
      .from("platform_backup_snapshots")
      .select(SNAPSHOT_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status) q = q.eq("status", data.status);
    if (data.kind) q = q.eq("kind", data.kind);
    const { data: rows, error } = await q;
    if (error) throw new Error("تعذّر قراءة سجل النسخ الاحتياطية.");
    return { rows: (rows ?? []) as BackupSnapshot[] };
  });

const recordSchema = z.object({
  kind: z.enum(["daily", "weekly", "pre_release", "manual"]),
  source: z.enum(["managed_platform", "manual_export", "external"]),
  externalId: z.string().trim().max(160).optional().nullable(),
  sizeBytes: z.coerce.number().int().min(0).optional().nullable(),
  startedAt: z.string().datetime().optional().nullable(),
  finishedAt: z.string().datetime().optional().nullable(),
  retentionUntil: z.string().datetime().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  status: z.enum(["unknown", "in_progress", "completed", "failed"]).default("completed"),
});

export const recordBackupSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => recordSchema.parse(input))
  .handler(async ({ data, context }) => {
    const g = await guard();
    const staff = await g.requireStaff(context.supabase, context.userId, "backups.manage");
    const db = await g.admin();

    const payload = {
      kind: data.kind,
      source: data.source,
      external_id: data.externalId?.trim() || null,
      size_bytes: data.sizeBytes ?? null,
      started_at: data.startedAt ?? null,
      finished_at: data.finishedAt ?? null,
      retention_until: data.retentionUntil ?? null,
      notes: data.notes?.trim() || null,
      status: data.status,
      recorded_by: staff.id,
    };
    const { data: saved, error } = await (db as AnyClient)
      .from("platform_backup_snapshots")
      .insert(payload)
      .select("id")
      .maybeSingle();
    if (error) throw new Error("تعذّر تسجيل النسخة الاحتياطية.");

    await g.writeAudit(db, staff, {
      action: "backup_snapshot_recorded",
      entity_type: "platform_backup_snapshots",
      entity_id: saved?.id ?? null,
      description: `تسجيل نسخة احتياطية (${data.kind}) من مصدر «${data.source}».`,
      after: payload,
    });
    return { id: saved?.id as string };
  });

const verifySchema = z.object({
  id: z.string().uuid(),
  checksum: z.string().trim().max(200).optional().nullable(),
});

export const verifyBackupSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => verifySchema.parse(input))
  .handler(async ({ data, context }) => {
    const g = await guard();
    const staff = await g.requireStaff(context.supabase, context.userId, "backups.manage");
    const db = await g.admin();

    const { data: existing } = await (db as AnyClient)
      .from("platform_backup_snapshots")
      .select(SNAPSHOT_COLUMNS)
      .eq("id", data.id)
      .maybeSingle();
    if (!existing) throw new Error("هذه النسخة غير موجودة.");

    const payload = {
      verified_at: new Date().toISOString(),
      verified_by: staff.id,
      checksum: data.checksum?.trim() || existing.checksum,
    };
    const { error } = await (db as AnyClient)
      .from("platform_backup_snapshots")
      .update(payload)
      .eq("id", data.id);
    if (error) throw new Error("تعذّر تسجيل التحقق من سلامة النسخة.");

    await g.writeAudit(db, staff, {
      action: "backup_snapshot_verified",
      entity_type: "platform_backup_snapshots",
      entity_id: data.id,
      description: "تأكيد التحقق من سلامة النسخة الاحتياطية.",
      before: existing,
      after: { ...existing, ...payload },
    });
    return { ok: true };
  });

const REQUEST_COLUMNS =
  "id, snapshot_id, scope, reason, status, requested_by, requested_by_email, approved_by, approved_by_email, approved_at, decision_note, executed_at, created_at, updated_at";

export const listRestoreRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ rows: RestoreRequest[] }> => {
    const g = await guard();
    await g.requireStaff(context.supabase, context.userId, "backups.manage");
    const db = await g.admin();
    const { data: rows, error } = await (db as AnyClient)
      .from("platform_backup_restore_requests")
      .select(REQUEST_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error("تعذّر قراءة طلبات الاستعادة.");
    return { rows: (rows ?? []) as RestoreRequest[] };
  });

const requestSchema = z.object({
  snapshotId: z.string().uuid().optional().nullable(),
  scope: z.enum(["full", "table", "point_in_time"], {
    message: "نطاق الاستعادة يجب أن يكون: كامل، أو جدول محدد، أو نقطة زمنية.",
  }),
  reason: z.string().trim().min(10, "السبب يجب ألا يقل عن ١٠ أحرف").max(2000),
});

export const requestBackupRestore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => requestSchema.parse(input))
  .handler(async ({ data, context }) => {
    const g = await guard();
    const staff = await g.requireStaff(context.supabase, context.userId, "backups.manage");
    const db = await g.admin();

    const payload = {
      snapshot_id: data.snapshotId ?? null,
      scope: data.scope,
      reason: data.reason,
      status: "pending" as const,
      requested_by: staff.user_id,
      requested_by_email: staff.email,
    };
    const { data: saved, error } = await (db as AnyClient)
      .from("platform_backup_restore_requests")
      .insert(payload)
      .select("id")
      .maybeSingle();
    if (error) throw new Error("تعذّر إنشاء طلب الاستعادة.");

    await g.writeAudit(db, staff, {
      action: "backup_restore_requested",
      entity_type: "platform_backup_restore_requests",
      entity_id: saved?.id ?? null,
      description: `طلب استعادة بنطاق «${data.scope}».`,
      after: payload,
    });
    return { id: saved?.id as string };
  });

const decisionSchema = z.object({
  id: z.string().uuid(),
  decision: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(2000).optional().nullable(),
});

export const decideBackupRestore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => decisionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const g = await guard();
    const staff = await g.requireStaff(context.supabase, context.userId, "backups.restore");
    const db = await g.admin();

    const { data: existing } = await (db as AnyClient)
      .from("platform_backup_restore_requests")
      .select(REQUEST_COLUMNS)
      .eq("id", data.id)
      .maybeSingle();
    if (!existing) throw new Error("طلب الاستعادة غير موجود.");
    if (existing.status !== "pending") throw new Error("تم اتخاذ قرار بشأن هذا الطلب مسبقاً.");
    if (existing.requested_by === staff.user_id)
      throw new Error(
        "لا يجوز اعتماد طلب استعادة تقدّمت به بنفسك — يلزم موظف آخر (مبدأ الرقابة المزدوجة).",
      );

    const payload = {
      status: data.decision,
      approved_by: staff.user_id,
      approved_by_email: staff.email,
      approved_at: new Date().toISOString(),
      decision_note: data.note?.trim() || null,
    };
    const { error } = await (db as AnyClient)
      .from("platform_backup_restore_requests")
      .update(payload)
      .eq("id", data.id);
    if (error) throw new Error("تعذّر تسجيل القرار.");

    await g.writeAudit(db, staff, {
      action: data.decision === "approved" ? "backup_restore_approved" : "backup_restore_rejected",
      entity_type: "platform_backup_restore_requests",
      entity_id: data.id,
      description: `${data.decision === "approved" ? "اعتماد" : "رفض"} طلب استعادة بنطاق «${existing.scope}».`,
      before: existing,
      after: { ...existing, ...payload },
    });
    return { ok: true };
  });

const executeSchema = z.object({
  id: z.string().uuid(),
  note: z.string().trim().max(2000).optional().nullable(),
});

export const recordBackupRestoreExecution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => executeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const g = await guard();
    const staff = await g.requireStaff(context.supabase, context.userId, "backups.manage");
    const db = await g.admin();

    const { data: existing } = await (db as AnyClient)
      .from("platform_backup_restore_requests")
      .select(REQUEST_COLUMNS)
      .eq("id", data.id)
      .maybeSingle();
    if (!existing) throw new Error("طلب الاستعادة غير موجود.");
    if (existing.status !== "approved") throw new Error("يجب اعتماد الطلب أولاً قبل تسجيل تنفيذه.");

    const payload = {
      status: "executed" as const,
      executed_at: new Date().toISOString(),
      decision_note:
        [existing.decision_note, data.note?.trim()].filter(Boolean).join(" | ") ||
        existing.decision_note,
    };
    const { error } = await (db as AnyClient)
      .from("platform_backup_restore_requests")
      .update(payload)
      .eq("id", data.id);
    if (error) throw new Error("تعذّر تسجيل تنفيذ الاستعادة.");

    await g.writeAudit(db, staff, {
      action: "backup_restore_executed",
      entity_type: "platform_backup_restore_requests",
      entity_id: data.id,
      description: `تسجيل تنفيذ استعادة بنطاق «${existing.scope}» (تم يدوياً على مستوى الاستضافة).`,
      before: existing,
      after: { ...existing, ...payload },
    });
    return { ok: true };
  });
