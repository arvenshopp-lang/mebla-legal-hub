/**
 * منطق البحث العالمي وسجل النشاط الموحّد ولوحة المراقبة.
 * كل قراءة تمر بعد التحقق من صلاحية الموظف، وتُفلتر الأقسام حسب صلاحياته فقط.
 */
import { expandPermissions, type AdminPermission } from "@/lib/admin-permissions";
import type { StaffRow } from "@/lib/admin-guard.server";
import type {
  ActivityEvent,
  ActivityFeed,
  ActivitySource,
  GlobalSearchResult,
  MonitoringSnapshot,
  QueueSnapshot,
  SearchGroup,
  SearchGroupKey,
} from "@/lib/admin-observability.shared";
import { SEARCH_GROUP_LABELS } from "@/lib/admin-observability.shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

/** يبني دالة تحقق صلاحية واحدة لكل الأقسام بدل استعلام متكرر. */
export function permissionChecker(staff: StaffRow): (p: AdminPermission) => boolean {
  if (staff.role === "super_admin") return () => true;
  const all = expandPermissions([...(staff.permissions ?? []), ...(staff.platform_roles?.permissions ?? [])]);
  return (p) => all.includes(p);
}

/** يُحيّد محارف ILIKE حتى لا يحوّل المستخدم البحث إلى نمط واسع. */
function like(term: string): string {
  return `%${term.replace(/[%_\\,()]/g, (c) => `\\${c}`)}%`;
}

const LIMIT = 5;

