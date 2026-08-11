/**
 * حرّاس سلامة ترابط طلبات رفع المستندات — تشغيل ثابت بلا قاعدة بيانات وبلا شبكة.
 *
 *   bun scripts/document-requests-integrity-guardrails.ts
 *
 * يثبت أن الحماية موجودة في ثلاث طبقات: تحقق خادمي صريح قبل الكتابة،
 * تريجر دفاعي في قاعدة التشغيل، ورفض دفاعي في مسار البوابة العامة.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

let pass = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    pass += 1;
    console.log(`PASS — ${name}`);
  } else {
    failures.push(`${name}${detail ? ` :: ${detail}` : ""}`);
    console.log(`FAIL — ${name}${detail ? ` :: ${detail}` : ""}`);
  }
}

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/* ------------------------------ طبقة الخادم ------------------------------ */

const serverGuard = read("src/lib/document-requests.server.ts");
check(
  "دالة التحقق الخادمية موجودة ومصدّرة",
  /export async function assertCaseBelongsToOrganization/.test(serverGuard),
);
check(
  "التحقق يقارن organization_id للقضية بمكتب الطلب",
  /data\.organization_id !== organizationId/.test(serverGuard),
);
check(
  "الفشل يرفع خطأ عربياً ولا يمرر بصمت",
  /throw new Error\("القضية غير موجودة أو لا تنتمي إلى هذا المكتب\."\)/.test(serverGuard),
);

const createFn = read("src/lib/document-requests.functions.ts");
const insertIdx = createFn.indexOf('.from("document_requests")');
const assertIdx = createFn.indexOf("assertCaseBelongsToOrganization(");
check("دالة الإنشاء تستدعي التحقق الخادمي", assertIdx > 0);
check("التحقق يسبق أي كتابة على document_requests", assertIdx > 0 && assertIdx < insertIdx);
check(
  "الإدراج يستخدم مكتب القضية المتحققة لا مدخلاً من العميل",
  /organization_id: kase\.organization_id/.test(createFn) && /case_id: kase\.id/.test(createFn),
);

/* ------------------------------ طبقة القاعدة ----------------------------- */

const migrationsDir = join(process.cwd(), "supabase/migrations");
const migrations = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(join(migrationsDir, f), "utf8"));
const guardSql = migrations.find((sql) =>
  sql.includes("private.document_requests_enforce_case_org"),
);
check("توجد migration تنشئ دالة التريجر الدفاعية", !!guardSql);
if (guardSql) {
  check(
    "التريجر يعمل قبل الإدراج والتعديل على الجدول",
    /BEFORE INSERT OR UPDATE ON public\.document_requests/i.test(guardSql) &&
      /EXECUTE FUNCTION private\.document_requests_enforce_case_org\(\)/i.test(guardSql),
  );
  check(
    "التريجر يرفض قضية غير موجودة أو تابعة لمكتب مختلف",
    /NEW\.case_id IS NULL OR NOT EXISTS/.test(guardSql) &&
      /c\.organization_id = NEW\.organization_id/.test(guardSql),
  );
  check(
    "التريجر يرفض الطلب بدون مكتب",
    /NEW\.organization_id IS NULL/.test(guardSql) && /RAISE EXCEPTION/.test(guardSql),
  );
  check(
    "التريجر لا يحتوي أي UUID ثابت",
    !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(guardSql),
  );
  check(
    "التريجر يعمل بأمان SECURITY DEFINER مع search_path مثبّت",
    /SECURITY DEFINER/.test(guardSql) &&
      /SET search_path = private, public, pg_temp/.test(guardSql),
  );
}

/* ---------------------------- طبقة البوابة العامة ---------------------------- */

const portal = read("src/lib/client-portal.server.ts");
check(
  "تحميل الطلب بالتوكن يقرأ مكتب القضية المرتبطة",
  /case:cases\(client_id, organization_id\)/.test(portal),
);
check(
  "رابط مرتبط بقضية من مكتب مختلف يُعتبر غير صالح",
  /linked\.case\.organization_id !== linked\.organization_id\) return null/.test(portal),
);
check(
  "العميل يُستمد من القضية المتحققة فقط",
  /clientId: \(request as DocumentRequestWithRelations\)\.case\?\.client_id \?\? null/.test(portal),
);

const portalFns = read("src/lib/client-portal.functions.ts");
check(
  "مسار الرفع يبني مسار التخزين من مكتب الطلب ومعرّفه فقط",
  /const prefix = `\$\{req\.organization_id\}\/client-uploads\/\$\{req\.id\}\/`/.test(portalFns),
);
check(
  "سجل المستند يستمد المكتب والقضية والعميل من الطلب المتحقق",
  /organization_id: req\.organization_id/.test(portalFns) &&
    /case_id: req\.case_id/.test(portalFns) &&
    /client_id: found\.clientId/.test(portalFns),
);

console.log(
  `\n${failures.length === 0 ? "OK" : "FAILED"} — PASS = ${pass} / FAIL = ${failures.length}`,
);
if (failures.length > 0) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
