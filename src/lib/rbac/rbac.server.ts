/**
 * الخدمة المركزية للتحقق من الصلاحيات — خادم فقط.
 *
 * كل عملية إدارية في المنصة تمر من `authorize()`، ولا يُعتمد أبداً على إخفاء
 * الأزرار في الواجهة. التحقق يشمل بالترتيب:
 *   1) الموظف موجود ونشط في فريق المنصة.
 *   2) الصلاحية المطلوبة (resource.action) داخل الصلاحيات المفعّلة
 *      = صلاحيات الدور ∪ الصلاحيات الفردية ∪ المنح المؤقتة/المفوَّضة السارية.
 *   3) قيود الحساب: عنوان IP، الجهاز، ونافذة العمل بتوقيت الرياض.
 *   4) جلسة الجهاز غير مُبطلة.
 *   5) إن كانت هناك جلسة انتحال سارية → القراءة فقط.
 * وكل رفض — وكل سماح بعملية تعديل — يُكتب في سجل التدقيق.
 */
import { createHash } from "node:crypto";
import { getRequest } from "@tanstack/react-start/server";
import type { AdminPermission } from "@/lib/admin-permissions";
import { expandPermissions } from "@/lib/admin-permissions";
import {
  DENY_MESSAGES,
  RIYADH_OFFSET_MINUTES,
  isReadOnlyPermission,
  type RbacDenyReason,
} from "./rbac.shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export type RbacStaff = {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  role: "super_admin" | "staff";
  status: "active" | "suspended";
  permissions: string[] | null;
  role_id: string | null;
  department_id: string | null;
  manager_user_id: string | null;
};

export type RequestFacts = {
  ip: string;
  userAgent: string;
  device: string | null;
  browser: string | null;
  os: string | null;
  fingerprint: string;
};

export type RbacContext = {
  staff: RbacStaff;
  /** الصلاحيات الأساسية (الدور + الفردية) دون أي منح. */
  basePermissions: string[];
  /** الصلاحيات المفعّلة كاملة، بعد ضم المنح السارية. */
  effectivePermissions: string[];
  /** المنح السارية مفصّلة (للتمييز بين المؤقت والمفوَّض). */
  liveGrants: { permission: string; source: string; expires_at: string; granted_by: string }[];
  impersonation: { id: string; target_user_id: string; target_email: string | null; expires_at: string } | null;
  facts: RequestFacts;
  traceRef: string;
};

export class RbacError extends Error {
  readonly reason: RbacDenyReason;
  constructor(reason: RbacDenyReason, message?: string) {
    super(message ?? DENY_MESSAGES[reason]);
    this.reason = reason;
    this.name = "RbacError";
  }
}

function parseUa(ua: string) {
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome|CriOS/.test(ua)
      ? "Chrome"
      : /Firefox|FxiOS/.test(ua)
        ? "Firefox"
        : /Safari/.test(ua)
          ? "Safari"
          : ua
            ? "أخرى"
            : null;
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad|iPod/.test(ua)
        ? "iOS"
        : /Mac OS X/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : null;
  const device = !ua
    ? null
    : /iPad|Tablet/.test(ua)
      ? "تابلت"
      : /Mobile|iPhone|Android/.test(ua)
        ? "جوال"
        : "حاسب";
  return { browser, os, device };
}

/**
 * بصمة الجهاز تُحسب على الخادم من ترويسات الطلب فقط (المتصفح + نظام التشغيل +
 * شبكة العنوان)، فلا يستطيع العميل إرسال بصمة مزيّفة ليتجاوز قيد الأجهزة.
 */
export function requestFacts(): RequestFacts {
  let headers: Headers | null = null;
  try {
    headers = getRequest().headers;
  } catch {
    headers = null;
  }
  const userAgent = (headers?.get("user-agent") ?? "").slice(0, 400);
  const ip = (
    headers?.get("cf-connecting-ip") ??
    headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headers?.get("x-real-ip") ??
    ""
  ).slice(0, 60);
  const parsed = parseUa(userAgent);
  const network = ip.includes(".") ? ip.split(".").slice(0, 3).join(".") : ip;
  const fingerprint = createHash("sha256")
    .update(`${parsed.browser ?? "-"}|${parsed.os ?? "-"}|${parsed.device ?? "-"}|${network}`)
    .digest("hex")
    .slice(0, 32);
  return { ip, userAgent, fingerprint, ...parsed };
}

export function newTraceRef(prefix = "RB"): string {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  return `${prefix}-${Array.from(bytes)
    .map((b) => b.toString(36).toUpperCase().padStart(2, "0"))
    .join("")
    .slice(0, 8)}`;
}

