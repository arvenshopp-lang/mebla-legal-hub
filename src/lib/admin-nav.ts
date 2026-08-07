/**
 * سجل تنقل لوحة إدارة المنصة — المصدر الوحيد للحقيقة للقائمة الجانبية،
 * وتبويبات المحاور (Hubs)، ومسار التنقل (Breadcrumbs).
 *
 * لا يحتوي أي منطق صلاحيات خادمي؛ الصلاحية هنا للعرض فقط، والحماية الفعلية
 * تبقى في دوال الخادم (`requireStaff`) وسياسات RLS.
 */
import {
  Activity,
  BellRing,
  Building2,
  CreditCard,
  DatabaseBackup,
  FileSignature,
  FileText,
  Gauge,
  Handshake,
  Inbox,
  KeyRound,
  Layers,
  LifeBuoy,
  Lock,
  Megaphone,
  MessageSquare,
  Palette,
  Plug,
  Receipt,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  ToggleLeft,
  TrendingUp,
  UserCog,
  Users,
} from "lucide-react";
import type { AdminPermission } from "@/lib/admin-permissions";

export type AdminIcon = typeof Gauge;

/** تبويب داخل صفحة محورية — كل تبويب مسار حقيقي قائم. */
export type AdminNavTab = {
  to: string;
  label: string;
  permission?: AdminPermission;
};

export type AdminNavItem = {
  to: string;
  label: string;
  Icon: AdminIcon;
  permission?: AdminPermission;
  /** تبويبات المحور: تُعرض في كل مسار من مساراتها. */
  tabs?: AdminNavTab[];
};

export type AdminNavGroup = {
  id: string;
  label: string;
  items: AdminNavItem[];
};

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    id: "ops",
    label: "التشغيل",
    items: [
      { to: "/mehla-admin", label: "مركز القيادة", Icon: Gauge },
      { to: "/mehla-admin/users", label: "المستخدمون", Icon: Users, permission: "users.read" },
      {
        to: "/mehla-admin/organizations",
        label: "المكاتب",
        Icon: Building2,
        permission: "organizations.read",
      },
      {
        to: "/mehla-admin/subscriptions",
        label: "الاشتراكات",
        Icon: CreditCard,
        permission: "subscriptions.manage",
      },
      { to: "/mehla-admin/plans", label: "الباقات", Icon: Layers, permission: "plans.manage" },
    ],
  },
  {
    id: "growth",
    label: "النمو والإيراد",
    items: [
      { to: "/mehla-admin/crm", label: "إدارة العلاقات", Icon: Handshake, permission: "crm.read" },
      {
        to: "/mehla-admin/sales",
        label: "العروض والعقود",
        Icon: FileSignature,
        permission: "sales_docs.read",
      },
      {
        to: "/mehla-admin/billing",
        label: "المركز المالي",
        Icon: Receipt,
        permission: "billing.read",
      },
      {
        to: "/mehla-admin/revenue",
        label: "الإيرادات والتقارير",
        Icon: TrendingUp,
        permission: "revenue.read",
      },
      {
        to: "/mehla-admin/marketing",
        label: "مركز التسويق",
        Icon: Megaphone,
        permission: "marketing.read",
      },
    ],
  },
  {
    id: "comms",
    label: "المراسلات والدعم",
    items: [
      {
        to: "/mehla-admin/support",
        label: "مركز الدعم",
        Icon: LifeBuoy,
        permission: "tickets.view",
      },
      {
        to: "/mehla-admin/mail",
        label: "مركز البريد",
        Icon: Inbox,
        permission: "email.view",
        tabs: [
          { to: "/mehla-admin/mail", label: "صناديق البريد", permission: "email.view" },
          { to: "/mehla-admin/email", label: "القوالب والإعدادات", permission: "email.manage" },
        ],
      },
      {
        to: "/mehla-admin/notifications",
        label: "الإشعارات",
        Icon: BellRing,
        permission: "notifications.send",
      },
      {
        to: "/mehla-admin/sms",
        label: "الرسائل وتوثيق الجوال",
        Icon: MessageSquare,
        permission: "sms.read",
      },
      {
        to: "/mehla-admin/integrations",
        label: "مركز التكاملات",
        Icon: Plug,
        permission: "integrations.read",
      },
    ],
  },
  {
    id: "platform",
    label: "المنصة",
    items: [
      {
        to: "/mehla-admin/monitoring",
        label: "مراقبة النظام",
        Icon: Activity,
        permission: "monitoring.read",
        tabs: [
          { to: "/mehla-admin/monitoring", label: "نظرة عامة" },
          { to: "/mehla-admin/analytics", label: "التحليلات والنمو" },
          { to: "/mehla-admin/services", label: "حالة الخدمات" },
          { to: "/mehla-admin/jobs", label: "مهام النظام" },
          { to: "/mehla-admin/failures", label: "سجل الأعطال", permission: "audit.read" },
        ],
      },
      {
        to: "/mehla-admin/backups",
        label: "النسخ الاحتياطية",
        Icon: DatabaseBackup,
        permission: "backups.read",
      },
      {
        to: "/mehla-admin/flags",
        label: "مفاتيح التشغيل",
        Icon: ToggleLeft,
        permission: "feature_flags.read",
      },
      {
        to: "/mehla-admin/settings",
        label: "إعدادات المنصة",
        Icon: Settings,
        permission: "platform_settings.read",
      },
    ],
  },
  {
    id: "public-site",
    label: "الموقع العام",
    items: [
      {
        to: "/mehla-admin/content",
        label: "إدارة المحتوى",
        Icon: FileText,
        permission: "content.read",
      },
      { to: "/mehla-admin/seo", label: "إدارة SEO", Icon: Search, permission: "seo.read" },
      {
        to: "/mehla-admin/design",
        label: "تصميم المنصة",
        Icon: Palette,
        permission: "design.read",
      },
    ],
  },
  {
    id: "security",
    label: "الأمان والفريق",
    items: [
      {
        to: "/mehla-admin/staff",
        label: "الموظفون والصلاحيات",
        Icon: ShieldCheck,
        permission: "staff.view",
      },
      { to: "/mehla-admin/hr", label: "مركز الموظفين", Icon: UserCog, permission: "hr.read" },
      {
        to: "/mehla-admin/rbac",
        label: "الأدوار والصلاحيات",
        Icon: KeyRound,
        permission: "staff.view",
      },
      {
        to: "/mehla-admin/security",
        label: "مركز الأمان",
        Icon: Lock,
        permission: "security.read",
      },
      { to: "/mehla-admin/logs", label: "سجل التدقيق", Icon: ScrollText, permission: "audit.read" },
      {
        to: "/mehla-admin/activity",
        label: "سجل النشاط الموحّد",
        Icon: Activity,
        permission: "audit.read",
      },
    ],
  },
];

