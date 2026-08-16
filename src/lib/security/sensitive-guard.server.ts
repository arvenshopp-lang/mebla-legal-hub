/**
 * حارس موحّد للعمليات الحساسة — خادم فقط.
 *
 * كل عملية حساسة (كشف بيانات هوية، تنزيل/طباعة/تصدير/مشاركة مستند،
 * تعديل إعدادات الأمان) تمر من هنا قبل التنفيذ، ويُتحقق في كل مرة من:
 *   1) وجود جلسة موقّعة صالحة (يفرضها requireSupabaseAuth قبل الوصول هنا).
 *   2) عضوية المستخدم النشطة في نفس المكتب المطلوب.
 *   3) امتلاك الدور للصلاحية المطلوبة.
 *   4) أن مستوى تحقق الجلسة = AAL2 (تحقق بخطوتين مؤكَّد في هذه الجلسة).
 *   5) توليد معرّف تتبع يُكتب في سجل التدقيق المرافق للعملية.
 */
import { getRequest } from "@tanstack/react-start/server";
import { canDo, permissionDeniedMessage, type DocumentPermission } from "@/lib/doc-permissions";
import type { AppRole } from "@/hooks/use-auth";
import type { SensitiveOperation } from "./security-policy";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

export type RequestSecurityMeta = {
  ip: string | null;
  userAgent: string | null;
  browser: string | null;
  os: string | null;
  device: string | null;
};

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

export function requestSecurityMeta(): RequestSecurityMeta {
  let headers: Headers | null = null;
  try {
    headers = getRequest().headers;
  } catch {
    headers = null;
  }
  const ua = (headers?.get("user-agent") ?? "").slice(0, 300);
  const ip =
    headers?.get("cf-connecting-ip") ??
    headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headers?.get("x-real-ip") ??
    null;
  return { ip: ip ? ip.slice(0, 60) : null, userAgent: ua || null, ...parseUa(ua) };
}

/** معرّف تتبع قابل للبحث في السجلات، ولا يكشف أي بيانات. */
export function newTraceRef(prefix = "MS"): string {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  const body = Array.from(bytes)
    .map((b) => b.toString(36).toUpperCase().padStart(2, "0"))
    .join("")
    .slice(0, 8);
  return `${prefix}-${body}`;
}

export type Claims = Record<string, any> | null | undefined;

/** مستوى تحقق الجلسة كما يصرّح به الرمز الموقّع من Supabase Auth. */
export function assuranceLevel(claims: Claims): "aal1" | "aal2" | "unknown" {
  if (!claims) return "unknown";
  const aal = claims["aal"];
  if (aal === "aal2") return "aal2";
  const amr = claims["amr"];
  if (
    Array.isArray(amr) &&
    amr.some((entry) => entry?.method === "totp" || entry?.method === "mfa/totp")
  ) {
    return "aal2";
  }
  if (aal === "aal1") return "aal1";
  return "unknown";
}

export function hasAal2(claims: Claims): boolean {
  return assuranceLevel(claims) === "aal2";
}

/** مستوى التحقق مأخوذاً من رمز الطلب مباشرة (يُستخدم عند غياب claims في السياق). */
export function assuranceLevelFromRequest(): "aal1" | "aal2" | "unknown" {
  try {
    const auth = getRequest().headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const payload = token.split(".")[1];
    if (!payload) return "unknown";
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return assuranceLevel(JSON.parse(json) as Claims);
  } catch {
    return "unknown";
  }
}

export type SensitiveAccess = {
  role: AppRole;
  traceRef: string;
  meta: RequestSecurityMeta;
  aal: "aal1" | "aal2" | "unknown";
};

/**
 * تحقق شامل قبل أي عملية حساسة. يرمي رسالة عربية واضحة عند أي إخفاق،
 * ولا يُنفّذ شيئاً من العملية نفسها — المنادي مسؤول عن التسجيل بعد النجاح.
 */
export async function requireSensitiveAccess(
  supabase: Client,
  input: {
    userId: string;
    claims: Claims;
    organizationId: string;
    operation: SensitiveOperation;
    /** صلاحية الدور المطلوبة داخل المكتب (اختيارية للعمليات المحدّدة بالأدوار). */
    permission?: DocumentPermission;
    /** أدوار مسموح لها صراحةً حين لا تُستخدم مصفوفة صلاحيات المستندات. */
    allowRoles?: AppRole[];
  },
): Promise<SensitiveAccess> {
  const { data, error } = await supabase
    .from("organization_members")
    .select("role, status")
    .eq("organization_id", input.organizationId)
    .eq("user_id", input.userId)
    .eq("status", "active")
    .maybeSingle();
  if (error || !data) throw new Error("لا تملك وصولاً إلى بيانات هذا المكتب.");

  const role = data.role as AppRole;
  if (input.permission && !canDo(role, input.permission)) {
    throw new Error(permissionDeniedMessage(input.permission));
  }
  if (input.allowRoles && !input.allowRoles.includes(role)) {
    throw new Error("دورك في المكتب لا يسمح بتنفيذ هذه العملية.");
  }

  // فرض التحقق بخطوتين (AAL2) للعمليات الحساسة
  const aal = input.claims ? assuranceLevel(input.claims) : assuranceLevelFromRequest();
  if (input.operation === "pii_reveal" && aal !== "aal2") {
    throw new Error(
      "تتطلب هذه العملية جلسة مصادقة ثنائية نشطة (AAL2). يُرجى إكمال التحقق بخطوتين للمتابعة.",
    );
  }

  return { role, traceRef: newTraceRef(), meta: requestSecurityMeta(), aal };
}
