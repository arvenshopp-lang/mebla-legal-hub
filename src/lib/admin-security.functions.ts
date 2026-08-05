import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * مركز الأمان في لوحة الإدارة: مؤشرات ومصادر تدقيق فقط.
 * لا تعرض أي دالة هنا بيانات مكاتب سرّية (قضايا/مستندات/عملاء) — أسماء
 * المستندات وأسماء الحقول الحساسة تُستبعد، ويُكتفى بنوع العملية ونتيجتها.
 */

/** ملخص حالة الأمان: تغطية التحقق بخطوتين، المحاولات المرفوضة، حالة المفاتيح. */
export const securityCenterOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ requireStaff, admin }, rotation] = await Promise.all([
      import("@/lib/admin-guard.server"),
      import("@/lib/crypto/key-rotation.server"),
    ]);
    await requireStaff(context.supabase, context.userId, "security.read");
    const db = await admin();

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [
      keys,
      jobs,
      staffRows,
      revealDenied,
      revealSuccess,
      docDenied,
      activeTokens,
      publicBuckets,
    ] = await Promise.all([
      rotation.keyVersionsStatus(),
      rotation.recentRotationJobs(8),
      db
        .from("platform_staff")
        .select("user_id, full_name, email, role, status")
        .eq("status", "active"),
      db
        .from("pii_access_logs")
        .select("id", { count: "exact", head: true })
        .neq("outcome", "success")
        .gte("created_at", since7d),
      db
        .from("pii_access_logs")
        .select("id", { count: "exact", head: true })
        .eq("outcome", "success")
        .gte("created_at", since24h),
      db
        .from("document_access_logs")
        .select("id", { count: "exact", head: true })
        .eq("outcome", "denied")
        .gte("created_at", since7d),
      db
        .from("document_access_tokens")
        .select("id", { count: "exact", head: true })
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString()),
      db.storage.listBuckets(),
    ]);

    // تغطية التحقق بخطوتين لفريق المنصة (بيانات auth تُقرأ بصلاحية الخادم فقط).
    const staff = (staffRows.data ?? []) as {
      user_id: string;
      full_name: string;
      email: string;
      role: string;
    }[];
    const mfaStatus: { name: string; email: string; role: string; mfa: boolean }[] = [];
    for (const member of staff) {
      const { data } = await db.auth.admin.getUserById(member.user_id);
      const factors = (data?.user?.factors ?? []) as { status?: string }[];
      mfaStatus.push({
        name: member.full_name,
        email: member.email,
        role: member.role,
        mfa: factors.some((f) => f.status === "verified"),
      });
    }
    const enrolled = mfaStatus.filter((m) => m.mfa).length;

    const buckets = ((publicBuckets.data ?? []) as { name: string; public: boolean }[]).map(
      (b) => ({
        name: b.name,
        public: b.public,
      }),
    );

    return {
      mfa: {
        total: mfaStatus.length,
        enrolled,
        coverage: mfaStatus.length ? Math.round((enrolled / mfaStatus.length) * 100) : 0,
        pending: mfaStatus.filter((m) => !m.mfa),
      },
      attempts: {
        reveal_denied_7d: revealDenied.count ?? 0,
        reveal_success_24h: revealSuccess.count ?? 0,
        document_denied_7d: docDenied.count ?? 0,
      },
      storage: {
        buckets,
        all_private: buckets.every((b) => !b.public),
        active_tokens: activeTokens.count ?? 0,
      },
      keys,
      rotation_jobs: jobs,
    };
  });

export type RevealFeedRow = {
  id: string;
  organization_id: string;
  entity_type: string;
  field: string;
  outcome: string;
  trace_ref: string | null;
  aal: string | null;
  ip: string | null;
  browser: string | null;
  device: string | null;
  reason: string | null;
  key_version: number | null;
  created_at: string;
};

export type DocumentDenialRow = {
  id: string;
  organization_id: string;
  action_type: string;
  outcome: string;
  denial_reason: string | null;
  trace_ref: string | null;
  ip: string | null;
  browser: string | null;
  device: string | null;
  created_at: string;
};

