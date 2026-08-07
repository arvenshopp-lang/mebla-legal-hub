/**
 * مُصدِر التوقعات لاختبار التنقل الحي — مصدر الحقيقة هو الكود نفسه
 * (`ADMIN_NAV` + `admin-permissions` + `role-templates`) لا قائمة يدوية.
 * الإخراج JSON يستهلكه `scripts/e2e/rbac_nav_e2e.py`.
 * التشغيل: bun scripts/rbac-nav-expect.ts [--pretty]
 */
import { ADMIN_NAV, resolveRequiredPermission } from "../src/lib/admin-nav";
import { PERMISSION_LABELS, expandPermissions } from "../src/lib/admin-permissions";
import { ROLE_TEMPLATE_MAP } from "../src/lib/rbac/role-templates";

/** الأدوار الثمانية المطلوبة في جولة الاختبار + مالك المنصة. */
export const QA_ROLES = [
  "super_admin",
  "support_agent",
  "finance_manager",
  "sales_representative",
  "hr_manager",
  "security_administrator",
  "auditor",
  "read_only",
] as const;

export type RoleExpectation = {
  code: string;
  name_ar: string;
  isSuperAdmin: boolean;
  /** الصلاحيات الموسّعة — تُحقن في صف الموظف أثناء الاختبار الحي. */
  permissions: string[];
  visibleLabels: string[];
  visiblePaths: string[];
  deniedSamples: { path: string; permission: string; permissionLabel: string }[];
};

const ALL_ITEMS = ADMIN_NAV.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label })));

export function buildExpectations(): RoleExpectation[] {
  return QA_ROLES.map((code) => {
    const isSuperAdmin = code === "super_admin";
    const template = ROLE_TEMPLATE_MAP[code as keyof typeof ROLE_TEMPLATE_MAP];
    if (!isSuperAdmin && !template) throw new Error(`قالب دور غير موجود: ${code}`);
    const granted = new Set(isSuperAdmin ? [] : expandPermissions(template!.permissions));
    const can = (p?: string) => isSuperAdmin || !p || granted.has(p);

    const visible = ALL_ITEMS.filter((i) => can(i.permission));
    const denied = ALL_ITEMS.filter((i) => !can(i.permission))
      .slice(0, 3)
      .map((i) => {
        const permission = resolveRequiredPermission(i.to) ?? i.permission!;
        return {
          path: i.to,
          permission,
          permissionLabel: PERMISSION_LABELS[permission] ?? permission,
        };
      });

    return {
      code,
      name_ar: isSuperAdmin ? "مالك المنصة" : template!.name_ar,
      isSuperAdmin,
      permissions: isSuperAdmin ? [] : template!.permissions.slice(),
      visibleLabels: visible.map((i) => i.label),
      visiblePaths: visible.map((i) => i.to),
      deniedSamples: denied,
    };
  });
}

const expectations = buildExpectations();
if (process.argv.includes("--pretty")) {
  for (const e of expectations) {
    console.log(
      `${e.name_ar.padEnd(22)} (${e.code.padEnd(23)}) → ${String(e.visiblePaths.length).padStart(2)}/${ALL_ITEMS.length} عنصر | ممنوع للاختبار: ${e.deniedSamples.map((d) => d.path.replace("/mehla-admin", "") || "/").join(", ") || "—"}`,
    );
  }
} else {
  console.log(JSON.stringify({ totalItems: ALL_ITEMS.length, roles: expectations }, null, 2));
}
