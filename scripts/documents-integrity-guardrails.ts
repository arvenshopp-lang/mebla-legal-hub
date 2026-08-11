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
for await (const rel of migrations.scan({ cwd: ROOT })) {
  const sql = read(rel);
  if (sql.includes("documents_enforce_integrity")) hardening += `\n${sql}`;
}
check("migration: documents hardening present", hardening.length > 0);
check("migration: drops browser INSERT policy", /DROP POLICY IF EXISTS\s+docs_insert/i.test(hardening));
check("migration: revokes INSERT from authenticated", /REVOKE INSERT ON public\.documents FROM authenticated/i.test(hardening));
check("migration: enforces org-prefixed file_path", /organization_id::text \|\| '\/'/.test(hardening));
check("migration: validates case ownership", /public\.cases[\s\S]{0,200}organization_id = NEW\.organization_id/.test(hardening));
check("migration: validates client ownership", /public\.clients[\s\S]{0,200}organization_id = NEW\.organization_id/.test(hardening));
for (const col of ["file_path", "file_type", "file_size", "storage_verified_at", "organization_id"]) {
  check(
    `migration: ${col} immutable for authenticated`,
    new RegExp(`NEW\\.${col} IS DISTINCT FROM OLD\\.${col}`).test(hardening),
  );
}
check("migration: unique file_path index", /CREATE UNIQUE INDEX IF NOT EXISTS documents_file_path_unique/i.test(hardening));
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
    /(context\.supabase|\bsupabase)\s*\n?\s*\.from\(\s*"documents"\s*\)\s*\n?\s*\.insert/m.test(src);
  check(`source: ${rel} has no browser/user-client document insert`, !userClientInsert);
}

// 3) مسار الإنهاء: الدور ثم التحقق ثم الإدراج بمفتاح الخدمة
const finalize = read("src/lib/documents/intake.functions.ts");
check("finalize: requires write role", finalize.includes("requireDocumentWriteRole"));
check("finalize: verifies uploaded bytes", finalize.includes("verifyUploadedObject"));
check("finalize: blocks cross-org links", finalize.includes("assertCaseAndClientInOrg"));
check("finalize: blocks path replay", finalize.includes("assertPathNotLinked"));
check("finalize: inserts with service admin", /supabaseAdmin\s*\n?\s*\.from\("documents"\)\s*\n?\s*\.insert/m.test(finalize));
check(
  "finalize: role check precedes insert",
  finalize.indexOf("requireDocumentWriteRole(") < finalize.indexOf('.from("documents")'),
);

// 4) الرفض الدفاعي في secure-view قبل أي رابط موقّع
const secure = read("src/lib/secure-view/secure-view.server.ts");
check("secure-view: exports path assertion", secure.includes("export function assertOrgScopedStoragePath"));
check("secure-view: guards loadDocumentForStamp", /assertOrgScopedStoragePath\(data\.file_path, data\.organization_id\)/.test(secure));
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
check("guard accepts owned path", assertOrgScopedStoragePath(`${org}/file.pdf`, org) === `${org}/file.pdf`);

console.log(`\nPASS = ${pass} / FAIL = ${fail}`);
if (fail > 0) process.exit(1);
