/**
 * PLAN 2 — إثبات خادمي لـ RBAC وRLS وعزل المستأجرين وبوابة العميل.
 *
 * كل حالة تُنفَّذ بتوكن المستخدم الحقيقي إمّا عبر Data API (RLS) أو عبر دوال
 * الخادم بالبروتوكول نفسه الذي يستخدمه المتصفح، فالنتيجة دليل على الخادم لا الواجهة.
 *
 *   bun scripts/e2e/plan2-fixture.ts && bun scripts/e2e/plan2_rbac_tenant.e2e.ts
 */
import { asUser, adminFetch, signIn, SUPABASE_URL, PUBLISHABLE, APP } from "./qa-support";
import { loadP2, P2_ROLES, type P2Role, type OrgKey } from "./plan2-fixture";
import { resolveServerFns, callServerFn, type ServerFnRef } from "./serverfn-rpc";

type Source = "RLS" | "Server Guard" | "Entitlement" | "UI" | "Token" | "Other";
type Row = { group: string; name: string; pass: boolean; source: Source; detail: string };
const rows: Row[] = [];
function record(group: string, name: string, pass: boolean, source: Source, detail = "") {
  rows.push({ group, name, pass, source, detail });
  console.log(`${pass ? "PASS" : "FAIL"} [${group}] ${name}${pass ? "" : ` :: ${detail}`}`);
}

const qa = await loadP2();
const A = qa.orgs.A;
const B = qa.orgs.B;
const tok = (org: OrgKey, role: P2Role) =>
  qa.accounts.find((a) => a.org === org && a.role === role)!.token;
const uid = (org: OrgKey, role: P2Role) =>
  qa.accounts.find((a) => a.org === org && a.role === role)!.userId;

const WRITERS: P2Role[] = ["owner", "admin", "lawyer", "legal_assistant"];
const ADMINS: P2Role[] = ["owner", "admin"];
const rowsOf = (b: unknown) => (Array.isArray(b) ? (b as unknown[]).length : -1);
/** رفض فعلي على مستوى القاعدة: إما 401/403 أو صفر صفوف مُعادة. */
const deniedRest = (r: { status: number; body: unknown }) =>
  r.status === 401 || r.status === 403 || rowsOf(r.body) === 0;
/** استخراج قيمة state من إطار seroval الذي تعيده دوال الخادم. */
const stateOf = (raw: string) =>
  raw.match(/"state"\][\s\S]{0,40}?"s":"([a-z_]+)"/)?.[1] ??
  raw.match(/"state":"([a-z_]+)"/)?.[1] ??
  "";
/** تصفير سجل محاولات الروابط العامة بين المراحل (عزل بيئة الاختبار فقط). */
async function resetPublicAttempts() {
  await adminFetch(`${SUPABASE_URL}/rest/v1/case_lookup_attempts?id=not.is.null`, {
    method: "DELETE",
  });
}

async function fns(modulePath: string): Promise<Record<string, ServerFnRef>> {
  return resolveServerFns(APP, modulePath);
}
const call = (ref: ServerFnRef, token: string | undefined, data?: unknown) =>
  callServerFn({ appOrigin: APP, ref, token, data });

/* ═══════════════ 1) القراءة المسموحة لكل دور ═══════════════ */
for (const role of P2_ROLES) {
  for (const table of ["clients", "cases", "hearings", "deadlines", "tasks", "documents"]) {
    const r = await asUser(
      tok("A", role),
      `/rest/v1/${table}?organization_id=eq.${A.organizationId}&select=id`,
    );
    record("ROLES/READ", `${role} يقرأ ${table}`, r.status === 200 && rowsOf(r.body) >= 1, "RLS",
      `status=${r.status} rows=${rowsOf(r.body)}`);
  }
}

