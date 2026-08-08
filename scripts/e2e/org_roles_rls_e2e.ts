/**
 * اختبار فعلي لفرض أدوار المكتب على الخادم (RLS عبر Data API).
 * كل حالة تُنفَّذ بتوكن المستخدم نفسه، فالنتيجة دليل على السلوك الخادمي لا على الواجهة.
 *
 * التشغيل: bun scripts/e2e/org_roles_rls_e2e.ts   (بعد bun scripts/e2e/org-qa-fixture.ts)
 */
import { asUser, loadQaOrg, SUPABASE_URL, adminFetch, type OrgRole } from "./qa-support";

type Case = { name: string; pass: boolean; detail: string };
const results: Case[] = [];

function record(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${pass ? "" : ` :: ${detail}`}`);
}

const qa = await loadQaOrg();
const org = qa.organizationId;
const tok = (role: OrgRole | "outsider") => qa.accounts.find((a) => a.role === role)!.token;
const uid = (role: OrgRole | "outsider") => qa.accounts.find((a) => a.role === role)!.userId;

const WRITERS: (OrgRole | "outsider")[] = ["owner", "admin", "lawyer", "legal_assistant"];
const NON_WRITERS: (OrgRole | "outsider")[] = ["viewer", "outsider"];

/** بيان أساسي للقراءة يُنشأ بمفتاح الخدمة (تجهيز، لا اختبار). */
const seedRes = await adminFetch(`${SUPABASE_URL}/rest/v1/clients`, {
  method: "POST",
  headers: { Prefer: "return=representation" },
  body: JSON.stringify({ organization_id: org, full_name: "QA عميل القراءة" }),
});
const seedClient = ((await seedRes.json()) as { id: string }[])[0];
if (!seedClient) throw new Error("تعذّر تجهيز عميل القراءة");

// 1) القراءة: كل أعضاء المكتب يقرأون، والخارجي لا يقرأ شيئاً.
for (const role of ["owner", "admin", "lawyer", "legal_assistant", "viewer"] as OrgRole[]) {
  const r = await asUser(tok(role), `/rest/v1/clients?organization_id=eq.${org}&select=id`);
  const rows = Array.isArray(r.body) ? (r.body as unknown[]).length : -1;
  record(`قراءة العملاء — ${role}`, r.status === 200 && rows >= 1, `status=${r.status} rows=${rows}`);
}
{
  const r = await asUser(tok("outsider"), `/rest/v1/clients?organization_id=eq.${org}&select=id`);
  const rows = Array.isArray(r.body) ? (r.body as unknown[]).length : -1;
  record("عزل المستأجرين — مستخدم من خارج المكتب لا يقرأ أي صف", rows === 0, `rows=${rows}`);
}

// 2) الكتابة: الأدوار المصرَّح لها تنشئ، وviewer/الخارجي يُمنعان.
const createdCaseIds: string[] = [];
for (const role of WRITERS) {
  const r = await asUser(tok(role), `/rest/v1/cases`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      organization_id: org,
      case_title: `QA قضية ${role}`,
      client_id: seedClient.id,
      created_by: uid(role),
    }),
  });
  const ok = r.status === 201;
  if (ok) createdCaseIds.push((r.body as { id: string }[])[0].id);
  record(`إنشاء قضية — ${role} مصرَّح`, ok, `status=${r.status} ${JSON.stringify(r.body)}`);
}
for (const role of NON_WRITERS) {
  const r = await asUser(tok(role), `/rest/v1/cases`, {
    method: "POST",
    body: JSON.stringify({ organization_id: org, case_title: `QA منع ${role}` }),
  });
  record(`منع إنشاء قضية — ${role}`, r.status === 401 || r.status === 403, `status=${r.status}`);
}

const caseId = createdCaseIds[0]!;

// 3) التعديل والحذف.
{
  const r = await asUser(tok("viewer"), `/rest/v1/cases?id=eq.${caseId}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ case_title: "QA محاولة تعديل من viewer" }),
  });
  const changed = Array.isArray(r.body) && (r.body as unknown[]).length > 0;
  record("منع تعديل قضية — viewer", !changed, `status=${r.status} changed=${changed}`);
}
{
  const r = await asUser(tok("lawyer"), `/rest/v1/cases?id=eq.${caseId}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ case_title: "QA قضية بعد تعديل المحامي" }),
  });
  record(
    "تعديل قضية — lawyer مصرَّح",
    r.status === 200 && Array.isArray(r.body) && (r.body as unknown[]).length === 1,
    `status=${r.status}`,
  );
}
{
  const r = await asUser(tok("outsider"), `/rest/v1/cases?id=eq.${caseId}`, {
    method: "DELETE",
    headers: { Prefer: "return=representation" },
  });
  const deleted = Array.isArray(r.body) && (r.body as unknown[]).length > 0;
  record("منع حذف قضية — مستخدم من مكتب آخر", !deleted, `status=${r.status}`);
}

// 4) الجلسات والمهل والمهام: viewer يُمنع، lawyer يُصرَّح.
const childWrites: { table: string; body: Record<string, unknown> }[] = [
  {
    table: "hearings",
    body: { organization_id: org, case_id: caseId, hearing_date: new Date().toISOString() },
  },
  {
    table: "deadlines",
    body: {
      organization_id: org,
      case_id: caseId,
      title: "QA مهلة",
      due_date: new Date(Date.now() + 604800000).toISOString().slice(0, 10),
    },
  },
  { table: "tasks", body: { organization_id: org, case_id: caseId, title: "QA مهمة" } },
];
for (const w of childWrites) {
  const allow = await asUser(tok("lawyer"), `/rest/v1/${w.table}`, {
    method: "POST",
    body: JSON.stringify({ ...w.body, created_by: uid("lawyer") }),
  });
  record(`إنشاء ${w.table} — lawyer مصرَّح`, allow.status === 201, `status=${allow.status} ${JSON.stringify(allow.body)}`);
  const deny = await asUser(tok("viewer"), `/rest/v1/${w.table}`, {
    method: "POST",
    body: JSON.stringify({ ...w.body, created_by: uid("viewer") }),
  });
  record(`منع إنشاء ${w.table} — viewer`, deny.status === 401 || deny.status === 403, `status=${deny.status}`);
}

// 5) منع تصعيد الصلاحية: عضو يرفع دور نفسه إلى owner.
for (const role of ["lawyer", "viewer", "legal_assistant"] as OrgRole[]) {
  const r = await asUser(
    tok(role),
    `/rest/v1/organization_members?organization_id=eq.${org}&user_id=eq.${uid(role)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ role: "owner" }),
    },
  );
  const escalated = Array.isArray(r.body) && (r.body as unknown[]).length > 0;
  record(`منع تصعيد الصلاحية — ${role} → owner`, !escalated, `status=${r.status} rows=${JSON.stringify(r.body)}`);
}