export async function runGlobalSearch(db: AnyClient, staff: StaffRow, rawQuery: string): Promise<GlobalSearchResult> {
  const query = rawQuery.trim().slice(0, 80);
  const can = permissionChecker(staff);
  const groups: SearchGroup[] = [];
  const restricted: string[] = [];
  if (query.length < 2) return { query, groups, restricted };
  const pattern = like(query);

  const sections: {
    key: SearchGroupKey;
    permission: AdminPermission;
    run: () => Promise<SearchGroup["hits"]>;
  }[] = [
    {
      key: "organizations",
      permission: "organizations.read",
      run: async () => {
        const { data } = await db
          .from("organizations")
          .select("id, name, city, email, commercial_registration")
          .or(`name.ilike.${pattern},email.ilike.${pattern},commercial_registration.ilike.${pattern}`)
          .limit(LIMIT);
        return (data ?? []).map((r: AnyClient) => ({
          id: String(r.id),
          title: String(r.name ?? "مكتب"),
          subtitle: [r.city, r.email].filter(Boolean).join(" · ") || "مكتب مسجّل",
          href: "/mehla-admin/organizations",
        }));
      },
    },
    {
      key: "users",
      permission: "users.read",
      run: async () => {
        const { data } = await db
          .from("profiles")
          .select("id, full_name, email, job_title")
          .or(`full_name.ilike.${pattern},email.ilike.${pattern}`)
          .limit(LIMIT);
        return (data ?? []).map((r: AnyClient) => ({
          id: String(r.id),
          title: String(r.full_name ?? r.email ?? "مستخدم"),
          subtitle: [r.job_title, r.email].filter(Boolean).join(" · ") || "مستخدم",
          href: "/mehla-admin/users",
        }));
      },
    },
    {
      key: "subscriptions",
      permission: "subscriptions.manage",
      run: async () => {
        const { data } = await db
          .from("subscriptions")
          .select("id, plan_label, plan_code, status, email")
          .or(`plan_label.ilike.${pattern},plan_code.ilike.${pattern},email.ilike.${pattern}`)
          .limit(LIMIT);
        return (data ?? []).map((r: AnyClient) => ({
          id: String(r.id),
          title: String(r.plan_label ?? r.plan_code ?? "اشتراك"),
          subtitle: [r.status, r.email].filter(Boolean).join(" · "),
          href: "/mehla-admin/subscriptions",
        }));
      },
    },
    {
      key: "invoices",
      permission: "billing.read",
      run: async () => {
        const { data } = await db
          .from("platform_invoices")
          .select("id, number, customer_name, status, total")
          .or(`number.ilike.${pattern},customer_name.ilike.${pattern},customer_email.ilike.${pattern}`)
          .limit(LIMIT);
        return (data ?? []).map((r: AnyClient) => ({
          id: String(r.id),
          title: String(r.number ?? "فاتورة"),
          subtitle: [r.customer_name, r.status].filter(Boolean).join(" · "),
          href: `/mehla-admin/billing/${r.id}`,
        }));
      },
    },
    {
      key: "payments",
      permission: "billing.read",
      run: async () => {
        const { data } = await db
          .from("platform_payments")
          .select("id, invoice_id, provider, provider_reference, bank_reference, status, amount")
          .or(`provider_reference.ilike.${pattern},bank_reference.ilike.${pattern},provider.ilike.${pattern}`)
          .limit(LIMIT);
        return (data ?? []).map((r: AnyClient) => ({
          id: String(r.id),
          title: String(r.provider_reference ?? r.bank_reference ?? "دفعة"),
          subtitle: [r.provider, r.status].filter(Boolean).join(" · "),
          href: r.invoice_id ? `/mehla-admin/billing/${r.invoice_id}` : "/mehla-admin/billing",
        }));
      },
    },
    {
      key: "tickets",
      permission: "tickets.view",
      run: async () => {
        const { data } = await db
          .from("support_tickets")
          .select("id, reference, subject, status, requester_email")
          .or(`reference.ilike.${pattern},subject.ilike.${pattern},requester_email.ilike.${pattern}`)
          .limit(LIMIT);
        return (data ?? []).map((r: AnyClient) => ({
          id: String(r.id),
          title: `${r.reference ?? "تذكرة"} · ${r.subject ?? ""}`.trim(),
          subtitle: [r.status, r.requester_email].filter(Boolean).join(" · "),
          href: `/mehla-admin/support/${r.id}`,
        }));
      },
    },
    {
      key: "mail",
      permission: "email.view",
      run: async () => {
        const { data } = await db
          .from("email_threads")
          .select("id, subject, folder, last_activity_at")
          .ilike("subject", pattern)
          .order("last_activity_at", { ascending: false })
          .limit(LIMIT);
        return (data ?? []).map((r: AnyClient) => ({
          id: String(r.id),
          title: String(r.subject ?? "محادثة بريد"),
          subtitle: String(r.folder ?? "inbox"),
          href: "/mehla-admin/mail",
        }));
      },
    },
    {
      key: "pages",
      permission: "settings.manage",
      run: async () => {
        const { data } = await db
          .from("platform_content_pages")
          .select("id, slug, title, kind, is_published")
          .or(`slug.ilike.${pattern},title.ilike.${pattern}`)
          .limit(LIMIT);
        return (data ?? []).map((r: AnyClient) => ({
          id: String(r.id),
          title: String(r.title ?? r.slug),
          subtitle: `${r.kind} · ${r.is_published ? "منشورة" : "مسودة"}`,
          href: "/mehla-admin/content",
        }));
      },
    },
    {
      key: "staff",
      permission: "staff.view",
      run: async () => {
        const { data } = await db
          .from("platform_staff")
          .select("id, full_name, email, role, status")
          .or(`full_name.ilike.${pattern},email.ilike.${pattern}`)
          .limit(LIMIT);
        return (data ?? []).map((r: AnyClient) => ({
          id: String(r.id),
          title: String(r.full_name ?? r.email),
          subtitle: `${r.role === "super_admin" ? "مالك المنصة" : "موظف"} · ${r.status === "active" ? "نشط" : "موقوف"}`,
          href: "/mehla-admin/staff",
        }));
      },
    },
    {
      key: "logs",
      permission: "audit.read",
      run: async () => {
        const { data } = await db
          .from("admin_audit_logs")
          .select("id, action, actor_email, description, created_at")
          .or(`action.ilike.${pattern},actor_email.ilike.${pattern},description.ilike.${pattern}`)
          .order("created_at", { ascending: false })
          .limit(LIMIT);
        return (data ?? []).map((r: AnyClient) => ({
          id: String(r.id),
          title: String(r.action),
          subtitle: [r.actor_email, r.description].filter(Boolean).join(" · "),
          href: "/mehla-admin/logs",
        }));
      },
    },
  ];

  const allowed = sections.filter((s) => {
    if (can(s.permission)) return true;
    restricted.push(SEARCH_GROUP_LABELS[s.key]);
    return false;
  });

  const results = await Promise.all(allowed.map((s) => s.run().catch(() => [])));
  allowed.forEach((s, i) => {
    const hits = results[i] ?? [];
    if (hits.length > 0) groups.push({ key: s.key, label: SEARCH_GROUP_LABELS[s.key], hits });
  });

  return { query, groups, restricted };
}