export async function adminDb(): Promise<AnyClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as AnyClient;
}

const STAFF_COLUMNS =
  "id, user_id, full_name, email, role, status, permissions, role_id, department_id, manager_user_id";

/** مطابقة عنوان IP مع قائمة مسموحة تقبل العنوان الكامل أو بادئة الشبكة (١٠.١.٢.). */
export function ipAllowed(ip: string, allowed: string[]): boolean {
  if (allowed.length === 0) return false;
  return allowed.some((entry) => {
    const value = entry.trim();
    if (!value) return false;
    if (value.includes("/")) {
      const [base = "", bitsRaw = "32"] = value.split("/");
      const bits = Number(bitsRaw);
      if (!Number.isFinite(bits) || !base.includes(".")) return false;
      const octets = Math.floor(bits / 8);
      return ip.split(".").slice(0, octets).join(".") === base.split(".").slice(0, octets).join(".");
    }
    if (value.endsWith(".")) return ip.startsWith(value);
    return ip === value;
  });
}

/** الدقائق منذ منتصف الليل ويوم الأسبوع بتوقيت الرياض (UTC+3 ثابت). */
export function riyadhNow(now = new Date()): { minutes: number; weekday: number } {
  const shifted = new Date(now.getTime() + RIYADH_OFFSET_MINUTES * 60_000);
  return {
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(),
  };
}

type Restrictions = {
  ip_enforced: boolean;
  allowed_ips: string[];
  denied_ips: string[];
  device_enforced: boolean;
  trusted_devices: string[];
  blocked_devices: string[];
  time_enforced: boolean;
  work_start_minute: number;
  work_end_minute: number;
  allowed_weekdays: number[];
  effective_from: string | null;
  effective_to: string | null;
};

/** يسجّل الجهاز في سجل الجلسات ويعيد ما إذا كانت الجلسة مُبطلة. */
async function touchSession(db: AnyClient, userId: string, facts: RequestFacts): Promise<boolean> {
  const { data: existing } = await db
    .from("platform_staff_sessions")
    .select("id, revoked_at, requests_count")
    .eq("user_id", userId)
    .eq("device_fingerprint", facts.fingerprint)
    .maybeSingle();

  if (!existing) {
    await db.from("platform_staff_sessions").insert({
      user_id: userId,
      device_fingerprint: facts.fingerprint,
      device: facts.device,
      browser: facts.browser,
      os: facts.os,
      ip: facts.ip,
    });
    return false;
  }
  if (existing.revoked_at) return true;
  await db
    .from("platform_staff_sessions")
    .update({
      last_seen_at: new Date().toISOString(),
      requests_count: (existing.requests_count ?? 0) + 1,
      ip: facts.ip,
      updated_at: new Date().toISOString(),
    })
    .eq("id", existing.id);
  return false;
}

/** سجل التدقيق: يُكتب بعميل المستخدم كي تُثبّت القاعدة هوية الفاعل. */
export async function auditRbac(
  supabase: AnyClient,
  entry: {
    actorEmail: string;
    action: string;
    entityType: string;
    entityId?: string | null;
    description?: string;
    metadata?: Record<string, unknown>;
    before?: unknown;
    after?: unknown;
  },
) {
  const facts = requestFacts();
  try {
    await supabase.from("admin_audit_logs").insert({
      actor_email: entry.actorEmail,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      description: entry.description ?? null,
      metadata: entry.metadata ?? {},
      before_data: entry.before ?? null,
      after_data: entry.after ?? null,
      ip: facts.ip,
      user_agent: facts.userAgent,
    });
  } catch {
    /* التدقيق لا يوقف العملية، لكنه يُحاول دائماً */
  }
}

export async function loadRbacContext(userId: string): Promise<RbacContext> {
  const db = await adminDb();
  const facts = requestFacts();

  const { data: staffRow } = await db.from("platform_staff").select(STAFF_COLUMNS).eq("user_id", userId).maybeSingle();
  const staff = staffRow as RbacStaff | null;
  if (!staff) throw new RbacError("not_staff");
  if (staff.status !== "active") throw new RbacError("suspended");

  const nowIso = new Date().toISOString();
  const [roleRes, grantsRes, impRes] = await Promise.all([
    staff.role_id
      ? db.from("platform_roles").select("permissions").eq("id", staff.role_id).maybeSingle()
      : Promise.resolve({ data: null }),
    db
      .from("platform_permission_grants")
      .select("permission, source, expires_at, granted_by")
      .eq("grantee_user_id", userId)
      .is("revoked_at", null)
      .lte("starts_at", nowIso)
      .gt("expires_at", nowIso),
    db
      .from("platform_impersonation_sessions")
      .select("id, target_user_id, target_email, expires_at")
      .eq("actor_user_id", userId)
      .eq("status", "active")
      .gt("expires_at", nowIso)
      .maybeSingle(),
  ]);

  const rolePermissions = ((roleRes.data as { permissions: string[] | null } | null)?.permissions ?? []) as string[];
  const liveGrants = (grantsRes.data ?? []) as RbacContext["liveGrants"];
  const basePermissions = expandPermissions([...(staff.permissions ?? []), ...rolePermissions]);
  const effectivePermissions = expandPermissions([...basePermissions, ...liveGrants.map((g) => g.permission)]);

  return {
    staff,
    basePermissions,
    effectivePermissions,
    liveGrants,
    impersonation: (impRes.data ?? null) as RbacContext["impersonation"],
    facts,
    traceRef: newTraceRef(),
  };
}

