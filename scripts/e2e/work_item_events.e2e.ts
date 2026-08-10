/**
 * اختبار تكامل: تحديث المهام والمهل لا يفشل أبداً لمستخدم عادي (لا يملك كتابة على
 * work_item_events)، ومع ذلك تُسجَّل الأحداث فعلياً في السجل ويقرأها المالك فقط.
 *
 * كل عملية تُنفَّذ بتوكن المستخدم الحقيقي عبر Data API، فالنتيجة دليل خادمي على
 * السلوك تحت RLS لا على الواجهة.
 *
 * التشغيل: bun scripts/e2e/work_item_events.e2e.ts   (بعد bun scripts/e2e/org-qa-fixture.ts)
 */
import { asUser, loadQaOrg, SUPABASE_URL, adminFetch, type OrgRole } from "./qa-support";

type Case = { name: string; pass: boolean; detail: string };
const results: Case[] = [];
function record(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${pass ? "" : ` :: ${detail}`}`);
}

const qa = await loadQaOrg();
const org = qa.organizationId;
const acc = (role: OrgRole | "outsider") => qa.accounts.find((a) => a.role === role)!;
const lawyer = acc("lawyer");
const assistant = acc("legal_assistant");

type EventRow = {
  id: string;
  event: string;
  item_type: string;
  item_id: string;
  actor_id: string | null;
  from_user_id: string | null;
  to_user_id: string | null;
  from_due_date: string | null;
  to_due_date: string | null;
};

/** أحداث عنصر واحد كما يقرأها المالك (السياسة تسمح لـ owner/admin فقط). */
async function eventsOf(itemId: string): Promise<EventRow[]> {
  const r = await asUser(
    acc("owner").token,
    `/rest/v1/work_item_events?item_id=eq.${itemId}&select=id,event,item_type,item_id,actor_id,from_user_id,to_user_id,from_due_date,to_due_date&order=occurred_at.asc`,
  );
  return Array.isArray(r.body) ? (r.body as EventRow[]) : [];
}

async function expectEvent(itemId: string, event: string, label: string) {
  const rows = await eventsOf(itemId);
  const hit = rows.find((e) => e.event === event);
  record(
    label,
    !!hit && hit.actor_id === lawyer.userId,
    `events=${rows.map((e) => e.event).join(",") || "لا شيء"} actor=${hit?.actor_id ?? "—"}`,
  );
  return hit;
}

// ── تجهيز: عميل وقضية بمفتاح الخدمة (تجهيز بيانات فقط) ─────────────────────
const clientRes = await adminFetch(`${SUPABASE_URL}/rest/v1/clients`, {
  method: "POST",
  headers: { Prefer: "return=representation" },
  body: JSON.stringify({ organization_id: org, full_name: "QA عميل سجل الأعمال" }),
});
const client = ((await clientRes.json()) as { id: string }[])[0];
if (!client) throw new Error("تعذّر تجهيز العميل");

const caseRes = await adminFetch(`${SUPABASE_URL}/rest/v1/cases`, {
  method: "POST",
  headers: { Prefer: "return=representation" },
  body: JSON.stringify({
    organization_id: org,
    case_title: "QA قضية سجل الأعمال",
    client_id: client.id,
    created_by: lawyer.userId,
  }),
});
const kase = ((await caseRes.json()) as { id: string }[])[0];
if (!kase) throw new Error("تعذّر تجهيز القضية");

const day = 86_400_000;
const iso = (ms: number) => new Date(Date.now() + ms).toISOString();

// ── 1) إنشاء مهمة بتوكن المحامي: يجب أن ينجح ويسجّل حدث created ─────────────
const taskRes = await asUser(lawyer.token, `/rest/v1/tasks`, {
  method: "POST",
  headers: { Prefer: "return=representation" },
  body: JSON.stringify({
    organization_id: org,
    case_id: kase.id,
    title: "QA مهمة سجل الأعمال",
    assigned_to: lawyer.userId,
    due_date: iso(3 * day),
    created_by: lawyer.userId,
  }),
});
record(
  "إنشاء مهمة بحساب محامٍ عادي لا يفشل (سجل الأحداث محجوب عنه)",
  taskRes.status === 201,
  `status=${taskRes.status} ${JSON.stringify(taskRes.body)}`,
);
const task = Array.isArray(taskRes.body) ? (taskRes.body as { id: string }[])[0] : undefined;
if (!task) {
  console.error("تعذّر إنشاء المهمة — إيقاف الاختبار.");
  process.exit(1);
}
await expectEvent(task.id, "created", "حدث created للمهمة مسجَّل بفاعل صحيح");

// ── 2) تعديل الاستحقاق ثم الإسناد ثم الإنجاز — كلها لا تفشل وتُسجَّل ─────────
{
  const r = await asUser(lawyer.token, `/rest/v1/tasks?id=eq.${task.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ due_date: iso(7 * day) }),
  });
  record("تغيير تاريخ استحقاق المهمة لا يفشل", r.status === 200, `status=${r.status}`);
  await expectEvent(task.id, "due_changed", "حدث due_changed للمهمة مسجَّل");
}
{
  const r = await asUser(lawyer.token, `/rest/v1/tasks?id=eq.${task.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ assigned_to: assistant.userId }),
  });
  record("إعادة إسناد المهمة لا تفشل", r.status === 200, `status=${r.status}`);
  const hit = await expectEvent(task.id, "assigned", "حدث assigned للمهمة مسجَّل");
  record(
    "حدث assigned يحمل المسؤول السابق والجديد",
    hit?.from_user_id === lawyer.userId && hit?.to_user_id === assistant.userId,
    `from=${hit?.from_user_id ?? "—"} to=${hit?.to_user_id ?? "—"}`,
  );
}
{
  const r = await asUser(lawyer.token, `/rest/v1/tasks?id=eq.${task.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ status: "completed" }),
  });
  record("إنجاز المهمة لا يفشل", r.status === 200, `status=${r.status}`);
  await expectEvent(task.id, "completed", "حدث completed للمهمة مسجَّل");
}
{
  const r = await asUser(lawyer.token, `/rest/v1/tasks?id=eq.${task.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ status: "in_progress" }),
  });
  record("إعادة فتح المهمة لا تفشل", r.status === 200, `status=${r.status}`);
  await expectEvent(task.id, "reopened", "حدث reopened للمهمة مسجَّل");
}

// ── 3) المهل: إنشاء وتغيير استحقاق وإنجاز بحساب المحامي ─────────────────────
const dlRes = await asUser(lawyer.token, `/rest/v1/deadlines`, {
  method: "POST",
  headers: { Prefer: "return=representation" },
  body: JSON.stringify({
    organization_id: org,
    case_id: kase.id,
    title: "QA مهلة سجل الأعمال",
    due_date: iso(5 * day),
    responsible_user_id: lawyer.userId,
    created_by: lawyer.userId,
  }),
});
record(
  "إنشاء مهلة بحساب محامٍ عادي لا يفشل",
  dlRes.status === 201,
  `status=${dlRes.status} ${JSON.stringify(dlRes.body)}`,
);
const deadline = Array.isArray(dlRes.body) ? (dlRes.body as { id: string }[])[0] : undefined;
if (deadline) {
  await expectEvent(deadline.id, "created", "حدث created للمهلة مسجَّل");
  const r1 = await asUser(lawyer.token, `/rest/v1/deadlines?id=eq.${deadline.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ due_date: iso(10 * day) }),
  });
  record("تمديد المهلة لا يفشل", r1.status === 200, `status=${r1.status}`);
  await expectEvent(deadline.id, "due_changed", "حدث due_changed للمهلة مسجَّل");

  const r2 = await asUser(lawyer.token, `/rest/v1/deadlines?id=eq.${deadline.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ status: "completed" }),
  });
  record("إنجاز المهلة لا يفشل", r2.status === 200, `status=${r2.status}`);
  await expectEvent(deadline.id, "completed", "حدث completed للمهلة مسجَّل");
}

// ── 4) السجل يبقى مغلقاً: لا كتابة ولا قراءة لغير المالك/المدير ─────────────
for (const role of ["lawyer", "legal_assistant", "viewer", "outsider"] as (
  | OrgRole
  | "outsider"
)[]) {
  const r = await asUser(acc(role).token, `/rest/v1/work_item_events`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      organization_id: org,
      item_type: "task",
      item_id: task.id,
      event: "completed",
      actor_id: acc(role).userId,
    }),
  });
  record(
    `منع الكتابة المباشرة في سجل الأحداث — ${role}`,
    r.status === 401 || r.status === 403,
    `status=${r.status} ${JSON.stringify(r.body)}`,
  );
}
for (const role of ["lawyer", "legal_assistant", "viewer", "outsider"] as (
  | OrgRole
  | "outsider"
)[]) {
  const r = await asUser(
    acc(role).token,
    `/rest/v1/work_item_events?item_id=eq.${task.id}&select=id`,
  );
  const rows = Array.isArray(r.body) ? (r.body as unknown[]).length : -1;
  record(`منع قراءة سجل الأحداث — ${role}`, rows === 0, `status=${r.status} rows=${rows}`);
}
{
  const rows = await eventsOf(task.id);
  record("المالك يقرأ سجل أحداث المهمة", rows.length >= 4, `rows=${rows.length}`);
  const target = rows[0];
  const upd = await asUser(acc("owner").token, `/rest/v1/work_item_events?id=eq.${target!.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ event: "cancelled" }),
  });
  const changed = Array.isArray(upd.body) && (upd.body as unknown[]).length > 0;
  record("سجل الأحداث غير قابل للتعديل — owner", !changed, `status=${upd.status}`);
  const del = await asUser(acc("owner").token, `/rest/v1/work_item_events?id=eq.${target!.id}`, {
    method: "DELETE",
    headers: { Prefer: "return=representation" },
  });
  const deleted = Array.isArray(del.body) && (del.body as unknown[]).length > 0;
  record("سجل الأحداث غير قابل للحذف — owner", !deleted, `status=${del.status}`);
}

// ── 5) الحذف يُسجَّل أيضاً دون فشل العملية ──────────────────────────────────
{
  const r = await asUser(acc("owner").token, `/rest/v1/tasks?id=eq.${task.id}`, {
    method: "DELETE",
    headers: { Prefer: "return=representation" },
  });
  record("حذف المهمة لا يفشل", r.status === 200, `status=${r.status}`);
  const rows = await eventsOf(task.id);
  record(
    "حدث deleted مسجَّل بعد حذف المهمة",
    rows.some((e) => e.event === "deleted"),
    `events=${rows.map((e) => e.event).join(",")}`,
  );
}

const fail = results.filter((r) => !r.pass);
console.log(`\nالنتيجة: ${results.length - fail.length} PASS / ${fail.length} FAIL`);
if (fail.length) {
  for (const f of fail) console.log(`  FAIL — ${f.name} :: ${f.detail}`);
  process.exit(1);
}
