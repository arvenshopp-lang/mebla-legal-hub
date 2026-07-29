/**
 * MehlaLex — سجل النطاقات الفرعية الرسمي (Surface Registry)
 * ---------------------------------------------------------
 * مصدر الحقيقة الوحيد لبنية النطاقات. إضافة خدمة جديدة مستقبلاً = إضافة سطر هنا فقط.
 * لا يغيّر هذا الملف أي وظيفة قائمة؛ فقط يحدد أي مسارات تُخدَم على أي نطاق.
 */

export const ROOT_DOMAIN = "mehlalex.com";

export type SurfaceId =
  | "www" | "app" | "client" | "upload" | "status" | "api" | "docs"
  | "billing" | "mail" | "calendar" | "files" | "ai" | "notifications" | "analytics";

export interface SurfaceDef {
  id: SurfaceId;
  /** الجزء الأول من النطاق (www.mehlalex.com => "www") */
  subdomain: string;
  label: string;
  description: string;
  /** المسار الافتراضي عند فتح جذر النطاق */
  entry: string;
  /** بادئات المسارات المسموح تقديمها على هذا النطاق */
  allow: string[];
  /** هل يحتاج المستخدم لجلسة مكتب محاماة */
  requiresLawyerAuth: boolean;
  /** نطاق API فقط: يمنع تقديم أي HTML */
  apiOnly?: boolean;
  /** محجوز للمستقبل: لم يُفعّل بعد */
  planned?: boolean;
}

/** الترتيب مهم: أول نطاق يطابق المسار هو المالك الرسمي له. */
export const SURFACES: SurfaceDef[] = [
  {
    id: "app",
    subdomain: "app",
    label: "منصة المحامين",
    description: "لوحة التحكم، العملاء، القضايا، الجلسات، المهل، المستندات، الفريق، الإعدادات.",
    entry: "/dashboard",
    allow: [
      "/dashboard", "/clients", "/cases", "/hearings", "/deadlines", "/tasks",
      "/documents", "/team", "/settings", "/onboarding", "/pending-access",
      "/login", "/register", "/forgot-password", "/reset-password", "/auth",
    ],
    requiresLawyerAuth: true,
  },
  {
    id: "client",
    subdomain: "client",
    label: "بوابة العميل",
    description: "متابعة القضية والتحديثات المسموح بها ورفع المستندات المطلوبة.",
    entry: "/track",
    allow: ["/track", "/upload"],
    requiresLawyerAuth: false,
  },
  {
    id: "upload",
    subdomain: "upload",
    label: "خدمة رفع المستندات",
    description: "استقبال روابط الرفع فقط، ويُبطل الرابط نهائياً بعد الاستخدام.",
    entry: "/upload",
    allow: ["/upload"],
    requiresLawyerAuth: false,
  },
  {
    id: "status",
    subdomain: "status",
    label: "بوابة التحقق من القضايا",
    description: "إدخال رمز القضية وعرض التحديثات المصرّح بها فقط.",
    entry: "/track",
    allow: ["/track"],
    requiresLawyerAuth: false,
  },
  {
    id: "api",
    subdomain: "api",
    label: "واجهة API الرسمية",
    description: "REST / RPC / Webhooks فقط بدون أي واجهة مستخدم.",
    entry: "/api",
    allow: ["/api"],
    requiresLawyerAuth: false,
    apiOnly: true,
  },
  {
    id: "docs",
    subdomain: "docs",
    label: "مركز المساعدة",
    description: "دليل الاستخدام والأسئلة الشائعة وتوثيق API والشروط والخصوصية.",
    entry: "/docs",
    allow: ["/docs"],
    requiresLawyerAuth: false,
  },
  {
    id: "www",
    subdomain: "www",
    label: "الموقع التسويقي",
    description: "الصفحة الرئيسية والمميزات والأسعار وتسجيل الدخول وإنشاء الحساب.",
    entry: "/",
    allow: ["/", "/login", "/register", "/forgot-password", "/reset-password", "/auth", "/docs", "/track"],
    requiresLawyerAuth: false,
  },
  // ————— نطاقات محجوزة للتوسع المستقبلي (تُفعّل بإزالة planned) —————
  { id: "billing", subdomain: "billing", label: "الفواتير", description: "الاشتراكات والفواتير.", entry: "/billing", allow: ["/billing"], requiresLawyerAuth: true, planned: true },
  { id: "mail", subdomain: "mail", label: "البريد", description: "بريد المكتب والقوالب.", entry: "/mail", allow: ["/mail"], requiresLawyerAuth: true, planned: true },
  { id: "calendar", subdomain: "calendar", label: "التقويم", description: "الجلسات والمواعيد.", entry: "/calendar", allow: ["/calendar"], requiresLawyerAuth: true, planned: true },
  { id: "files", subdomain: "files", label: "الملفات", description: "أرشيف المستندات.", entry: "/files", allow: ["/files"], requiresLawyerAuth: true, planned: true },
  { id: "ai", subdomain: "ai", label: "الذكاء الاصطناعي", description: "المساعد القانوني وتحليل الوثائق.", entry: "/ai", allow: ["/ai"], requiresLawyerAuth: true, planned: true },
  { id: "notifications", subdomain: "notifications", label: "التنبيهات", description: "مركز الإشعارات.", entry: "/notifications", allow: ["/notifications"], requiresLawyerAuth: true, planned: true },
  { id: "analytics", subdomain: "analytics", label: "التحليلات", description: "تقارير الأداء.", entry: "/analytics", allow: ["/analytics"], requiresLawyerAuth: true, planned: true },
];

