/**
 * حوكمة الفهرسة — المصدر المركزي الوحيد (مِهلة | MEHLA)
 *
 * القاعدة: كل مسار غير مُدرَج صريحاً في `INDEXABLE_PATHS` يكون noindex تلقائياً.
 * أي Route جديد لا يظهر في محركات البحث حتى يُضاف يدوياً هنا.
 *
 * ممنوع تكرار هذه القوائم في أي ملف آخر: Meta robots داخل الصفحات وترويسة
 * `X-Robots-Tag` على الاستجابة تُشتقان من `indexingDecision` نفسها، فيستحيل
 * اختلافهما.
 */

/** السلوك الافتراضي: منع الفهرسة ما لم يُسمح صريحاً. */
export const NOINDEX_BY_DEFAULT = true;

/** قيمة robots للمسارات الممنوعة — تُستخدم في Meta وفي الترويسة بنفس النص. */
export const NOINDEX_ROBOTS = "noindex, nofollow, nosnippet, noimageindex";

/** قيمة robots للصفحات الرسمية المسموح بفهرستها. */
export const INDEX_ROBOTS = "index, follow";

/**
 * الصفحات الرسمية لمِهلة القابلة للفهرسة — الموجودة فعلاً في التطبيق فقط.
 * المطابقة حرفية وحسّاسة لحالة الأحرف (`/ABOUT` ليس `/about`).
 */
export const INDEXABLE_PATHS = [
  "/",
  "/about",
  "/how-it-works",
  "/pricing",
  "/faq",
  "/security",
  "/docs",
  "/contact",
  "/privacy",
  "/terms",
] as const;

export type IndexablePath = (typeof INDEXABLE_PATHS)[number];

/**
 * بادئات ممنوعة من الفهرسة نهائياً: صفحات المشتركين والروابط المؤقتة
 * وصفحات المصادقة ولوحات العمل والإدارة وواجهات الخدمة.
 */
export const FORBIDDEN_PREFIXES = [
  "/office",
  "/portal",
  "/track",
  "/share",
  "/sign",
  "/upload",
  "/invite",
  "/api",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/onboarding",
  "/pending-access",
  "/auth",
  "/_authenticated",
  "/mehla-admin",
  "/mcp",
  "/.mcp",
  "/lovable",
  "/verify",
] as const;

/**
 * مسارات لا تُخزَّن في أي Cache عام لأنها تحمل توكناً أو نتيجة خاصة.
 * `/verify` مُدرج لأن نتيجة التحقق تخص عقداً بعينه.
 */
export const NO_STORE_PREFIXES = [
  "/share",
  "/sign",
  "/upload",
  "/invite",
  "/verify",
  "/api/public/doc",
] as const;

/** مسارات تُرسل `Referrer-Policy: no-referrer` حتى لا يتسرّب التوكن في الإحالة. */
export const NO_REFERRER_PREFIXES = [
  "/share",
  "/sign",
  "/upload",
  "/invite",
  "/verify",
] as const;

/**
 * مسارات `/.well-known/*` الموجودة فعلاً: `oauth-protected-resource` يخدم
 * اكتشاف موارد MCP، ومسارات مركز الثقة تُدار من المنصة. تُترك وظيفتها كما هي
 * ولا تُدرَج في الفهرسة ولا في خريطة الموقع (تُغطّى بقاعدة الافتراضي).
 */
export const WELL_KNOWN_PATHS = [
  "/.well-known/oauth-protected-resource",
  "/.well-known/trust.html",
  "/.well-known/trust.json",
] as const;

/**
 * تطبيع المسار قبل أي مقارنة: إسقاط Query وHash، فكّ ترميز آمن، وتوحيد
 * الشرطة المائلة الأخيرة. **بلا تحويل حالة الأحرف** — الراوتر حسّاس لحالة
 * الأحرف، فأي صيغة غير مطابقة حرفياً تبقى غير قابلة للفهرسة.
 */
export function normalizePathname(input: string): string {
  let path = (input ?? "").split("#")[0].split("?")[0];
  try {
    path = decodeURI(path);
  } catch {
    // مسار بترميز غير صالح يُترك كما هو فلا يتطابق مع أي مدخل في القائمة.
  }
  if (!path.startsWith("/")) path = `/${path}`;
  path = path.replace(/\/{2,}/g, "/");
  const trimmed = path.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

/** مطابقة على حدود المسار: `/office` تطابق `/office` و`/office/x` ولا تطابق `/office-other`. */
function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function hasForbiddenPrefix(pathname: string): boolean {
  const path = normalizePathname(pathname);
  return FORBIDDEN_PREFIXES.some((prefix) => matchesPrefix(path, prefix));
}

/** هل المسار من الصفحات الرسمية المسموح بفهرستها؟ (مطابقة حرفية بعد التطبيع) */
export function isIndexablePath(pathname: string): boolean {
  const path = normalizePathname(pathname);
  if (hasForbiddenPrefix(path)) return false;
  return (INDEXABLE_PATHS as readonly string[]).includes(path);
}

export type IndexingContext = {
  pathname: string;
  /** سلسلة الاستعلام كما وصلت (`?a=1` أو `a=1`) أو كائن Query جاهز. */
  search?: string | URLSearchParams | Record<string, unknown> | null;
  /** إشارة صريحة إلى وجود توكن أو نتيجة خاصة داخل الصفحة. */
  hasToken?: boolean;
  hasResult?: boolean;
};

export type IndexingDecision = {
  indexable: boolean;
  robots: string;
  noStore: boolean;
  noReferrer: boolean;
};

function hasSearchParams(search: IndexingContext["search"]): boolean {
  if (!search) return false;
  if (typeof search === "string") {
    const raw = search.startsWith("?") ? search.slice(1) : search;
    return raw.trim().length > 0;
  }
  if (search instanceof URLSearchParams) return [...search.keys()].length > 0;
  return Object.keys(search).length > 0;
}

/**
 * قرار الفهرسة الوحيد في المنصة — يأخذ سياق الطلب الكامل لا المسار وحده:
 * أي Query Parameter أو توكن أو نتيجة يمنع الفهرسة ويمنع التخزين العام.
 */
export function indexingDecision(context: IndexingContext): IndexingDecision {
  const pathname = normalizePathname(context.pathname);
  const sensitive =
    hasSearchParams(context.search) || context.hasToken === true || context.hasResult === true;

  const noStore =
    NO_STORE_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix)) ||
    (sensitive && !isIndexablePath(pathname));
  const noReferrer = NO_REFERRER_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix));

  const indexable = isIndexablePath(pathname) && !sensitive;
  return {
    indexable,
    robots: indexable ? INDEX_ROBOTS : NOINDEX_ROBOTS,
    noStore,
    noReferrer,
  };
}

/** نص Meta robots الجاهز للاستخدام في `head()` لأي مسار ممنوع. */
export const NOINDEX_META = { name: "robots", content: NOINDEX_ROBOTS } as const;