export function holdsPermission(ctx: RbacContext, permission: string): boolean {
  if (ctx.staff.role === "super_admin") return true;
  return ctx.effectivePermissions.includes(permission);
}

/** يملكها أصلاً دون تفويض — أساس منع التفويض المتسلسل. */
export function holdsBasePermission(ctx: RbacContext, permission: string): boolean {
  if (ctx.staff.role === "super_admin") return true;
  return ctx.basePermissions.includes(permission);
}

/**
 * البوابة الإجبارية لكل عملية إدارية.
 * @param supabase عميل المستخدم (لتثبيت هوية الفاعل في سجل التدقيق).
 */
export async function authorize(
  supabase: AnyClient,
  userId: string,
  permission: AdminPermission | string,
  options: { mutating?: boolean; entityType?: string; entityId?: string | null; description?: string } = {},
): Promise<RbacContext> {
  const db = await adminDb();
  let ctx: RbacContext;
  try {
    ctx = await loadRbacContext(userId);
  } catch (error) {
    if (error instanceof RbacError) {
      await auditRbac(supabase, {
        actorEmail: "",
        action: "authz.denied",
        entityType: options.entityType ?? "authz",
        entityId: options.entityId ?? null,
        description: `رفض «${permission}»: ${error.message}`,
        metadata: { permission, reason: error.reason },
      });
    }
    throw error;
  }

  const mutating = options.mutating ?? !isReadOnlyPermission(String(permission));

  const deny = async (reason: RbacDenyReason) => {
    await auditRbac(supabase, {
      actorEmail: ctx.staff.email,
      action: "authz.denied",
      entityType: options.entityType ?? "authz",
      entityId: options.entityId ?? null,
      description: `رفض «${permission}»: ${DENY_MESSAGES[reason]}`,
      metadata: { permission, reason, trace_ref: ctx.traceRef, ip: ctx.facts.ip, device: ctx.facts.device },
    });
    throw new RbacError(reason);
  };

  if (!holdsPermission(ctx, String(permission))) await deny("missing_permission");

  const { data: restrictionRow } = await db
    .from("platform_staff_restrictions")
    .select(
      "ip_enforced, allowed_ips, device_enforced, trusted_devices, time_enforced, work_start_minute, work_end_minute, allowed_weekdays",
    )
    .eq("user_id", userId)
    .maybeSingle();
  const limits = restrictionRow as Restrictions | null;

  if (limits?.ip_enforced && !ipAllowed(ctx.facts.ip, limits.allowed_ips ?? [])) await deny("ip_blocked");
  if (limits?.device_enforced && !(limits.trusted_devices ?? []).includes(ctx.facts.fingerprint))
    await deny("device_blocked");
  if (limits?.time_enforced) {
    const { minutes, weekday } = riyadhNow();
    const inWindow = minutes >= limits.work_start_minute && minutes < limits.work_end_minute;
    const dayOk = (limits.allowed_weekdays ?? []).includes(weekday);
    if (!inWindow || !dayOk) await deny("time_blocked");
  }

  if (await touchSession(db, userId, ctx.facts)) await deny("session_revoked");

  if (ctx.impersonation && mutating) await deny("impersonation_read_only");

  if (mutating) {
    await auditRbac(supabase, {
      actorEmail: ctx.staff.email,
      action: "authz.allowed",
      entityType: options.entityType ?? "authz",
      entityId: options.entityId ?? null,
      description: options.description ?? `سماح «${permission}»`,
      metadata: {
        permission,
        trace_ref: ctx.traceRef,
        via_grant: ctx.liveGrants.some((g) => g.permission === permission) ? "grant" : "base",
        impersonating: ctx.impersonation?.target_email ?? null,
      },
    });
  }

  return ctx;
}