/* ═══════════════ 2) الكتابة المسموحة والممنوعة ═══════════════ */
const created: Record<P2Role, string | null> = {
  owner: null, admin: null, lawyer: null, legal_assistant: null, viewer: null,
};
for (const role of WRITERS) {
  const r = await asUser(tok("A", role), `/rest/v1/clients`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      organization_id: A.organizationId,
      full_name: `QA-PLAN2 عميل ${role}`,
      created_by: uid("A", role),
    }),
  });
  created[role] = r.status === 201 ? (r.body as { id: string }[])[0]!.id : null;
  record("ROLES/WRITE", `${role} ينشئ عميلاً`, r.status === 201, "RLS", `status=${r.status}`);
}
{
  const r = await asUser(tok("A", "viewer"), `/rest/v1/clients`, {
    method: "POST",
    body: JSON.stringify({ organization_id: A.organizationId, full_name: "QA-PLAN2 منع viewer" }),
  });
  record("ROLES/DENY", "viewer ممنوع من إنشاء عميل", r.status === 401 || r.status === 403, "RLS",
    `status=${r.status}`);
}
const viewerDenyPayloads: [string, Record<string, unknown>][] = [
  ["cases", { organization_id: A.organizationId, client_id: A.clientIds[0], case_title: "QA-PLAN2 منع" }],
  ["hearings", { organization_id: A.organizationId, case_id: A.caseIds[0], hearing_date: new Date().toISOString() }],
  ["deadlines", { organization_id: A.organizationId, case_id: A.caseIds[0], title: "QA-PLAN2 منع", due_date: "2030-01-01" }],
  ["tasks", { organization_id: A.organizationId, case_id: A.caseIds[0], title: "QA-PLAN2 منع" }],
  ["documents", { organization_id: A.organizationId, case_id: A.caseIds[0], file_name: "x.pdf", file_path: `${A.organizationId}/x.pdf` }],
];
for (const [t, payload] of viewerDenyPayloads) {
  const r = await asUser(tok("A", "viewer"), `/rest/v1/${t}`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload),
  });
  record("ROLES/DENY", `viewer ممنوع من إنشاء ${t}`, r.status === 401 || r.status === 403, "RLS",
    `status=${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
}
{
  const r = await asUser(tok("A", "lawyer"), `/rest/v1/cases?id=eq.${A.caseIds[0]}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ status: "in_progress" }),
  });
  record("ROLES/WRITE", "lawyer يعدّل قضية", r.status === 200 && rowsOf(r.body) === 1, "RLS",
    `status=${r.status}`);
  const v = await asUser(tok("A", "viewer"), `/rest/v1/cases?id=eq.${A.caseIds[0]}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ case_title: "QA-PLAN2 محاولة viewer" }),
  });
  record("ROLES/DENY", "viewer ممنوع من تعديل قضية", rowsOf(v.body) <= 0, "RLS", `status=${v.status}`);
}

/* ═══════════════ 3) الفريق والإعدادات والاشتراك (إداري فقط) ═══════════════ */
for (const role of P2_ROLES) {
  const allowed = ADMINS.includes(role);
  const inv = await asUser(tok("A", role), `/rest/v1/organization_invitations`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      organization_id: A.organizationId,
      email: `qa.plan2.direct.${role}@mehlaqa.test`,
      role: "viewer",
      token: crypto.randomUUID().replace(/-/g, ""),
      invited_by: uid("A", role),
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    }),
  });
  const ok = allowed ? inv.status === 201 : inv.status === 401 || inv.status === 403;
  record("TEAM", `${role} ${allowed ? "يُنشئ" : "ممنوع من إنشاء"} دعوة (Data API)`, ok, "RLS",
    `status=${inv.status}`);

  const org = await asUser(tok("A", role), `/rest/v1/organizations?id=eq.${A.organizationId}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ city: `الرياض-${role}` }),
  });
  const orgOk = allowed ? rowsOf(org.body) === 1 : rowsOf(org.body) <= 0;
  record("SETTINGS", `${role} ${allowed ? "يعدّل" : "ممنوع من تعديل"} بيانات المكتب`, orgOk, "RLS",
    `status=${org.status} rows=${rowsOf(org.body)}`);

  const subRead = await asUser(
    tok("A", role),
    `/rest/v1/subscriptions?organization_id=eq.${A.organizationId}&select=id,plan_code`,
  );
  record("BILLING", `${role} يقرأ اشتراك مكتبه`, subRead.status === 200 && rowsOf(subRead.body) >= 1,
    "RLS", `status=${subRead.status}`);
  const subWrite = await asUser(
    tok("A", role),
    `/rest/v1/subscriptions?organization_id=eq.${A.organizationId}`,
    { method: "PATCH", headers: { Prefer: "return=representation" },
      body: JSON.stringify({ plan_code: "enterprise" }) },
  );
  record("BILLING", `${role} ممنوع من تعديل الاشتراك`, rowsOf(subWrite.body) <= 0, "RLS",
    `status=${subWrite.status}`);
}