/** هل المسار الحالي داخل عنصر القائمة (المسار نفسه أو أحد أبنائه)؟ */
export function isNavPathActive(pathname: string, to: string): boolean {
  if (to === "/mehla-admin") return pathname === to || pathname === `${to}/`;
  return pathname === to || pathname.startsWith(`${to}/`);
}

/** أفضل عنصر مطابق للمسار الحالي: أطول مسار مطابق لا أول مطابق. */
export function resolveNavMatch(
  pathname: string,
): { group: AdminNavGroup; item: AdminNavItem } | null {
  let best: { group: AdminNavGroup; item: AdminNavItem } | null = null;
  const consider = (group: AdminNavGroup, item: AdminNavItem, to: string) => {
    if (to === "/mehla-admin") return;
    if (!isNavPathActive(pathname, to)) return;
    if (!best || to.length > bestLength) {
      best = { group, item };
      bestLength = to.length;
    }
  };
  let bestLength = 0;
  for (const group of ADMIN_NAV) {
    for (const item of group.items) {
      consider(group, item, item.to);
      for (const tab of item.tabs ?? []) consider(group, item, tab.to);
    }
  }
  return best;
}

/** عنوان التبويب المطابق للمسار الحالي داخل محور، إن وُجد. */
export function resolveTabLabel(pathname: string): string | null {
  const match = resolveNavMatch(pathname);
  if (!match?.item.tabs) return null;
  const tab = [...match.item.tabs]
    .sort((a, b) => b.to.length - a.to.length)
    .find((t) => isNavPathActive(pathname, t.to));
  return tab && tab.to !== match.item.to ? tab.label : null;
}

/** تبويبات المحور الخاصة بالمسار الحالي، إن وُجدت. */
export function resolveNavTabs(pathname: string): AdminNavTab[] | null {
  const match = resolveNavMatch(pathname);
  if (!match?.item.tabs) return null;
  return match.item.tabs;
}

/**
 * الصلاحية اللازمة لعرض المسار الحالي — أعمق مطابقة (تبويب ثم عنصر).
 * تُستخدم لبوابة عرض واحدة في `AdminShell` بدل تكرار الفحص في كل صفحة.
 * الحماية الفعلية تبقى خادمية؛ هذه البوابة تمنع شاشة فارغة أو رسالة خطأ خام.
 */
export function resolveRequiredPermission(pathname: string): AdminPermission | null {
  const match = resolveNavMatch(pathname);
  if (!match) return null;
  const tab = [...(match.item.tabs ?? [])]
    .sort((a, b) => b.to.length - a.to.length)
    .find((t) => isNavPathActive(pathname, t.to));
  return tab?.permission ?? match.item.permission ?? null;
}
