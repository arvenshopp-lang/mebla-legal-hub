/**
 * سجل الصفحات القابلة للتخصيص — المعرّف الداخلي ثابت ولا يعتمد على الاسم الظاهر.
 * يُستخدم في محرر التصميم، وفي عزل CSS عبر [data-page="key"]، وفي المعاينة.
 */
export type DesignPage = {
  key: string;
  label: string;
  group: string;
  /** مسار حقيقي للمعاينة (إن وُجد سطح فعلي للصفحة) */
  previewPath?: string;
  /** بادئات المسارات التي تُعرّف هذه الصفحة أثناء التشغيل */
  match?: string[];
};

export const DESIGN_PAGES: DesignPage[] = [
  { key: "global", label: "التصميم العام (كل المنصة)", group: "عام" },

  { key: "home", label: "الصفحة الرئيسية", group: "الصفحات العامة", previewPath: "/", match: ["/"] },
  { key: "login", label: "تسجيل الدخول", group: "الصفحات العامة", previewPath: "/login", match: ["/login"] },
  { key: "signup", label: "إنشاء الحساب", group: "الصفحات العامة", previewPath: "/register", match: ["/register"] },
  {
    key: "forgot_password",
    label: "نسيان كلمة المرور",
    group: "الصفحات العامة",
    previewPath: "/forgot-password",
    match: ["/forgot-password", "/reset-password"],
  },
  {
    key: "verify",
    label: "التحقق من البريد أو الجوال",
    group: "الصفحات العامة",
    previewPath: "/auth/verified",
    match: ["/auth/verified", "/pending-access"],
  },
  { key: "track", label: "روابط المشاركة والمتابعة", group: "الصفحات العامة", previewPath: "/track", match: ["/track", "/share", "/upload"] },

  { key: "dashboard", label: "لوحة المشترك", group: "منصة المشتركين", previewPath: "/dashboard", match: ["/dashboard"] },
  { key: "cases", label: "القضايا", group: "منصة المشتركين", previewPath: "/cases", match: ["/cases"] },
  { key: "clients", label: "العملاء", group: "منصة المشتركين", previewPath: "/clients", match: ["/clients"] },
  { key: "documents", label: "المستندات", group: "منصة المشتركين", previewPath: "/documents", match: ["/documents", "/search"] },
  { key: "tasks", label: "المهام", group: "منصة المشتركين", previewPath: "/tasks", match: ["/tasks"] },
  { key: "calendar", label: "الجلسات والمواعيد", group: "منصة المشتركين", previewPath: "/calendar", match: ["/calendar", "/hearings", "/deadlines"] },
  { key: "team", label: "الفريق", group: "منصة المشتركين", previewPath: "/team", match: ["/team"] },
  { key: "settings", label: "الإعدادات", group: "منصة المشتركين", previewPath: "/settings", match: ["/settings", "/subscription"] },

  { key: "error_403", label: "صفحة 403", group: "صفحات الأخطاء" },
  { key: "error_404", label: "صفحة 404", group: "صفحات الأخطاء" },
  { key: "error_500", label: "صفحة 500", group: "صفحات الأخطاء" },

  { key: "header", label: "الترويسة", group: "عناصر مشتركة" },
  { key: "sidebar", label: "القائمة الجانبية", group: "عناصر مشتركة" },
  { key: "footer", label: "التذييل", group: "عناصر مشتركة" },
  { key: "modals", label: "النوافذ المنبثقة", group: "عناصر مشتركة" },
  { key: "tables", label: "الجداول", group: "عناصر مشتركة" },
  { key: "cards", label: "البطاقات", group: "عناصر مشتركة" },
  { key: "forms", label: "النماذج", group: "عناصر مشتركة" },
  { key: "buttons", label: "الأزرار", group: "عناصر مشتركة" },
  { key: "alerts", label: "التنبيهات", group: "عناصر مشتركة" },
  { key: "dropdowns", label: "القوائم المنسدلة", group: "عناصر مشتركة" },

  { key: "mobile", label: "نسخة الجوال", group: "الأجهزة" },
  { key: "desktop", label: "نسخة سطح المكتب", group: "الأجهزة" },
];

export const PAGE_KEYS = DESIGN_PAGES.map((p) => p.key);

export function isDesignPageKey(key: string): boolean {
  return PAGE_KEYS.includes(key);
}

export function designPage(key: string): DesignPage | undefined {
  return DESIGN_PAGES.find((p) => p.key === key);
}

/** يحوّل مسار التشغيل إلى مفتاح صفحة لعزل CSS عبر data-page. */
export function pageKeyForPath(pathname: string): string {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/") return "home";
  let best: { key: string; len: number } | null = null;
  for (const page of DESIGN_PAGES) {
    for (const prefix of page.match ?? []) {
      if (prefix === "/") continue;
      if (path === prefix || path.startsWith(`${prefix}/`)) {
        if (!best || prefix.length > best.len) best = { key: page.key, len: prefix.length };
      }
    }
  }
  return best?.key ?? "app";
}