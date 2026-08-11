/**
 * حراس سكونية لتحصين جدول المستندات.
 * لا تنشئ بيانات ولا تكتب في القاعدة؛ تقرأ المصدر وملف migration فقط،
 * وتتحقق من الوصف السكوني لسياسات القاعدة عند توفر migration المطابق.
 *
 * التشغيل: bun run documents:integrity
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assertOrgScopedStoragePath } from "../src/lib/secure-view/secure-view.server";

const ROOT = join(import.meta.dirname, "..");
let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    pass += 1;
    console.log(`PASS  ${name}`);
  } else {
    fail += 1;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

// 1) migration التحصين موجود ويحتوي كل الضمانات، وidempotent
const migrations = new Bun.Glob("supabase/migrations/*.sql");
let hardening = "";
let uniqueIndexSql = "";
for await (const rel of migrations.scan({ cwd: ROOT })) {
  const sql = read(rel);
  if (sql.includes("documents_enforce_integrity")) hardening += `\n${sql}`;
  if (/CREATE UNIQUE INDEX[^;]*documents[^;]*\(\s*file_path\s*\)/i.test(sql))
    uniqueIndexSql += `\n${sql}`;
}
check("migration: unique file_path index declared", uniqueIndexSql.length > 0);
check("migration: documents hardening present", hardening.length > 0);
check(
  "migration: drops browser INSERT policy",
  /DROP POLICY IF EXISTS\s+docs_insert/i.test(hardening),
);
check(
  "migration: revokes INSERT from authenticated",
  /REVOKE INSERT ON public\.documents FROM authenticated/i.test(hardening),
);
check(
  "migration: enforces org-prefixed file_path",
  /organization_id::text \|\| '\/'/.test(hardening),
);
check(
  "migration: validates case ownership",
  /public\.cases[\s\S]{0,200}organization_id = NEW\.organization_id/.test(hardening),
);
check(
  "migration: validates client ownership",
  /public\.clients[\s\S]{0,200}organization_id = NEW\.organization_id/.test(hardening),
);
for (const col of [
  "file_path",
  "file_type",
  "file_size",
  "storage_verified_at",
  "organization_id",
]) {
  check(
    `migration: ${col} immutable for authenticated`,
    new RegExp(`NEW\\.${col} IS DISTINCT FROM OLD\\.${col}`).test(hardening),
  );
}
check(
  "migration: unique file_path index",
  /CREATE UNIQUE INDEX IF NOT EXISTS documents_file_path_unique/i.test(hardening) ||
    /documents_file_path_key/i.test(uniqueIndexSql),
);
check("migration: fixed search_path", /SET search_path = private, public, pg_temp/.test(hardening));
check(
  "migration: idempotent statements only",
  /CREATE OR REPLACE FUNCTION/.test(hardening) &&
    /DROP TRIGGER IF EXISTS/.test(hardening) &&
    /IF NOT EXISTS/.test(hardening),
);

// 2) لا إدراج في documents عبر عميل المستخدم في أي مكان بالمصدر
const sources: string[] = [];
for await (const rel of new Bun.Glob("src/**/*.{ts,tsx}").scan({ cwd: ROOT })) sources.push(rel);
for (const rel of sources) {
  if (rel.endsWith("routeTree.gen.ts")) continue;
  const src = read(rel);
  const userClientInsert =
    /(context\.supabase|\bsupabase)\s*\n?\s*\.from\(\s*"documents"\s*\)\s*\n?\s*\.insert/m.test(
      src,
    );
  check(`source: ${rel} has no browser/user-client document insert`, !userClientInsert);
}

// 3) مسار الإنهاء: الدور ثم التحقق ثم الإدراج بمفتاح الخدمة
const finalize = read("src/lib/documents/intake.functions.ts");
check("finalize: requires write role", finalize.includes("requireDocumentWriteRole"));
check("finalize: verifies uploaded bytes", finalize.includes("verifyUploadedObject"));
check("finalize: blocks cross-org links", finalize.includes("assertCaseAndClientInOrg"));
check("finalize: blocks path replay", finalize.includes("assertPathNotLinked"));
check(
  "finalize: inserts with service admin",
  /supabaseAdmin\s*\n?\s*\.from\("documents"\)\s*\n?\s*\.insert/m.test(finalize),
);
check(
  "finalize: role check precedes insert",
  finalize.indexOf("requireDocumentWriteRole(") < finalize.indexOf('.from("documents")'),
);

