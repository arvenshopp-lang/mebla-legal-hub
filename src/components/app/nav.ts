import {
  LayoutDashboard,
  Briefcase,
  Users,
  Gavel,
  Clock,
  ListChecks,
  FileText,
  Settings,
  UsersRound,
  CreditCard,
  FileSearch,
  Printer,
  LifeBuoy,
  Globe,
  BarChart3,
} from "lucide-react";
import type { AppRole } from "@/hooks/use-auth";

export type NavItem = {
  to: string;
  label: string;
  Icon: typeof LayoutDashboard;
  /** يظهر لهذه الأدوار فقط — الإخفاء تحسين تجربة، والفرض دائماً على الخادم. */
  roles?: AppRole[];
};

export type NavGroup = { label: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "العمل اليومي",
    items: [
      { to: "/dashboard", label: "الرئيسية", Icon: LayoutDashboard },
      { to: "/cases", label: "القضايا", Icon: Briefcase },
      { to: "/hearings", label: "الجلسات", Icon: Gavel },
      { to: "/deadlines", label: "المهل", Icon: Clock },
      { to: "/tasks", label: "المهام", Icon: ListChecks },
    ],
  },
  {
    label: "السجلات",
    items: [
      { to: "/clients", label: "العملاء", Icon: Users },
      { to: "/documents", label: "المستندات", Icon: FileText },
      { to: "/search", label: "البحث في المستندات", Icon: FileSearch },
    ],
  },
  {
    label: "المكتب",
    items: [
      { to: "/team", label: "الفريق", Icon: UsersRound },
      {
        to: "/team-performance",
        label: "أداء الفريق",
        Icon: BarChart3,
        roles: ["owner", "admin"],
      },
      { to: "/office-page", label: "الصفحة العامة", Icon: Globe },
      { to: "/print-log", label: "سجل الطباعة", Icon: Printer },
      { to: "/subscription", label: "الاشتراك", Icon: CreditCard },
      { to: "/support", label: "الدعم الفني", Icon: LifeBuoy },
      { to: "/settings", label: "الإعدادات", Icon: Settings },
    ],
  },
];

/** المقاصد اليومية الظاهرة في شريط الجوال السفلي — الباقي داخل «المزيد». */
export const MOBILE_PRIMARY: string[] = ["/dashboard", "/cases", "/hearings", "/tasks"];

/** مسارات الإنشاء السريع: صفحات تملك نموذج إنشاء فعلي داخلها. */
export const QUICK_CREATE: { to: string; label: string; Icon: typeof LayoutDashboard }[] = [
  { to: "/cases", label: "قضية جديدة", Icon: Briefcase },
  { to: "/clients", label: "عميل جديد", Icon: Users },
  { to: "/hearings", label: "جلسة جديدة", Icon: Gavel },
  { to: "/tasks", label: "مهمة جديدة", Icon: ListChecks },
];

export function visibleGroups(role: AppRole | null | undefined): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.roles || (role && item.roles.includes(role))),
  })).filter((group) => group.items.length > 0);
}

export function isNavActive(pathname: string, to: string): boolean {
  return pathname === to || pathname.startsWith(to + "/");
}