/* ═══════════════ 4) دوال الخادم — مسموح/ممنوع بنفس الجلسة ═══════════════ */
const invFns = await fns("src/lib/invitations.functions.ts");
const docReqFns = await fns("src/lib/document-requests.functions.ts");
const portalFns = await fns("src/lib/client-portal.functions.ts");
const piiFns = await fns("src/lib/pii.functions.ts");
const secureFns = await fns("src/lib/secure-view/secure-view.functions.ts");
const adminOpsFns = await fns("src/lib/admin-ops.functions.ts");
const partyFns = await fns("src/lib/case-parties.functions.ts");

for (const role of P2_ROLES) {
  const res = await call(invFns["inviteTeamMember"]!, tok("A", role), {
    organizationId: A.organizationId,
    email: `qa.plan2.fn.${role}@mehlaqa.test`,
    role: "viewer",
    origin: APP,
  });
  const allowed = ADMINS.includes(role);
  record("SERVERFN/TEAM", `${role} ${allowed ? "يدعو" : "ممنوع من دعوة"} عضواً (inviteTeamMember)`,
    allowed ? res.ok : res.denied, "Server Guard", `status=${res.status} ${res.message}`);
}
for (const role of P2_ROLES) {
  const res = await call(docReqFns["createDocumentRequest"]!, tok("A", role), {
    caseId: A.caseIds[0],
    title: `QA-PLAN2 رابط ${role}`,
    items: ["هوية"],
  });
  const allowed = WRITERS.includes(role);
  record("SERVERFN/DOCREQ", `${role} ${allowed ? "ينشئ" : "ممنوع من إنشاء"} رابط رفع`,
    allowed ? res.ok : res.denied, allowed ? "Server Guard" : "RLS",
    `status=${res.status} ${res.message}`);
}
{
  const res = await call(secureFns["requestDocumentAccess"]!, tok("A", "viewer"), {
    organizationId: A.organizationId,
    documentId: A.documentId,
    kind: "download",
  });
  record("SERVERFN/DOCS", "viewer ممنوع من تنزيل مستند", res.denied, "Server Guard",
    `status=${res.status} ${res.message}`);
  const own = await call(secureFns["requestDocumentAccess"]!, tok("A", "owner"), {
    organizationId: A.organizationId,
    documentId: A.documentId,
    kind: "view",
  });
  record("SERVERFN/DOCS", "owner يفتح عرضاً آمناً لمستند مكتبه", own.ok, "Server Guard",
    `status=${own.status} ${own.message}`);
}
for (const role of ["lawyer", "viewer"] as P2Role[]) {
  const res = await call(partyFns["grantCasePartyPermission"]!, tok("A", role), {
    organizationId: A.organizationId,
    userId: uid("A", "viewer"),
    permission: "case_parties.read",
  });
  record("SERVERFN/PARTIES", `${role} ممنوع من منح صلاحية أطراف القضية`, res.denied,
    "Server Guard", `status=${res.status} ${res.message}`);
}
for (const role of P2_ROLES) {
  const res = await call(adminOpsFns["listAuditLogs"]!, tok("A", role), { page: 1 });
  record("SERVERFN/ADMIN", `${role} من المكتب ممنوع من سجل تدقيق المنصة`, res.denied,
    "Server Guard", `status=${res.status} ${res.message}`);
  const exp = await call(adminOpsFns["exportAuditLogs"]!, tok("A", role), { scope: "all" });
  record("SERVERFN/ADMIN", `${role} من المكتب ممنوع من تصدير سجل التدقيق`, exp.denied,
    "Server Guard", `status=${exp.status} ${exp.message}`);
}
{
  const anon = await call(adminOpsFns["listAuditLogs"]!, undefined, { page: 1 });
  record("SERVERFN/ADMIN", "طلب بلا جلسة مرفوض (401)", anon.denied, "Server Guard",
    `status=${anon.status}`);
}