// 3b) حذف المستندات: مسار خادمي واحد، وصلاحيات متطابقة، وبلا تجاهل لأخطاء المخزن
let deleteSql = "";
for await (const rel of new Bun.Glob("supabase/migrations/*.sql").scan({ cwd: ROOT })) {
  const sql = read(rel);
  if (/REVOKE DELETE ON public\.documents FROM authenticated/i.test(sql)) deleteSql += `\n${sql}`;
}
check("delete: migration revokes row DELETE from authenticated", deleteSql.length > 0);
check(
  "delete: migration drops docs_delete policy",
  /DROP POLICY IF EXISTS docs_delete ON public\.documents/i.test(deleteSql),
);
check(
  "delete: migration drops direct storage delete policy",
  /DROP POLICY IF EXISTS docs_storage_delete ON storage\.objects/i.test(deleteSql),
);

const intakeServer = read("src/lib/documents/intake.server.ts");
check(
  "delete: server permission check exists",
  intakeServer.includes("export async function requireDocumentDeletePermission"),
);
check(
  "delete: permission rule matches previous policy (owner/admin, or own upload for lawyer/legal_assistant)",
  /DELETE_ANY_ROLES = \["owner", "admin"\]/.test(intakeServer) &&
    /DELETE_OWN_ROLES = \["lawyer", "legal_assistant"\]/.test(intakeServer) &&
    /doc\.uploaded_by === userId/.test(intakeServer),
);
check(
  "delete: permission read uses user client (RLS)",
  /requireDocumentDeletePermission\([\s\S]{0,200}supabase: Client/.test(intakeServer),
);
check(
  "delete: path is org-scoped before purge",
  /assertOwnedPath\(doc\.file_path/.test(intakeServer),
);
check(
  "delete: storage removal error aborts before row delete",
  intakeServer.indexOf("لم يُحذف شيء") < intakeServer.indexOf('.from("documents").delete()'),
);
check(
  "delete: row delete happens only after object removal",
  /remove\(\[doc\.file_path\]\)[\s\S]*\.from\("documents"\)\n?\s*\.delete\(\)/.test(
    intakeServer.replace(/\s+/g, (m) => m),
  ),
);

const deleteFn = read("src/lib/documents/intake.functions.ts");
check(
  "delete: exposed as authenticated server function",
  /export const deleteDocument = createServerFn[\s\S]{0,200}requireSupabaseAuth/.test(deleteFn),
);
check(
  "delete: validates uuid input",
  /deleteDocument[\s\S]{0,400}documentId: z\.string\(\)\.uuid\(\)/.test(deleteFn),
);

const docsPage = read("src/routes/_authenticated/documents.tsx");
check(
  "delete UI: calls the server function",
  /removeDocument\(\{ data: \{ documentId: d\.id \} \}\)/.test(docsPage),
);
check(
  "delete UI: no direct storage.remove",
  !/storage\.from\("documents"\)\s*\n?\s*\.remove/m.test(docsPage),
);
check("delete UI: no direct row delete", !/from\("documents"\)\s*\n?\s*\.delete\(/m.test(docsPage));
check("delete UI: surfaces a controlled error", /onError:[\s\S]{0,120}تعذّر الحذف/.test(docsPage));

for (const rel of await Array.fromAsync(new Bun.Glob("src/**/*.{ts,tsx}").scan({ cwd: ROOT }))) {
  if (rel.endsWith("routeTree.gen.ts") || rel.includes("intake.server")) continue;
  const src = read(rel);
  const browserRemove =
    /(context\.supabase|\bsupabase)\.storage\s*\n?\s*\.from\(\s*"documents"\s*\)\s*\n?\s*\.remove/m.test(
      src,
    );
  const browserDelete =
    /(context\.supabase|\bsupabase)\s*\n?\s*\.from\(\s*"documents"\s*\)\s*\n?\s*\.delete/m.test(
      src,
    );
  check(
    `source: ${rel} has no browser/user-client document deletion`,
    !browserRemove && !browserDelete,
  );
}

// 4) الرفض الدفاعي في secure-view قبل أي رابط موقّع
const secure = read("src/lib/secure-view/secure-view.server.ts");
check(
  "secure-view: exports path assertion",
  secure.includes("export function assertOrgScopedStoragePath"),
);
check(
  "secure-view: guards loadDocumentForStamp",
  /assertOrgScopedStoragePath\(data\.file_path, data\.organization_id\)/.test(secure),
);
check(
  "secure-view: guard runs before createSignedUrl",
  secure.indexOf("if (options.organizationId) assertOrgScopedStoragePath") <
    secure.indexOf("createSignedUrl"),
);
check(
  "public doc route: passes organization scope",
  /organizationId: doc\.organization_id/.test(read("src/routes/api/public/doc.$token.ts")),
);

// 5) سلوك دالة الرفض الدفاعي (وحدة، بلا شبكة)
const org = "11111111-1111-1111-1111-111111111111";
const other = "22222222-2222-2222-2222-222222222222";
const rejected: [string, string][] = [
  ["empty path", ""],
  ["cross-org path", `${other}/a.pdf`],
  ["absolute path", `/${org}/a.pdf`],
  ["traversal", `${org}/../${other}/a.pdf`],
  ["double slash", `${org}//a.pdf`],
  ["unprefixed", "a.pdf"],
];
for (const [label, path] of rejected) {
  let threw = false;
  try {
    assertOrgScopedStoragePath(path, org);
  } catch {
    threw = true;
  }
  check(`guard rejects: ${label}`, threw);
}
check(
  "guard accepts owned path",
  assertOrgScopedStoragePath(`${org}/file.pdf`, org) === `${org}/file.pdf`,
);

// 6) أحدث تعريف للتريجر: لا تجاوز صلاحيات عبر current_user، والهوية من دور الطلب
const definingMigrations: string[] = [];
for await (const rel of new Bun.Glob("supabase/migrations/*.sql").scan({ cwd: ROOT })) {
  if (read(rel).includes("FUNCTION private.documents_enforce_integrity")) definingMigrations.push(rel);
}
definingMigrations.sort();
const latestTrigger = definingMigrations.length
  ? read(definingMigrations[definingMigrations.length - 1]!)
  : "";

check("trigger: latest definition found", latestTrigger.length > 0);
// نتجاهل تعليقات SQL حتى يبقى الفحص على الكود التنفيذي فقط
const latestTriggerCode = latestTrigger.replace(/--[^\n]*/g, "");
check(
  "trigger: no current_user privilege bypass",
  !/current_user/i.test(latestTriggerCode),
  "current_user يساوي مالك الدالة داخل SECURITY DEFINER",
);
check(
  "trigger: caller role derived from request jwt",
  /current_setting\(\s*'request\.jwt\.claim\.role'\s*,\s*true\s*\)/.test(latestTrigger) &&
    /current_setting\(\s*'request\.jwt\.claims'\s*,\s*true\s*\)/.test(latestTrigger),
);
check(
  "trigger: only service_role counts as trusted",
  /v_is_service_role\s*:=\s*v_request_role\s*=\s*'service_role'/.test(latestTrigger) &&
    /v_is_privileged\s*:=\s*v_is_service_role/.test(latestTrigger),
);
check(
  "trigger: authenticated/anon never privileged",
  !/v_request_role\s*(=|IN)\s*\(?\s*'(authenticated|anon)'/i.test(latestTrigger),
);
check(
  "trigger: admin fallback requires absent request context and session_user",
  /NOT v_has_request_context AND session_user IN \('postgres', 'supabase_admin'\)/.test(
    latestTrigger,
  ),
);
check(
  "trigger: storage fields immutable for non-privileged callers",
  /TG_OP = 'UPDATE' AND NOT v_is_privileged/.test(latestTrigger) &&
    ["file_path", "file_type", "file_size", "storage_verified_at", "organization_id"].every((col) =>
      new RegExp(`NEW\\.${col} IS DISTINCT FROM OLD\\.${col}`).test(latestTrigger),
    ),
);
check(
  "trigger: security definer with fixed search_path",
  /SECURITY DEFINER/.test(latestTrigger) &&
    /SET search_path = private, public, pg_temp/.test(latestTrigger),
);
check(
  "trigger: idempotent redefinition",
  /CREATE OR REPLACE FUNCTION private\.documents_enforce_integrity/.test(latestTrigger) &&
    /DROP TRIGGER IF EXISTS documents_enforce_integrity/.test(latestTrigger),
);

console.log(`\nPASS = ${pass} / FAIL = ${fail}`);
if (fail > 0) process.exit(1);