/** النطاق الذي تُدار فيه الجلسة وتسجيل الدخول (SSO مركزي). */
export const AUTH_SURFACE: SurfaceId = "app";

/** مسارات تعمل على كل النطاقات (أصول، صحة، مصادقة خلفية). */
const UNIVERSAL_PREFIXES = ["/api", "/_serverFn", "/_build", "/assets", "/favicon", "/robots.txt", "/sitemap.xml"];

export function getSurface(id: SurfaceId): SurfaceDef {
  const s = SURFACES.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown surface: ${id}`);
  return s;
}

/**
 * يحدد النطاق الحالي من الـ host.
 * يُرجع null لبيئات التطوير/المعاينة (localhost، *.lovable.app، الدومين المجرد)
 * حتى تبقى كل الصفحات متاحة كما هي اليوم دون كسر أي وظيفة.
 */
export function resolveSurface(host?: string | null): SurfaceDef | null {
  if (!host) return null;
  const hostname = host.split(":")[0].toLowerCase();
  if (!hostname.endsWith(`.${ROOT_DOMAIN}`)) return null;
  const sub = hostname.slice(0, -(ROOT_DOMAIN.length + 1));
  const surface = SURFACES.find((s) => s.subdomain === sub && !s.planned);
  return surface ?? null;
}

function matches(prefixes: string[], pathname: string) {
  return prefixes.some((p) => (p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(`${p}/`)));
}

export function isUniversalPath(pathname: string) {
  return matches(UNIVERSAL_PREFIXES, pathname);
}

export function isPathAllowed(surface: SurfaceDef | null, pathname: string) {
  if (!surface) return true;
  if (isUniversalPath(pathname)) return !surface.apiOnly ? true : pathname.startsWith("/api");
  if (surface.apiOnly) return false;
  return matches(surface.allow, pathname);
}

/** النطاق الرسمي المالك لمسار معيّن (يُستخدم للتحويل عبر النطاقات). */
export function ownerSurface(pathname: string): SurfaceDef {
  const owner = SURFACES.find((s) => !s.planned && !s.apiOnly && matches(s.allow, pathname));
  return owner ?? getSurface("www");
}

export function surfaceOrigin(id: SurfaceId, currentHost?: string | null): string {
  const hostname = (currentHost ?? "").split(":")[0].toLowerCase();
  // خارج الدومين الرسمي (تطوير/معاينة) نبقى على نفس الأصل حتى لا تنكسر الروابط.
  if (!hostname.endsWith(ROOT_DOMAIN)) return "";
  return `https://${getSurface(id).subdomain}.${ROOT_DOMAIN}`;
}

export function surfaceUrl(id: SurfaceId, path: string, currentHost?: string | null): string {
  return `${surfaceOrigin(id, currentHost)}${path.startsWith("/") ? path : `/${path}`}`;
}
