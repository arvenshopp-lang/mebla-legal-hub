/**
 * PLAN 3 — المسح القرائي الفعلي لكل استعلامات لوحة الإدارة.
 * ينفّذ كل دالة قراءة/قائمة/تقرير تستدعيها واجهة /mehla-admin بتوكن المشرف الأعلى
 * الحقيقي عبر بروتوكول createServerFn نفسه، ثم يعيد نفس النداء بتوكن موظف بلا
 * صلاحيات لإثبات الرفض الخادمي.
 */
import { APP } from "./qa-support";
import { loadP3 } from "./plan3-fixture";
import { resolveServerFns, callServerFn, type ServerFnRef } from "./serverfn-rpc";

const ctx = await loadP3();
const MODULES: Record<string, string> = {
  orgs: "src/lib/admin-orgs.functions.ts",
  users: "src/lib/admin-users.functions.ts",
  ops: "src/lib/admin-ops.functions.ts",
  console: "src/lib/admin-console.functions.ts",
  security: "src/lib/admin-security.functions.ts",
  observability: "src/lib/admin-observability.functions.ts",
  admin: "src/lib/admin.functions.ts",
  backups: "src/lib/backups.functions.ts",
  flags: "src/lib/flags.functions.ts",
  billing: "src/lib/billing/billing.functions.ts",
  design: "src/lib/design/theme.functions.ts",
  rbac: "src/lib/rbac/rbac.functions.ts",
  support: "src/lib/support/support.functions.ts",
  integrations: "src/lib/integrations/integrations.functions.ts",
  publicSite: "src/lib/public-site.functions.ts",
  crm: "src/lib/crm.functions.ts",
  hr: "src/lib/hr.functions.ts",
  marketing: "src/lib/marketing.functions.ts",
  sales: "src/lib/sales-docs.functions.ts",
  sms: "src/lib/sms/sms.functions.ts",
  email: "src/lib/email/email.functions.ts",
  failures: "src/lib/observability/failure-log.functions.ts",
};

const READ = /^(list|get|billingList|billingOverview|billingReports|billingProviderStats|preview|security|pipelineSummary|sourceReport|salesList|salesOptions|discover|lookup)/;
const SKIP = new Set([
  // تحتاج مُعرّفات كيانات وتُغطّى في مرحلة الإجراءات، أو خارج نطاق الإدارة
  "getCsatInvitation",
  "getUploadRequest",
  "lookupCaseStatus",
  "getPhoneChallenge",
  "getMyPhoneStatus",
  "getSmsPublicConfig",
  "getPublicSiteInfo",
]);

type Status = "PASS" | "FAIL" | "NEEDS_ARGS";
const rows: { mod: string; name: string; status: Status; denied: boolean; detail: string }[] = [];

for (const [mod, path] of Object.entries(MODULES)) {
  let fns: Record<string, ServerFnRef>;
  try {
    fns = await resolveServerFns(APP, path);
  } catch (e) {
    console.log(`FAIL [${mod}] تعذّر تحميل الوحدة :: ${(e as Error).message}`);
    continue;
  }
  for (const [name, ref] of Object.entries(fns)) {
    if (!READ.test(name) || SKIP.has(name)) continue;
    const r = await callServerFn({ appOrigin: APP, ref, token: ctx.superAdmin.token, data: {} });
    const needsArgs = !r.ok && /Required|Invalid|مطلوب|uuid|Expected/i.test(r.message);
    const status: Status = r.ok ? "PASS" : needsArgs ? "NEEDS_ARGS" : "FAIL";
    // الرفض الخادمي: نفس النداء بتوكن موظف بلا صلاحيات
    const d = await callServerFn({ appOrigin: APP, ref, token: ctx.plainStaff.token, data: {} });
    const denied = !d.ok;
    rows.push({ mod, name, status, denied, detail: r.ok ? "" : r.message.slice(0, 120) });
    console.log(
      `${status} [${mod}] ${name} — رفض غير المصرح: ${denied ? "نعم" : "لا"}${status === "PASS" ? "" : ` :: ${rows.at(-1)!.detail}`}`,
    );
  }
}

const pass = rows.filter((r) => r.status === "PASS").length;
const fail = rows.filter((r) => r.status === "FAIL").length;
const needs = rows.filter((r) => r.status === "NEEDS_ARGS").length;
const leaks = rows.filter((r) => r.status === "PASS" && !r.denied);
console.log(
  `\nملخص القراءة: PASS=${pass} FAIL=${fail} NEEDS_ARGS=${needs} — تسريب صلاحيات: ${leaks.length}`,
);
if (leaks.length) console.log("دوال لم ترفض الموظف غير المصرح:", leaks.map((l) => `${l.mod}.${l.name}`).join(", "));
await Bun.write("/tmp/browser/plan3/reads.json", JSON.stringify(rows, null, 2));