/* ------------------------------------------------------- سجل النشاط الموحّد */

export async function readActivityFeed(
  db: AnyClient,
  options: { sources: ActivitySource[]; search: string; from: string | null; to: string | null; limit: number; offset: number },
): Promise<ActivityFeed> {
  const { sources, search, from, to, limit, offset } = options;
  const pattern = search.trim() ? like(search.trim().slice(0, 80)) : null;
  const window = limit + offset;

  const collected: ActivityEvent[] = [];
  let total = 0;

  const applyRange = (q: AnyClient, column: string) => {
    let out = q;
    if (from) out = out.gte(column, from);
    if (to) out = out.lte(column, to);
    return out;
  };

  if (sources.includes("admin")) {
    let q = db
      .from("admin_audit_logs")
      .select("id, action, actor_email, entity_type, entity_id, description, ip, device, created_at, metadata", {
        count: "exact",
      });
    q = applyRange(q, "created_at");
    if (pattern) q = q.or(`action.ilike.${pattern},actor_email.ilike.${pattern},description.ilike.${pattern}`);
    const { data, count } = await q.order("created_at", { ascending: false }).limit(window);
    total += count ?? 0;
    for (const r of (data ?? []) as AnyClient[]) {
      collected.push({
        id: `admin:${r.id}`,
        source: "admin",
        action: String(r.action),
        actor: String(r.actor_email ?? "—"),
        entityType: String(r.entity_type ?? "—"),
        entityId: r.entity_id ?? null,
        description: String(r.description ?? ""),
        ip: r.ip ?? null,
        device: r.device ?? null,
        createdAt: String(r.created_at),
        metadata: (r.metadata ?? {}) as Record<string, unknown>,
      });
    }
  }

  if (sources.includes("tenant")) {
    let q = db
      .from("activity_logs")
      .select("id, action, entity_type, entity_id, description, ip, created_at, metadata, organization_id", {
        count: "exact",
      });
    q = applyRange(q, "created_at");
    if (pattern) q = q.or(`action.ilike.${pattern},description.ilike.${pattern}`);
    const { data, count } = await q.order("created_at", { ascending: false }).limit(window);
    total += count ?? 0;
    for (const r of (data ?? []) as AnyClient[]) {
      collected.push({
        id: `tenant:${r.id}`,
        source: "tenant",
        action: String(r.action),
        actor: "مستخدم مكتب",
        entityType: String(r.entity_type ?? "—"),
        entityId: r.entity_id ?? null,
        description: String(r.description ?? ""),
        ip: r.ip ?? null,
        device: null,
        createdAt: String(r.created_at),
        metadata: { organization_id: r.organization_id, ...((r.metadata ?? {}) as object) },
      });
    }
  }

  if (sources.includes("failure")) {
    let q = db
      .from("system_failures")
      .select("id, ref, action, surface, error_code, error_message, ip, device, created_at, path, http_status", {
        count: "exact",
      });
    q = applyRange(q, "created_at");
    if (pattern) q = q.or(`ref.ilike.${pattern},action.ilike.${pattern},error_message.ilike.${pattern}`);
    const { data, count } = await q.order("created_at", { ascending: false }).limit(window);
    total += count ?? 0;
    for (const r of (data ?? []) as AnyClient[]) {
      collected.push({
        id: `failure:${r.id}`,
        source: "failure",
        action: String(r.action ?? "failure"),
        actor: String(r.ref ?? "—"),
        entityType: String(r.surface ?? "—"),
        entityId: null,
        description: String(r.error_message ?? r.error_code ?? ""),
        ip: r.ip ?? null,
        device: r.device ?? null,
        createdAt: String(r.created_at),
        metadata: { path: r.path, http_status: r.http_status, error_code: r.error_code },
      });
    }
  }

  collected.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  const page = collected.slice(offset, offset + limit);
  return { events: page, total, hasMore: collected.length > offset + limit || total > offset + limit };
}