// 6) عضو موقوف (suspended) لا يقرأ ولا يكتب.
await adminFetch(
  `${SUPABASE_URL}/rest/v1/organization_members?organization_id=eq.${org}&user_id=eq.${uid("legal_assistant")}`,
  { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "suspended" }) },
);
{
  const read = await asUser(
    tok("legal_assistant"),
    `/rest/v1/clients?organization_id=eq.${org}&select=id`,
  );
  const rows = Array.isArray(read.body) ? (read.body as unknown[]).length : -1;
  record("عضو موقوف لا يقرأ بيانات المكتب", rows === 0, `rows=${rows}`);
  const write = await asUser(tok("legal_assistant"), `/rest/v1/cases`, {
    method: "POST",
    body: JSON.stringify({ organization_id: org, case_title: "QA موقوف" }),
  });
  record(
    "عضو موقوف لا يكتب في المكتب",
    write.status === 401 || write.status === 403,
    `status=${write.status}`,
  );
}
await adminFetch(
  `${SUPABASE_URL}/rest/v1/organization_members?organization_id=eq.${org}&user_id=eq.${uid("legal_assistant")}`,
  { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "active" }) },
);

const failed = results.filter((r) => !r.pass);
console.log(`\nالنتيجة: ${results.length - failed.length}/${results.length} PASS`);
if (failed.length > 0) {
  console.log("الحالات الفاشلة:");
  for (const f of failed) console.log(` - ${f.name} :: ${f.detail}`);
  process.exit(1);
}
