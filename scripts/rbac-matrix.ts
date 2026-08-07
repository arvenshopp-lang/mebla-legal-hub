/**
 * فحص مصفوفة الصلاحيات: يتأكد أن كل مسار في سجل تنقل لوحة الإدارة
 * مرتبط بصلاحية معروفة، وأن قوالب الأدوار الجاهزة ترى مجموعة مسارات
 * منطقية (كل قالب يرى مسارًا واحدًا على الأقل، ولا قالب غير مالك المنصة
 * يرى كل شيء). يُشغَّل في CI ويفشل عند أي مخالفة.
 */
import { ADMIN_NAV } from "../src/lib/admin-nav";
import { ADMIN_PERMISSIONS, expandPermissions } from "../src/lib/admin-permissions";
import { ROLE_TEMPLATES } from "../src/lib/rbac/role-templates";

const known = new Set(ADMIN_PERMISSIONS.map((p) => p.id));
const violations: string[] = [];

type Entry = { to: string; permission: string | null; label: string };
const entries: Entry[] = [];
for (const group of ADMIN_NAV) {
  for (const item of group.items) {
    entries.push({ to: item.to, permission: item.permission ?? null, label: item.label });
    for (const tab of item.tabs ?? []) {
      // التبويب يرث صلاحية المحور عند عدم تحديد صلاحية أدق.
      entries.push({
        to: tab.to,
        permission: tab.permission ?? item.permission ?? null,
        label: tab.label,
      });
    }
  }
}

for (const entry of entries) {
  if (entry.permission && !known.has(entry.permission)) {
    violations.push(`مسار ${entry.to} يشير إلى صلاحية غير معروفة: ${entry.permission}`);
  }
  if (!entry.permission && entry.to !== "/mehla-admin") {
    violations.push(`مسار ${entry.to} (${entry.label}) بلا صلاحية مسجّلة في admin-nav`);
  }
}

const totalPaths = new Set(entries.map((e) => e.to)).size;
console.log(`مسارات مسجّلة: ${totalPaths} — صلاحيات معروفة: ${known.size}`);

for (const template of ROLE_TEMPLATES) {
  const granted = new Set(expandPermissions(template.permissions));
  const visible = entries.filter((e) => !e.permission || granted.has(e.permission));
  const paths = new Set(visible.map((e) => e.to));
  console.log(`${template.name_ar.padEnd(24)} → ${paths.size}/${totalPaths} مسار`);
  if (paths.size === 0) violations.push(`قالب ${template.code} لا يرى أي مسار`);
  if (template.code !== "super_admin" && paths.size === totalPaths) {
    violations.push(`قالب ${template.code} يرى كل المسارات — مبدأ أقل صلاحية مخالف`);
  }
}

if (violations.length > 0) {
  console.error(`\n✗ ${violations.length} مخالفة:`);
  for (const v of violations) console.error(` - ${v}`);
  process.exit(1);
}
console.log("\n✓ مصفوفة الصلاحيات سليمة");