/* ------------------------------------------------------------- المراقبة */

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

async function countOf(db: AnyClient, table: string, build: (q: AnyClient) => AnyClient): Promise<number> {
  const { count } = await build(db.from(table).select("id", { count: "exact", head: true }));
  return count ?? 0;
}

export async function readMonitoringSnapshot(db: AnyClient): Promise<MonitoringSnapshot> {
  const since24 = hoursAgo(24);
  const since30d = hoursAgo(24 * 30);

  const dbStart = Date.now();
  await db.from("organizations").select("id", { count: "exact", head: true });
  const databaseLatency = Date.now() - dbStart;

  const storageStart = Date.now();
  const { data: docs } = await db.from("documents").select("file_size");
  const storageLatency = Date.now() - storageStart;
  const documents = docs?.length ?? 0;
  const bytes = (docs ?? []).reduce((sum: number, d: AnyClient) => sum + Number(d.file_size ?? 0), 0);

  const [
    mailPending,
    mailFailed,
    mailDone,
    mailOldest,
    otpPending,
    otpFailed,
    otpDone,
    payPending,
    payFailed,
    payDone,
    docPending,
    docFailed,
    docDone,
    reencPending,
    reencFailed,
    reencDone,
    sessionsActive,
    sessionsTotal,
    sessionsRevoked,
    adminOps,
    failures,
    blockedLookups,
    lastFailure,
    integrationChecks,
    integrationFailures,
    lastIntegrationCheck,
    slowestIntegration,
  ] = await Promise.all([
    countOf(db, "email_outbox", (q) => q.in("status", ["queued", "scheduled", "sending"])),
    countOf(db, "email_outbox", (q) => q.eq("status", "failed")),
    countOf(db, "email_outbox", (q) => q.eq("status", "sent").gte("updated_at", since24)),
    db
      .from("email_outbox")
      .select("created_at")
      .in("status", ["queued", "scheduled", "sending"])
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    countOf(db, "otp_verifications", (q) => q.is("consumed_at", null).gte("expires_at", new Date().toISOString())),
    countOf(db, "otp_verifications", (q) => q.eq("delivery_status", "failed").gte("created_at", since24)),
    countOf(db, "otp_verifications", (q) => q.not("consumed_at", "is", null).gte("created_at", since24)),
    countOf(db, "platform_payment_webhooks", (q) => q.in("status", ["received", "pending", "retrying"])),
    countOf(db, "platform_payment_webhooks", (q) => q.eq("status", "failed")),
    countOf(db, "platform_payment_webhooks", (q) => q.not("processed_at", "is", null).gte("received_at", since24)),
    countOf(db, "document_processing_jobs", (q) => q.in("status", ["queued", "extracting", "ocr_processing", "indexing"])),
    countOf(db, "document_processing_jobs", (q) => q.eq("status", "failed")),
    countOf(db, "document_processing_jobs", (q) => q.eq("status", "completed").gte("updated_at", since24)),
    countOf(db, "pii_reencryption_jobs", (q) => q.in("status", ["queued", "running"])),
    countOf(db, "pii_reencryption_jobs", (q) => q.eq("status", "failed")),
    countOf(db, "pii_reencryption_jobs", (q) => q.eq("status", "completed").gte("updated_at", since24)),
    countOf(db, "platform_staff_sessions", (q) => q.is("revoked_at", null).gte("last_seen_at", since24)),
    countOf(db, "platform_staff_sessions", (q) => q.is("revoked_at", null)),
    countOf(db, "platform_staff_sessions", (q) => q.not("revoked_at", "is", null).gte("revoked_at", since30d)),
    countOf(db, "admin_audit_logs", (q) => q.gte("created_at", since24)),
    countOf(db, "system_failures", (q) => q.gte("created_at", since24)),
    countOf(db, "case_lookup_attempts", (q) => q.eq("success", false).gte("created_at", since24)),
    db.from("system_failures").select("ref").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    countOf(db, "integration_health_logs", (q) => q.gte("checked_at", since24)),
    countOf(db, "integration_health_logs", (q) => q.neq("result", "success").gte("checked_at", since24)),
    db
      .from("integration_health_logs")
      .select("checked_at")
      .order("checked_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("integration_health_logs")
      .select("internal_name, latency_ms")
      .gte("checked_at", since24)
      .not("latency_ms", "is", null)
      .order("latency_ms", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const queues: QueueSnapshot[] = [
    {
      key: "email",
      label: "طابور البريد الصادر",
      pending: mailPending,
      failed: mailFailed,
      done24h: mailDone,
      oldestPendingAt: (mailOldest?.data?.created_at as string | undefined) ?? null,
      note: "يشمل رسائل التوثيق والدعوات وإشعارات الفواتير.",
    },
    {
      key: "otp",
      label: "طابور رموز التحقق",
      pending: otpPending,
      failed: otpFailed,
      done24h: otpDone,
      oldestPendingAt: null,
      note: "الرموز صالحة عشر دقائق؛ «بالانتظار» يعني رموزاً سارية لم تُستخدم بعد.",
    },
    {
      key: "payments",
      label: "طابور إشعارات الدفع",
      pending: payPending,
      failed: payFailed,
      done24h: payDone,
      oldestPendingAt: null,
      note: "إشعارات مزوّدي الدفع الموثّقة بالتوقيع قبل المعالجة.",
    },
    {
      key: "documents",
      label: "معالجة المستندات والتعرّف الضوئي",
      pending: docPending,
      failed: docFailed,
      done24h: docDone,
      oldestPendingAt: null,
      note: "استخراج النصوص وفهرسة الصفحات للبحث.",
    },
    {
      key: "reencryption",
      label: "إعادة تشفير البيانات الحساسة",
      pending: reencPending,
      failed: reencFailed,
      done24h: reencDone,
      oldestPendingAt: null,
      note: "تعمل عند تدوير مفاتيح التشفير فقط.",
    },
  ];

  const slowest = slowestIntegration?.data as { internal_name?: string; latency_ms?: number } | null | undefined;

  return {
    checkedAt: new Date().toISOString(),
    latency: {
      database: databaseLatency,
      storage: storageLatency,
      slowestIntegration:
        slowest?.internal_name && slowest.latency_ms != null
          ? { name: String(slowest.internal_name), ms: Number(slowest.latency_ms) }
          : null,
    },
    queues,
    storage: { documents, bytes },
    sessions: { active24h: sessionsActive, total: sessionsTotal, revoked30d: sessionsRevoked },
    security: {
      adminOps24h: adminOps,
      failures24h: failures,
      blockedLookups24h: blockedLookups,
      lastFailureRef: (lastFailure?.data?.ref as string | undefined) ?? null,
    },
    integrations: {
      checks24h: integrationChecks,
      failures24h: integrationFailures,
      lastCheckAt: (lastIntegrationCheck?.data?.checked_at as string | undefined) ?? null,
    },
  };
}
