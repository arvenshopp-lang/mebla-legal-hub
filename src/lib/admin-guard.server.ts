/**
 * حرس لوحة إدارة المنصة — يُستدعى داخل معالجات دوال الخادم فقط.
 * كل عملية إدارية تمر من هنا: تحقق صلاحية فعلي على الخادم + كتابة سجل تدقيق
 * يحمل البيانات قبل وبعد التعديل مع IP والجهاز والمتصفح (تُثبّتها قاعدة البيانات).
 */
import { getRequest } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminPermission } from "@/lib/admin-permissions";
import { expandPermissions } from "@/lib/admin-permissions";
import type { Database, Json } from "@/integrations/supabase/types";
import {
  assuranceLevel,
  assuranceLevelFromRequest,
  type Claims,
} from "@/lib/security/sensitive-guard.server";

export type StaffRow = {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  role: "super_admin" | "staff";
  status: "active" | "suspended";
  permissions: string[] | null;
  role_id: string | null;
  department_id: string | null;
  platform_roles: { permissions: string[] | null } | null;
};

type AnyClient = SupabaseClient<Database>;

export async function requireStaff(
  supabase: AnyClient,
  userId: string,
  permission: AdminPermission,
  claims?: Claims,
): Promise<StaffRow> {
  const db = supabase as AnyClient;
  const { data, error } = await db
    .from("platform_staff")
    .select(
      "id, user_id, full_name, email, role, status, permissions, role_id, department_id, platform_roles(permissions)",
    )
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("تعذّر التحقق من صلاحياتك.");
  const staff = data as StaffRow | null;
  if (!staff || staff.status !== "active") throw new Error("ليس لديك وصول إلى لوحة إدارة المنصة.");

  // فرض التحقق الثنائي (AAL2) خادمياً للوصول إلى لوحة إدارة المنصة
  const aal = claims ? assuranceLevel(claims) : assuranceLevelFromRequest();
  if (aal !== "aal2") {
    throw new Error(
      "يتطلب الوصول إلى لوحة إدارة المنصة جلسة مصادقة ثنائية نشطة (AAL2). يُرجى إكمال التحقق بخطوتين للمتابعة.",
    );
  }

  if (staff.role === "super_admin") return staff;
  const all = expandPermissions([
    ...(staff.permissions ?? []),
    ...(staff.platform_roles?.permissions ?? []),
  ]);
  if (!all.includes(permission)) throw new Error("لا تملك الصلاحية اللازمة لتنفيذ هذه العملية.");
  return staff;
}

/** موظف نشط بأي صلاحية — للصفحات القراءة العامة مثل لوحة المؤشرات. */
export async function requireActiveStaff(
  supabase: AnyClient,
  userId: string,
  claims?: Claims,
): Promise<StaffRow> {
  const { data } = await supabase
    .from("platform_staff")
    .select(
      "id, user_id, full_name, email, role, status, permissions, role_id, department_id, platform_roles(permissions)",
    )
    .eq("user_id", userId)
    .maybeSingle();
  const staff = data as StaffRow | null;
  if (!staff || staff.status !== "active") throw new Error("ليس لديك وصول إلى لوحة إدارة المنصة.");

  // فرض التحقق الثنائي (AAL2) خادمياً
  const aal = claims ? assuranceLevel(claims) : assuranceLevelFromRequest();
  if (aal !== "aal2") {
    throw new Error(
      "يتطلب الوصول إلى لوحة إدارة المنصة جلسة مصادقة ثنائية نشطة (AAL2). يُرجى إكمال التحقق بخطوتين للمتابعة.",
    );
  }

  return staff;
}

export function requestMeta() {
  try {
    const req = getRequest();
    return {
      ip:
        req.headers.get("cf-connecting-ip") ??
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        "",
      userAgent: req.headers.get("user-agent") ?? "",
    };
  } catch {
    return { ip: "", userAgent: "" };
  }
}

export async function writeAudit(
  supabase: AnyClient,
  staff: Pick<StaffRow, "email">,
  entry: {
    action: string;
    entity_type: string;
    entity_id?: string | null;
    description?: string;
    metadata?: Record<string, unknown>;
    before?: unknown;
    after?: unknown;
  },
) {
  const { ip, userAgent } = requestMeta();
  await supabase.from("admin_audit_logs").insert({
    actor_email: staff.email,
    action: entry.action,
    entity_type: entry.entity_type,
    entity_id: entry.entity_id ?? null,
    description: entry.description ?? null,
    // بيانات التدقيق قبل/بعد وعناصر البيانات الوصفية حرة الشكل بطبيعتها (أي حقول كائن الجدول
    // المعني)، لذا تُحوَّل صراحة إلى Json بدل تخفيف النوع إلى any.
    metadata: (entry.metadata ?? {}) as Json,
    before_data: (entry.before ?? null) as Json,
    after_data: (entry.after ?? null) as Json,
    ip,
    user_agent: userAgent,
  });
}

export async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const TRUSTED_HOST_PATTERN =
  /^(?:(?:[a-z0-9-]+\.)*mehlalex\.com|(?:[a-z0-9-]+\.)*lovable\.(?:app|dev)|localhost(?::\d+)?)$/i;
const DEFAULT_SITE_ORIGIN = "https://app.mehlalex.com";

export function isTrustedOrigin(originOrUrl: string): boolean {
  if (!originOrUrl) return false;
  try {
    const parsed = new URL(
      originOrUrl.startsWith("http://") || originOrUrl.startsWith("https://")
        ? originOrUrl
        : `https://${originOrUrl}`,
    );
    const host = parsed.host.toLowerCase();
    const hostname = parsed.hostname.toLowerCase();
    return TRUSTED_HOST_PATTERN.test(host) || TRUSTED_HOST_PATTERN.test(hostname);
  } catch {
    return false;
  }
}

export function sanitizeSiteOrigin(originOrUrl: string): string {
  if (!originOrUrl) return DEFAULT_SITE_ORIGIN;
  try {
    const parsed = new URL(originOrUrl);
    const host = parsed.host.toLowerCase();
    const hostname = parsed.hostname.toLowerCase();
    if (TRUSTED_HOST_PATTERN.test(host) || TRUSTED_HOST_PATTERN.test(hostname)) {
      return `${parsed.protocol}//${parsed.host}`;
    }
    return DEFAULT_SITE_ORIGIN;
  } catch {
    return DEFAULT_SITE_ORIGIN;
  }
}

/** أصل الطلب الموثوق لبناء روابط البريد (تفعيل / إعادة تعيين كلمة المرور) لمنع Host Header Injection. */
export function siteOrigin(path = ""): string {
  let candidate = "";
  try {
    candidate = getRequest().url;
  } catch {
    candidate = "";
  }
  const cleanPath = path ? (path.startsWith("/") ? path : `/${path}`) : "";
  const origin = sanitizeSiteOrigin(candidate);
  return `${origin}${cleanPath}`;
}
