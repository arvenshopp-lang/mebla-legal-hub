/**
 * فحص اتساق البوابة المركزية مع سجل التنقل لكل دور:
 *  1) كل عنصر ظاهر في القائمة يجب أن تسمح البوابة بعرضه (لا منع كاذب).
 *  2) كل عنصر مخفي يجب أن تمنعه البوابة (لا تسريب بصري).
 *  3) كل تبويب ظاهر داخل محور يجب أن تسمح البوابة بمساره.
 *  4) رسالة المنع يجب أن تحمل اسم صلاحية موجود في سجل الصلاحيات.
 * التشغيل: bun scripts/rbac-nav-check.ts
 */
import { ADMIN_NAV, resolveRequiredPermission } from "../src/lib/admin-nav";
import { PERMISSION_LABELS, expandPermissions } from "../src/lib/admin-permissions";
import { ROLE_TEMPLATES } from "../src/lib/rbac/role-templates";

const failures: string[] = [];
const items = ADMIN_NAV.flatMap((g) => g.items);

for (const template of ROLE_TEMPLATES) {
  const granted = new Set(expandPermissions(template.permissions));
  const can = (p?: string | null) => !p || granted.has(p);

  for (const item of items) {
    const navVisible = can(item.permission);
    const gateAllows = can(resolveRequiredPermission(item.to));
    if (navVisible && !gateAllows) {
      failures.push(`${template.code}: ${item.to} ظاهر في القائمة لكن البوابة تمنعه (منع كاذب)`);
    }
    if (!navVisible && gateAllows) {
      failures.push(`${template.code}: ${item.to} مخفي لكن البوابة تسمح به (تسريب بصري)`);
    }
    for (const tab of item.tabs ?? []) {
      const tabVisible = navVisible && can(tab.permission ?? item.permission);
      if (tabVisible && !can(resolveRequiredPermission(tab.to))) {
        failures.push(`${template.code}: تبويب ${tab.to} ظاهر لكن البوابة تمنعه`);
      }
    }
  }
}

for (const item of items) {
  for (const to of [item.to, ...(item.tabs ?? []).map((t) => t.to)]) {
    const permission = resolveRequiredPermission(to);
    if (permission && !PERMISSION_LABELS[permission]) {
      failures.push(`رسالة المنع في ${to} تستخدم صلاحية بلا اسم عربي: ${permission}`);
    }
  }
}

console.log(`أدوار مفحوصة: ${ROLE_TEMPLATES.length} × ${items.length} عنصر`);
if (failures.length) {
  console.error(`\n✗ ${failures.length} مخالفة:`);
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}
console.log("✓ البوابة المركزية متسقة تماماً مع سجل التنقل");