/** آخر عمليات كشف البيانات الحساسة — بدون أي قيمة، فقط أثر العملية. */
export const securityRevealFeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ limit: z.number().int().min(1).max(100).default(30) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireStaff, admin } = await import("@/lib/admin-guard.server");
    await requireStaff(context.supabase, context.userId, "audit.read");
    const db = await admin();
    const { data: rows } = await db
      .from("pii_access_logs")
      .select(
        "id, organization_id, entity_type, field, outcome, trace_ref, aal, ip, browser, device, reason, key_version, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit);
    return (rows ?? []) as RevealFeedRow[];
  });

/** المحاولات المرفوضة على المستندات (تنزيل/طباعة/مشاركة) خلال آخر أسبوعين. */
export const securityDocumentDenials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ limit: z.number().int().min(1).max(100).default(30) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireStaff, admin } = await import("@/lib/admin-guard.server");
    await requireStaff(context.supabase, context.userId, "audit.read");
    const db = await admin();
    const { data: rows } = await db
      .from("document_access_logs")
      .select(
        "id, organization_id, action_type, outcome, denial_reason, trace_ref, ip, browser, device, created_at",
      )
      .eq("outcome", "denied")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    return (rows ?? []) as DocumentDenialRow[];
  });

/** تسجيل إصدار مفتاح جديد بعد إضافة سرّيه على الخادم. */
export const registerEncryptionKeyVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ version: z.number().int().min(1).max(50) }).parse(d))
  .handler(async ({ data, context }) => {
    const { requireStaff, writeAudit } = await import("@/lib/admin-guard.server");
    const staff = await requireStaff(context.supabase, context.userId, "security.manage");
    const rotation = await import("@/lib/crypto/key-rotation.server");
    const status = await rotation.registerKeyVersion(data.version, context.userId);
    await writeAudit(context.supabase, staff, {
      action: "encryption_key.register",
      entity_type: "encryption_key_registry",
      description: `تسجيل إصدار مفتاح تشفير رقم ${data.version}`,
      metadata: { key_version: data.version },
    });
    return status;
  });

/** دفعة إعادة تشفير واحدة — تُستدعى مراراً حتى انتهاء الصفوف. */
export const runReencryptionBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        entity: z.enum(["clients", "case_parties"]),
        fromVersion: z.number().int().min(1).max(50),
        jobId: z.string().uuid().nullable().optional(),
        batchSize: z.number().int().min(10).max(500).default(100),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireStaff, writeAudit } = await import("@/lib/admin-guard.server");
    const staff = await requireStaff(context.supabase, context.userId, "security.manage");
    const rotation = await import("@/lib/crypto/key-rotation.server");
    const result = await rotation.reencryptBatch({
      entity: data.entity,
      fromVersion: data.fromVersion,
      batchSize: data.batchSize,
      jobId: data.jobId ?? null,
      staffUserId: context.userId,
    });
    await writeAudit(context.supabase, staff, {
      action: "encryption_key.reencrypt_batch",
      entity_type: "pii_reencryption_jobs",
      entity_id: result.jobId,
      description: `إعادة تشفير ${result.processedNow} سجلاً في ${data.entity} من الإصدار ${result.fromVersion} إلى ${result.toVersion}`,
      metadata: { ...result },
    });
    return result;
  });

/** تقاعد إصدار مفتاح — يرفضه النظام إن بقي أي سجل مرتبط به. */
export const retireEncryptionKeyVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ version: z.number().int().min(1).max(50) }).parse(d))
  .handler(async ({ data, context }) => {
    const { requireStaff, writeAudit } = await import("@/lib/admin-guard.server");
    const staff = await requireStaff(context.supabase, context.userId, "security.manage");
    const rotation = await import("@/lib/crypto/key-rotation.server");
    const status = await rotation.retireKeyVersion(data.version);
    await writeAudit(context.supabase, staff, {
      action: "encryption_key.retire",
      entity_type: "encryption_key_registry",
      description: `تقاعد إصدار مفتاح التشفير رقم ${data.version}`,
      metadata: { key_version: data.version },
    });
    return status;
  });
