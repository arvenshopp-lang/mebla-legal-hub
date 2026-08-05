/**
 * حرس لوحة إدارة المنصة — يُستدعى داخل معالجات دوال الخادم فقط.
 * كل عملية إدارية تمر من هنا: تحقق صلاحية فعلي على الخادم + كتابة سجل تدقيق
 * يحمل البيانات قبل وبعد التعديل مع IP والجهاز والمتصفح (تُثبّتها قاعدة البيانات).
 */
import { getRequest } from "@tanstack/react-start/server";
import type { AdminPermission } from "@/lib/admin-permissions";
import { expandPermissions } from "@/lib/admin-permissions";

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export async function requireStaff(
  supabase: AnyClient,
  userId: string,
  permission: AdminPermission,
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
  if (staff.role === "super_admin") return staff;
  const all = expandPermissions([
    ...(staff.permissions ?? []),
    ...(staff.platform_roles?.permissions ?? []),
  ]);
  if (!all.includes(permission)) throw new Error("لا تملك الصلاحية اللازمة لتنفيذ هذه العملية.");
  return staff;
}

/** موظف نشط بأي صلاحية — للصفحات القراءة العامة مثل لوحة المؤشرات. */
export async function requireActiveStaff(supabase: AnyClient, userId: string): Promise<StaffRow> {
  const { data } = await supabase
    .from("platform_staff")
    .select(
      "id, user_id, full_name, email, role, status, permissions, role_id, department_id, platform_roles(permissions)",
    )
    .eq("user_id", userId)
    .maybeSingle();
  const staff = data as StaffRow | null;
  if (!staff || staff.status !== "active") throw new Error("ليس لديك وصول إلى لوحة إدارة المنصة.");
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
    metadata: entry.metadata ?? {},
    before_data: entry.before ?? null,
    after_data: entry.after ?? null,
    ip,
    user_agent: userAgent,
  });
}

export async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as {
    from: (t: string) => any;
    auth: { admin: any; resetPasswordForEmail?: unknown };
    storage: any;
    rpc: (n: string, a?: unknown) => any;
  };
}

/** أصل الطلب الحقيقي لبناء روابط البريد (تفعيل / إعادة تعيين). */
export function siteOrigin(path = ""): string {
  try {
    const url = new URL(getRequest().url);
    return `${url.origin}${path}`;
  } catch {
    return `https://app.mehlalex.com${path}`;
  }
}