/* ═══════════════ 5) عزل المستأجرين — قراءة/تعديل/حذف عبر المكاتب ═══════════════ */
const crossReads: [string, string][] = [
  ["clients", B.clientIds[0]!],
  ["cases", B.caseIds[0]!],
  ["hearings", B.hearingId],
  ["deadlines", B.deadlineId],
  ["tasks", B.taskId],
  ["documents", B.documentId],
  ["support_tickets", B.ticketId],
];
for (const [table, id] of crossReads) {
  const r = await asUser(tok("A", "owner"), `/rest/v1/${table}?id=eq.${id}&select=id`);
  record("TENANT/READ", `A لا يقرأ ${table} من B`, rowsOf(r.body) === 0, "RLS",
    `status=${r.status} rows=${rowsOf(r.body)}`);
}
for (const t of ["organization_members", "subscriptions", "invoices", "document_requests"]) {
  const r = await asUser(tok("A", "owner"), `/rest/v1/${t}?organization_id=eq.${B.organizationId}&select=id`);
  record("TENANT/READ", `A لا يقرأ ${t} من B`, rowsOf(r.body) === 0, "RLS",
    `status=${r.status} rows=${rowsOf(r.body)}`);
}
{
  const r = await asUser(tok("A", "owner"), `/rest/v1/organizations?id=eq.${B.organizationId}&select=id,name`);
  record("TENANT/READ", "A لا يقرأ بيانات مكتب B", rowsOf(r.body) === 0, "RLS", `rows=${rowsOf(r.body)}`);
}
for (const [table, id] of crossReads) {
  const u = await asUser(tok("A", "owner"), `/rest/v1/${table}?id=eq.${id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(table === "cases" ? { case_title: "TAMPER" } : { updated_at: new Date().toISOString() }),
  });
  record("TENANT/WRITE", `A لا يعدّل ${table} من B`, rowsOf(u.body) <= 0, "RLS", `status=${u.status}`);
  const d = await asUser(tok("A", "owner"), `/rest/v1/${table}?id=eq.${id}`, {
    method: "DELETE",
    headers: { Prefer: "return=representation" },
  });
  record("TENANT/WRITE", `A لا يحذف ${table} من B`, rowsOf(d.body) <= 0, "RLS", `status=${d.status}`);
}
{
  // تلاعب بالحمولة: كتابة صف داخل مكتب B بتوكن مالك A.
  const r = await asUser(tok("A", "owner"), `/rest/v1/clients`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ organization_id: B.organizationId, full_name: "QA-PLAN2 حقن" }),
  });
  record("TENANT/WRITE", "تلاعب organization_id في الحمولة مرفوض",
    r.status === 401 || r.status === 403, "RLS", `status=${r.status}`);
}
{
  const res = await call(docReqFns["createDocumentRequest"]!, tok("A", "owner"), {
    caseId: B.caseIds[0],
    title: "QA-PLAN2 رابط عابر",
    items: [],
  });
  record("TENANT/SERVERFN", "A لا ينشئ رابط رفع على قضية B", res.denied, "Server Guard",
    `status=${res.status} ${res.message}`);
  const doc = await call(secureFns["requestDocumentAccess"]!, tok("A", "owner"), {
    organizationId: B.organizationId,
    documentId: B.documentId,
    kind: "view",
  });
  record("TENANT/SERVERFN", "A لا يفتح مستند B", doc.denied, "Server Guard",
    `status=${doc.status} ${doc.message}`);
  const docSpoof = await call(secureFns["requestDocumentAccess"]!, tok("A", "owner"), {
    organizationId: A.organizationId,
    documentId: B.documentId,
    kind: "view",
  });
  record("TENANT/SERVERFN", "A لا يفتح مستند B بانتحال معرّف مكتبه", docSpoof.denied,
    "Server Guard", `status=${docSpoof.status} ${docSpoof.message}`);
  const pii = await call(piiFns["revealPii"]!, tok("A", "owner"), {
    organizationId: B.organizationId,
    entity: "client",
    entityId: B.clientIds[0],
    field: "national_id",
    reason: "اختبار عزل المستأجرين",
  });
  record("TENANT/SERVERFN", "A لا يكشف بيانات حساسة من B", pii.denied, "Server Guard",
    `status=${pii.status} ${pii.message}`);
  const sup = await call(
    (await fns("src/lib/support/support.functions.ts"))["getSupportTicket"]!,
    tok("A", "owner"),
    { ticketId: B.ticketId },
  );
  record("SUPPORT/TENANT", "A لا يفتح تذكرة دعم من B", sup.denied, "Server Guard",
    `status=${sup.status} ${sup.message}`);
}
for (const t of ["support_ticket_messages", "support_ticket_events", "support_internal_notes"]) {
  const r = await asUser(tok("A", "owner"), `/rest/v1/${t}?ticket_id=eq.${B.ticketId}&select=id`);
  record("SUPPORT/TENANT", `A لا يقرأ ${t} لتذكرة B`, deniedRest(r), "RLS",
    `status=${r.status} rows=${rowsOf(r.body)}`);
}

/* ═══════════════ 6) الدعوات — دورة حياة كاملة ═══════════════ */
{
  const inviteEmail = `qa.plan2.join.${Date.now()}@mehlaqa.test`;
  const res = await call(invFns["inviteTeamMember"]!, tok("A", "admin"), {
    organizationId: A.organizationId,
    email: inviteEmail,
    role: "lawyer",
    origin: APP,
  });
  record("INVITES", "إنشاء دعوة بدور محامٍ", res.ok, "Server Guard", `${res.status} ${res.message}`);

  const readInvite = async () => {
    const r = await adminFetch(
      `${SUPABASE_URL}/rest/v1/organization_invitations?email=eq.${encodeURIComponent(inviteEmail)}&status=eq.pending&select=id,token,role,status,expires_at`,
    );
    return ((await r.json()) as { id: string; token: string; role: string; status: string }[])[0];
  };
  const firstInvite = await readInvite();
  record("INVITES", "الدعوة محفوظة في القاعدة بحالة pending",
    !!firstInvite && firstInvite.status === "pending" && firstInvite.role === "lawyer", "Other",
    JSON.stringify(firstInvite ?? {}));

  const dup = await call(invFns["inviteTeamMember"]!, tok("A", "admin"), {
    organizationId: A.organizationId, email: inviteEmail, role: "lawyer", origin: APP,
  });
  const dupRows = await adminFetch(
    `${SUPABASE_URL}/rest/v1/organization_invitations?email=eq.${encodeURIComponent(inviteEmail)}&status=eq.pending&select=id`,
  );
  const dupCount = ((await dupRows.json()) as unknown[]).length;
  record("INVITES", "إعادة الدعوة لا تُنشئ دعوة مكررة", dupCount === 1, "Server Guard",
    `count=${dupCount} status=${dup.status}`);

  // الدعوة السارية بعد إعادة الإرسال هي المرجع (الأولى تُبطَل).
  const invite = await readInvite();
  const staleJoinToken = firstInvite!.token;

  // معاينة عامة لا تكشف البريد كاملاً.
  const preview = await call(invFns["getInvitation"]!, undefined, { token: invite!.token });
  record("INVITES", "المعاينة العامة لا تكشف البريد كاملاً",
    preview.ok && !preview.raw.includes(inviteEmail), "Server Guard", `status=${preview.status}`);

  // قبول الدعوة بحساب جديد.
  const password = `Qa!${crypto.randomUUID()}`;
  const createUser = await adminFetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    body: JSON.stringify({ email: inviteEmail, password, email_confirm: true }),
  });
  const newUser = (await createUser.json()) as { id: string };
  const newToken = await signIn(inviteEmail, password);
  const stale = await call(invFns["joinOrganization"]!, newToken, { token: staleJoinToken });
  record("INVITES", "توكن الدعوة المُبطَلة بعد إعادة الإرسال مرفوض",
    stale.denied || stateOf(stale.raw) !== "joined", "Token",
    `${stale.status} state=${stateOf(stale.raw)}`);

  const join = await call(invFns["joinOrganization"]!, newToken, { token: invite!.token });
  record("INVITES", "قبول الدعوة ينشئ عضوية فعلية",
    join.ok && stateOf(join.raw) === "joined", "Server Guard",
    `${join.status} state=${stateOf(join.raw)} ${join.message}`);
  const memRes = await adminFetch(
    `${SUPABASE_URL}/rest/v1/organization_members?user_id=eq.${newUser.id}&select=role,status,organization_id`,
  );
  const mem = ((await memRes.json()) as { role: string; status: string; organization_id: string }[])[0];
  record("INVITES", "العضوية بالدور والحالة الصحيحين",
    mem?.role === "lawyer" && mem.status === "active" && mem.organization_id === A.organizationId,
    "Other", JSON.stringify(mem ?? {}));

  const reuse = await call(invFns["joinOrganization"]!, newToken, { token: invite!.token });
  record("INVITES", "إعادة استخدام توكن الدعوة لا تمنح عضوية جديدة",
    reuse.denied || stateOf(reuse.raw) !== "joined", "Token",
    `${reuse.status} state=${stateOf(reuse.raw)}`);

  // توكن منتهٍ + توكن غير صالح.
  const expEmail = `qa.plan2.exp.${Date.now()}@mehlaqa.test`;
  const expToken = crypto.randomUUID().replace(/-/g, "");
  await adminFetch(`${SUPABASE_URL}/rest/v1/organization_invitations`, {
    method: "POST",
    body: JSON.stringify({
      organization_id: A.organizationId, email: expEmail, role: "viewer", token: expToken,
      invited_by: uid("A", "owner"), expires_at: new Date(Date.now() - 3600_000).toISOString(),
    }),
  });
  const expJoin = await call(invFns["joinOrganization"]!, newToken, { token: expToken });
  record("INVITES", "الدعوة المنتهية مرفوضة",
    expJoin.denied || stateOf(expJoin.raw) !== "joined", "Token",
    `${expJoin.status} state=${stateOf(expJoin.raw)}`);
  const badJoin = await call(invFns["joinOrganization"]!, newToken, {
    token: crypto.randomUUID().replace(/-/g, ""),
  });
  record("INVITES", "التوكن غير الصالح مرفوض", badJoin.denied || /غير صالح|invalid/.test(badJoin.raw),
    "Token", `${badJoin.status} ${badJoin.message}`);

  // تغيير الدور / الإيقاف / الإزالة بصلاحية إدارية فقط.
  const byLawyer = await asUser(tok("A", "lawyer"), `/rest/v1/organization_members?user_id=eq.${newUser.id}`, {
    method: "PATCH", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ role: "admin" }),
  });
  record("INVITES", "lawyer ممنوع من ترقية عضو", rowsOf(byLawyer.body) <= 0, "RLS",
    `status=${byLawyer.status}`);
  const byAdmin = await asUser(tok("A", "admin"), `/rest/v1/organization_members?user_id=eq.${newUser.id}`, {
    method: "PATCH", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ role: "viewer" }),
  });
  record("INVITES", "admin يغيّر دور العضو", rowsOf(byAdmin.body) === 1, "RLS",
    `status=${byAdmin.status}`);
  const suspend = await asUser(tok("A", "admin"), `/rest/v1/organization_members?user_id=eq.${newUser.id}`, {
    method: "PATCH", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ status: "suspended" }),
  });
  const afterSuspend = await asUser(newToken, `/rest/v1/clients?organization_id=eq.${A.organizationId}&select=id`);
  record("INVITES", "إيقاف العضو يقطع وصوله فوراً",
    rowsOf(suspend.body) === 1 && rowsOf(afterSuspend.body) === 0, "RLS",
    `suspend=${suspend.status} rows=${rowsOf(afterSuspend.body)}`);
  const remove = await asUser(tok("A", "admin"), `/rest/v1/organization_members?user_id=eq.${newUser.id}`, {
    method: "DELETE", headers: { Prefer: "return=representation" },
  });
  record("INVITES", "admin يزيل العضو", rowsOf(remove.body) === 1, "RLS", `status=${remove.status}`);
  await adminFetch(`${SUPABASE_URL}/auth/v1/admin/users/${newUser.id}`, { method: "DELETE" });
}

/* ═══════════════ 7) بوابة العميل والروابط العامة ═══════════════ */
{
  await resetPublicAttempts();
  const lookup = await call(portalFns["lookupCaseStatus"]!, undefined, { code: A.publicCode });
  record("PORTAL", "متابعة القضية برمز صحيح تعمل بلا جلسة",
    lookup.ok && stateOf(lookup.raw) === "found", "Token",
    `status=${lookup.status} state=${stateOf(lookup.raw)}`);
  const leak = /internal|ملاحظة داخلية|is_client_visible|file_path|national_id/.test(lookup.raw);
  record("PORTAL", "نتيجة المتابعة لا تكشف ملاحظات داخلية أو مسارات ملفات", !leak, "Server Guard", "");
  const bad = await call(portalFns["lookupCaseStatus"]!, undefined, { code: "0000000000" });
  record("PORTAL", "رمز غير موجود يعيد not_found بلا تسريب",
    bad.ok && stateOf(bad.raw) === "not_found", "Token",
    `status=${bad.status} state=${stateOf(bad.raw)}`);
  const malformed = await call(portalFns["lookupCaseStatus"]!, undefined, { code: "abc" });
  record("PORTAL", "رمز بصيغة خاطئة مرفوض بالتحقق", malformed.denied, "Server Guard",
    `status=${malformed.status}`);

  // رابط رفع فعلي: صالح ثم ملغى ثم منتهٍ ثم غير صالح.
  const mk = await call(docReqFns["createDocumentRequest"]!, tok("A", "lawyer"), {
    caseId: A.caseIds[0], title: "QA-PLAN2 رابط العميل", items: ["صورة الهوية"],
  });
  const token = mk.raw.match(/"token"[\s\S]{0,30}?"([A-Za-z0-9_-]{20,})"/)?.[1] ?? "";
  record("PORTAL", "إنشاء رابط رفع للعميل", mk.ok && token.length > 20, "Server Guard",
    `status=${mk.status}`);
  const open = await call(portalFns["getUploadRequest"]!, undefined, { token });
  record("PORTAL", "الرابط الصالح يفتح بحالة active", open.ok && stateOf(open.raw) === "active",
    "Token", `status=${open.status} state=${stateOf(open.raw)}`);
  const openLeak = /file_path|organization_id|case_id|token_hash/.test(open.raw);
  record("PORTAL", "صفحة الرفع لا تكشف معرفات داخلية", !openLeak, "Server Guard", "");
  const invalid = await call(portalFns["getUploadRequest"]!, undefined, {
    token: "Zm9vYmFyLWludmFsaWQtdG9rZW4tMTIzNDU2Nzg5",
  });
  record("PORTAL", "توكن غير صالح يعيد invalid", invalid.ok && invalid.raw.includes("invalid"),
    "Token", `status=${invalid.status} state=${stateOf(invalid.raw)}`);

  const reqIdRes = await adminFetch(
    `${SUPABASE_URL}/rest/v1/document_requests?organization_id=eq.${A.organizationId}&title=eq.${encodeURIComponent("QA-PLAN2 رابط العميل")}&select=id`,
  );
  const reqId = ((await reqIdRes.json()) as { id: string }[])[0]?.id;
  const revoke = await call(docReqFns["revokeDocumentRequest"]!, tok("A", "owner"), { id: reqId });
  const afterRevoke = await call(portalFns["getUploadRequest"]!, undefined, { token });
  record("PORTAL", "الرابط الملغى لا يُستخدم",
    revoke.ok && stateOf(afterRevoke.raw) === "revoked", "Token",
    `status=${afterRevoke.status} state=${stateOf(afterRevoke.raw)}`);
  const submitRevoked = await call(portalFns["createUploadSlots"]!, undefined, {
    token, files: [{ name: "a.pdf", size: 1000, type: "application/pdf" }],
  });
  record("PORTAL", "رفع ملف عبر رابط ملغى مرفوض", submitRevoked.denied, "Token",
    `status=${submitRevoked.status} ${submitRevoked.message}`);

  // رابط منتهٍ.
  const mk2 = await call(docReqFns["createDocumentRequest"]!, tok("A", "lawyer"), {
    caseId: A.caseIds[0], title: "QA-PLAN2 رابط منتهٍ", items: [],
    expiresAt: new Date(Date.now() + 2000).toISOString(),
  });
  const token2 = mk2.raw.match(/"token"[\s\S]{0,30}?"([A-Za-z0-9_-]{20,})"/)?.[1] ?? "";
  const id2Res = await adminFetch(
    `${SUPABASE_URL}/rest/v1/document_requests?title=eq.${encodeURIComponent("QA-PLAN2 رابط منتهٍ")}&select=id`,
  );
  const id2 = ((await id2Res.json()) as { id: string }[])[0]?.id;
  await adminFetch(`${SUPABASE_URL}/rest/v1/document_requests?id=eq.${id2}`, {
    method: "PATCH",
    body: JSON.stringify({ expires_at: new Date(Date.now() - 60_000).toISOString() }),
  });
  const expired = await call(portalFns["getUploadRequest"]!, undefined, { token: token2 });
  record("PORTAL", "الرابط المنتهي يعيد expired", stateOf(expired.raw) === "expired", "Token",
    `status=${expired.status} state=${stateOf(expired.raw)}`);

  // محاولات خاطئة متتابعة: يجب أن تُسجَّل ويُفعَّل حد المحاولات.
  let limited = false;
  for (let i = 0; i < 40; i += 1) {
    const r = await call(portalFns["getUploadRequest"]!, undefined, {
      token: `bruteforce${i}${"x".repeat(20)}`,
    });
    if (stateOf(r.raw) === "rate_limited") { limited = true; break; }
  }
  record("PORTAL", "حد المحاولات يوقف تخمين التوكن", limited, "Server Guard",
    limited ? "" : "لم يُفعَّل الحد خلال 40 محاولة");
  await resetPublicAttempts();
}

/* ═══════════════ 8) أمن المستندات والتخزين ═══════════════ */
{
  const direct = await fetch(
    `${SUPABASE_URL}/storage/v1/object/public/documents/${A.organizationId}/${A.caseIds[0]}/plan2-A.pdf`,
  );
  record("DOCSEC", "الوصول المباشر لمسار التخزين مرفوض", direct.status >= 400, "Server Guard",
    `status=${direct.status}`);
  const anonRest = await fetch(
    `${SUPABASE_URL}/rest/v1/documents?select=file_path&limit=1`,
    { headers: { apikey: PUBLISHABLE } },
  );
  const anonBody = await anonRest.json();
  const anonRows = rowsOf(anonBody);
  record("DOCSEC", "زائر بلا جلسة لا يقرأ جدول المستندات",
    anonRest.status === 401 || anonRest.status === 403 || anonRows === 0, "RLS",
    `status=${anonRest.status} rows=${anonRows}`);
  const badDoc = await fetch(`${APP}/api/public/doc/notarealtoken123456`);
  record("DOCSEC", "رمز مستند غير صالح لا يُقدّم ملفاً",
    badDoc.status >= 400 && !(badDoc.headers.get("content-type") ?? "").includes("application/pdf"),
    "Token", `status=${badDoc.status}`);
}

/* ═══════════════ التقرير ═══════════════ */
const groups = [...new Set(rows.map((r) => r.group))];
console.log("\n──────── PLAN 2 SUMMARY ────────");
for (const g of groups) {
  const set = rows.filter((r) => r.group === g);
  console.log(`${g}: ${set.filter((r) => r.pass).length}/${set.length} PASS`);
}
const failed = rows.filter((r) => !r.pass);
console.log(`\nTOTAL: ${rows.length - failed.length}/${rows.length} PASS`);
if (failed.length) {
  console.log("\nFAILURES:");
  for (const f of failed) console.log(` - [${f.group}] ${f.name} :: ${f.detail}`);
}
await Bun.write("/tmp/browser/plan2/results.json", JSON.stringify(rows, null, 2));
process.exit(failed.length ? 1 : 0);
