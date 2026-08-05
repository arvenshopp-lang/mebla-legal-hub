/**
 * فحص قوالب الأدوار — يتحقق آلياً من قواعد التجميد:
 *  1) كل صلاحية في كل قالب موجودة فعلاً في سجل الصلاحيات.
 *  2) لا قالب يحمل الصلاحية الموروثة `settings.manage`.
 *  3) قوالب الاطلاع (readonly) لا تحمل أي صلاحية كتابة.
 *  4) قواعد الفصل التشغيلي لكل قالب حسّاس.
 * التشغيل: bun scripts/rbac-template-audit.ts
 */
import { ADMIN_PERMISSIONS } from "../src/lib/admin-permissions";
import { ROLE_TEMPLATES, ROLE_TEMPLATE_MAP } from "../src/lib/rbac/role-templates";

const REGISTRY = new Set<string>(ADMIN_PERMISSIONS.map((p) => p.id as string));
// التصدير عملية قراءة (لا تُعدّل أي بيانات) ويُسجَّل في سجل التدقيق.
const READ_SUFFIXES = [
  ".read",
  ".view",
  ".export",
  ".view_all_offices",
  ".view_reports",
  ".view_logs",
];
const isRead = (p: string) =>
  READ_SUFFIXES.some((s) => p.endsWith(s)) ||
  p === "analytics.view" ||
  p === "logs.view" ||
  p === "tickets.view";

const failures: string[] = [];
const notes: string[] = [];
const fail = (m: string) => failures.push(m);

// 1) سجل الصلاحيات + تكرار
for (const t of ROLE_TEMPLATES) {
  for (const p of t.permissions) {
    if (!REGISTRY.has(p)) fail(`${t.code}: صلاحية غير موجودة في السجل → ${p}`);
  }
  const dup = t.permissions.filter((p, i) => t.permissions.indexOf(p) !== i);
  if (dup.length) fail(`${t.code}: صلاحيات مكررة → ${dup.join(", ")}`);
  if (t.permissions.includes("settings.manage" as never))
    fail(`${t.code}: يحمل الصلاحية الموروثة settings.manage`);
}
if (ROLE_TEMPLATES.length !== 19) fail(`عدد القوالب ${ROLE_TEMPLATES.length} ≠ 19`);
const codes = ROLE_TEMPLATES.map((t) => t.code);
if (new Set(codes).size !== codes.length) fail("رموز قوالب مكررة");

// 2) قواعد الفصل
const has = (code: string, p: string) =>
  !!ROLE_TEMPLATE_MAP[code]?.permissions.includes(p as never);
const forbid = (code: string, perms: string[], why: string) => {
  const found = perms.filter((p) => has(code, p));
  if (found.length) fail(`${code}: ${why} → ${found.join(", ")}`);
};
const require_ = (code: string, perms: string[]) => {
  const missing = perms.filter((p) => !has(code, p));
  if (missing.length) fail(`${code}: صلاحيات مطلوبة مفقودة → ${missing.join(", ")}`);
};

for (const code of ["executive_viewer", "read_only", "auditor"]) {
  const t = ROLE_TEMPLATE_MAP[code];
  const writes = (t?.permissions ?? []).filter((p) => !isRead(p as string));
  if (writes.length) fail(`${code}: يملك صلاحيات كتابة → ${writes.join(", ")}`);
}
forbid(
  "accountant",
  [
    "billing.refund",
    "billing.manage_providers",
    "billing.issue",
    "billing.cancel",
    "billing.close_period",
    "billing.reopen_period",
    "billing.approve_payment",
  ],
  "محاسب لا يملك الاسترداد/الإصدار/مزودي الدفع",
);
forbid(
  "support_agent",
  [
    "billing.read",
    "billing.view_reports",
    "revenue.read",
    "integrations.read",
    "integrations.manage",
    "security.read",
    "security.manage",
    "sms.manage",
    "email.manage_providers",
  ],
  "أخصائي الدعم لا يرى المالية ولا الأسرار",
);
forbid(
  "marketing_manager",
  [
    "email.manage",
    "email.manage_mailboxes",
    "email.manage_providers",
    "email.audit",
    "security.read",
    "security.manage",
    "integrations.manage",
    "platform_settings.manage",
  ],
  "التسويق لا يرى البريد الإداري ولا إعدادات الأمن",
);
forbid(
  "hr_manager",
  [
    "billing.read",
    "billing.create",
    "revenue.read",
    "integrations.read",
    "integrations.manage",
    "security.manage",
  ],
  "الموارد البشرية لا ترى الفواتير ولا أسرار التكاملات",
);
forbid(
  "contract_reviewer",
  [
    "sales_docs.approve",
    "sales_docs.decide",
    "sales_docs.send",
    "sales_docs.convert",
    "sales_docs.delete",
  ],
  "مراجع العقود لا يعتمد ولا يرسل ما أنشأه",
);
forbid(
  "security_administrator",
  ["billing.read", "billing.create", "billing.refund", "crm.read", "crm.update", "revenue.read"],
  "مسؤول الأمان بلا صلاحيات مالية أو تجارية افتراضاً",
);
forbid(
  "content_editor",
  ["content.publish", "content.rollback", "design.manage", "seo.manage"],
  "المحرّر لا ينشر",
);
require_("content_publisher", ["content.publish", "content.rollback"]);

// 3) لا قالب يعادل المالك
const OWNER_ONLY = [
  "users.delete",
  "organizations.delete",
  "backups.restore",
  "billing.reopen_period",
  "billing.manage_providers",
  "impersonation.request",
];
for (const t of ROLE_TEMPLATES) {
  const owned = OWNER_ONLY.filter((p) => t.permissions.includes(p as never));
  if (owned.length) notes.push(`${t.code}: يحمل صلاحية شديدة الحساسية → ${owned.join(", ")}`);
}

console.log(`قوالب: ${ROLE_TEMPLATES.length} | صلاحيات في السجل: ${REGISTRY.size}`);
for (const n of notes) console.log("ملاحظة:", n);
if (failures.length) {
  console.error(`\n✗ ${failures.length} إخفاق:`);
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("\n✓ كل القوالب مطابقة لقواعد الفصل ومنع التصعيد.");
