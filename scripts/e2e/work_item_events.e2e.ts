/**
 * اختبار تكامل: تحديث المهام والمهل لا يفشل أبداً لمستخدم عادي (لا يملك كتابة على
 * work_item_events)، ومع ذلك تُسجَّل الأحداث فعلياً في السجل ويقرأها المالك فقط.
 *
 * كل عملية تُنفَّذ بتوكن المستخدم الحقيقي عبر Data API، فالنتيجة دليل خادمي على
 * السلوك تحت RLS لا على الواجهة.
 *
 * التشغيل: bun scripts/e2e/work_item_events.e2e.ts   (بعد bun scripts/e2e/org-qa-fixture.ts)
 */
import {
  asUser,
  loadQaOrg,
  SUPABASE_URL,
  adminFetch,
  QA_ORG_PREFIX,
  type OrgRole,
} from "./qa-support";

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

// ── 4.5) حقن عطل: رفض الكتابة في سجل الأحداث لا يُرجع العملية (No Rollback) ──
// العلامة QA-WIE-FAULT تجعل مشغّل التقاط الأحداث يفشل بنفس رمز رفض الصلاحية
// (42501)، فنتحقق أن تعديل المهمة/المهلة ينجح ويُحفظ فعلياً وأن العطل يُقيَّد.
type FailureRow = { id: string; ref: string; error_code: string | null; metadata: unknown };

async function failuresOf(itemId: string): Promise<FailureRow[]> {
  const res = await adminFetch(
    `${SUPABASE_URL}/rest/v1/system_failures?action=eq.work_item_events.capture&metadata->>item_id=eq.${itemId}&select=id,ref,error_code,metadata`,
  );
  const body = (await res.json()) as unknown;
  return Array.isArray(body) ? (body as FailureRow[]) : [];
}

async function readRow(
  table: "tasks" | "deadlines",
  id: string,
): Promise<Record<string, unknown> | undefined> {
  const r = await asUser(acc("owner").token, `/rest/v1/${table}?id=eq.${id}&select=*`);
  return Array.isArray(r.body) ? (r.body as Record<string, unknown>[])[0] : undefined;
}

const faultIds: { table: "tasks" | "deadlines"; id: string }[] = [];

for (const table of ["tasks", "deadlines"] as const) {
  const isTask = table === "tasks";
  const label = isTask ? "المهمة" : "المهلة";
  const createRes = await asUser(lawyer.token, `/rest/v1/${table}`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      organization_id: org,
      case_id: kase.id,
      title: `QA-WIE-FAULT ${label} حقن عطل`,
      due_date: iso(2 * day),
      created_by: lawyer.userId,
      ...(isTask ? { assigned_to: lawyer.userId } : { responsible_user_id: lawyer.userId }),
    }),
  });
  record(
    `إنشاء ${label} ينجح رغم رفض الكتابة في سجل الأحداث`,
    createRes.status === 201,
    `status=${createRes.status} ${JSON.stringify(createRes.body)}`,
  );
  const row = Array.isArray(createRes.body) ? (createRes.body as { id: string }[])[0] : undefined;
  if (!row) {
    record(`استمرار اختبار حقن العطل — ${label}`, false, "تعذّر إنشاء الصف");
    continue;
  }
  faultIds.push({ table, id: row.id });

  record(
    `${label} محفوظة فعلياً بعد الإنشاء (لا Rollback)`,
    !!(await readRow(table, row.id)),
    "الصف غير موجود بعد الإنشاء",
  );
  record(
    `لا أحداث مسجَّلة لـ${label} عند رفض الكتابة`,
    (await eventsOf(row.id)).length === 0,
    `events=${(await eventsOf(row.id)).map((e) => e.event).join(",")}`,
  );

  const newDue = iso(21 * day);
  const dueRes = await asUser(lawyer.token, `/rest/v1/${table}?id=eq.${row.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ due_date: newDue }),
  });
  const afterDue = await readRow(table, row.id);
  record(
    `تغيير استحقاق ${label} ينجح مع فشل التقاط الحدث`,
    dueRes.status === 200,
    `status=${dueRes.status} ${JSON.stringify(dueRes.body)}`,
  );
  record(
    `الاستحقاق الجديد لـ${label} مُثبَّت في القاعدة (المعاملة لم تُرجَع)`,
    typeof afterDue?.["due_date"] === "string" &&
      new Date(afterDue["due_date"] as string).getTime() === new Date(newDue).getTime(),
    `due=${String(afterDue?.["due_date"])} expected=${newDue}`,
  );

  if (isTask) {
    const asgRes = await asUser(lawyer.token, `/rest/v1/tasks?id=eq.${row.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ assigned_to: assistant.userId }),
    });
    const afterAsg = await readRow("tasks", row.id);
    record(
      "إعادة إسناد المهمة تنجح مع فشل التقاط الحدث",
      asgRes.status === 200,
      `status=${asgRes.status}`,
    );
    record(
      "المسؤول الجديد للمهمة مُثبَّت في القاعدة",
      afterAsg?.["assigned_to"] === assistant.userId,
      `assigned_to=${String(afterAsg?.["assigned_to"])}`,
    );
  }

  const doneRes = await asUser(lawyer.token, `/rest/v1/${table}?id=eq.${row.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ status: "completed" }),
  });
  const afterDone = await readRow(table, row.id);
  record(
    `إنجاز ${label} ينجح مع فشل التقاط الحدث`,
    doneRes.status === 200,
    `status=${doneRes.status} ${JSON.stringify(doneRes.body)}`,
  );
  record(
    `حالة ${label} أصبحت completed فعلياً`,
    afterDone?.["status"] === "completed",
    `status=${String(afterDone?.["status"])}`,
  );
  record(
    `السجل يبقى فارغاً لـ${label} بعد كل التعديلات`,
    (await eventsOf(row.id)).length === 0,
    `events=${(await eventsOf(row.id)).map((e) => e.event).join(",")}`,
  );

  const failures = await failuresOf(row.id);
  record(
    `أعطال التقاط أحداث ${label} مُقيَّدة في system_failures`,
    failures.length >= 3,
    `count=${failures.length}`,
  );
  record(
    `مرجع العطل يبدأ بـ WIE- ورمز الخطأ 42501 — ${label}`,
    failures.every((f) => f.ref?.startsWith("WIE-")) &&
      failures.every((f) => f.error_code === "42501"),
    `refs=${failures.map((f) => `${f.ref}:${f.error_code}`).join(",")}`,
  );
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

// ── 6) دقّة عدّاد السجل: مقارنة المتوقع بالفعلي لسلسلة عمليات كاملة ─────────
// نبني قائمة الأحداث المتوقعة خطوة بخطوة ثم نقارنها بالسجل عدداً وترتيباً،
// بما يشمل عملية واحدة تُنتج حدثين، وعملية بلا تغيير لا تُنتج أي حدث.
{
  const expected: string[] = [];
  const cmp = async (itemId: string, label: string) => {
    const actual = (await eventsOf(itemId)).map((e) => e.event);
    record(
      label,
      actual.length === expected.length && actual.every((e, i) => e === expected[i]),
      `متوقع=[${expected.join(",")}] فعلي=[${actual.join(",")}]`,
    );
  };

  // مهمة: إنشاء → تمديد → إسناد → (تمديد+إسناد في طلب واحد) → إنجاز → إعادة فتح → بلا تغيير → حذف
  const cRes = await asUser(lawyer.token, `/rest/v1/tasks`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      organization_id: org,
      case_id: kase.id,
      title: "QA عدّاد أحداث المهمة",
      assigned_to: lawyer.userId,
      due_date: iso(4 * day),
      created_by: lawyer.userId,
    }),
  });
  const counted = Array.isArray(cRes.body) ? (cRes.body as { id: string }[])[0] : undefined;
  record("تجهيز مهمة عدّاد الأحداث", cRes.status === 201 && !!counted, `status=${cRes.status}`);

  if (counted) {
    expected.push("created");
    await cmp(counted.id, "عدّاد السجل بعد الإنشاء = 1 (created)");

    const patch = async (body: Record<string, unknown>, adds: string[], label: string) => {
      const r = await asUser(lawyer.token, `/rest/v1/tasks?id=eq.${counted.id}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(body),
      });
      record(`نجاح العملية — ${label}`, r.status === 200, `status=${r.status}`);
      expected.push(...adds);
      await cmp(counted.id, `عدّاد السجل = ${expected.length} بعد ${label}`);
    };

    await patch({ due_date: iso(9 * day) }, ["due_changed"], "التمديد");
    await patch({ assigned_to: assistant.userId }, ["assigned"], "الإسناد");
    await patch(
      { due_date: iso(14 * day), assigned_to: lawyer.userId },
      ["assigned", "due_changed"],
      "تمديد وإسناد في طلب واحد (حدثان)",
    );
    await patch({ status: "completed" }, ["completed"], "الإنجاز");
    await patch({ status: "in_progress" }, ["reopened"], "إعادة الفتح");
    await patch({ priority: "high" }, [], "تعديل لا يمس المهل/الإسناد/الحالة (بلا أحداث)");

    const del = await asUser(acc("owner").token, `/rest/v1/tasks?id=eq.${counted.id}`, {
      method: "DELETE",
      headers: { Prefer: "return=representation" },
    });
    record("نجاح العملية — الحذف", del.status === 200, `status=${del.status}`);
    expected.push("deleted");
    await cmp(counted.id, `العدّاد النهائي للمهمة = ${expected.length} بالترتيب الصحيح`);
  }
}
{
  const expected: string[] = [];
  const dRes = await asUser(lawyer.token, `/rest/v1/deadlines`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      organization_id: org,
      case_id: kase.id,
      title: "QA عدّاد أحداث المهلة",
      due_date: iso(6 * day),
      responsible_user_id: lawyer.userId,
      created_by: lawyer.userId,
    }),
  });
  const dl = Array.isArray(dRes.body) ? (dRes.body as { id: string }[])[0] : undefined;
  record("تجهيز مهلة عدّاد الأحداث", dRes.status === 201 && !!dl, `status=${dRes.status}`);
  if (dl) {
    const cmpDl = async (label: string) => {
      const actual = (await eventsOf(dl.id)).map((e) => e.event);
      record(
        label,
        actual.length === expected.length && actual.every((e, i) => e === expected[i]),
        `متوقع=[${expected.join(",")}] فعلي=[${actual.join(",")}]`,
      );
    };
    expected.push("created");
    await cmpDl("عدّاد سجل المهلة بعد الإنشاء = 1");

    const steps: { body: Record<string, unknown>; adds: string[]; label: string }[] = [
      { body: { due_date: iso(12 * day) }, adds: ["due_changed"], label: "تمديد المهلة" },
      {
        body: { responsible_user_id: assistant.userId },
        adds: ["assigned"],
        label: "إسناد المهلة",
      },
      { body: { status: "completed" }, adds: ["completed"], label: "إنجاز المهلة" },
    ];
    for (const s of steps) {
      const r = await asUser(lawyer.token, `/rest/v1/deadlines?id=eq.${dl.id}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(s.body),
      });
      record(`نجاح العملية — ${s.label}`, r.status === 200, `status=${r.status}`);
      expected.push(...s.adds);
      await cmpDl(`عدّاد سجل المهلة = ${expected.length} بعد ${s.label}`);
    }

    const del = await asUser(acc("owner").token, `/rest/v1/deadlines?id=eq.${dl.id}`, {
      method: "DELETE",
      headers: { Prefer: "return=representation" },
    });
    record("نجاح العملية — حذف المهلة", del.status === 200, `status=${del.status}`);
    expected.push("deleted");
    await cmpDl(`العدّاد النهائي للمهلة = ${expected.length} بالترتيب الصحيح`);
  }
}

// ── الترتيب الزمني للأحداث بعد عمليات متتابعة متقاربة ──────────────────────
{
  type Timed = { event: string; occurred_at: string; seq: number };
  const timedEventsOf = async (itemId: string, desc = false): Promise<Timed[]> => {
    const dir = desc ? "desc" : "asc";
    const r = await asUser(
      acc("owner").token,
      `/rest/v1/work_item_events?item_id=eq.${itemId}&select=event,occurred_at,seq&order=occurred_at.${dir},seq.${dir}`,
    );
    return Array.isArray(r.body) ? (r.body as Timed[]) : [];
  };

  const seqRes = await asUser(lawyer.token, `/rest/v1/tasks`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      organization_id: org,
      case_id: kase.id,
      title: "QA ترتيب زمني للأحداث",
      assigned_to: lawyer.userId,
      due_date: iso(3 * day),
      created_by: lawyer.userId,
    }),
  });
  const seq = Array.isArray(seqRes.body) ? (seqRes.body as { id: string }[])[0] : undefined;
  record("تجهيز مهمة الترتيب الزمني", seqRes.status === 201 && !!seq, `status=${seqRes.status}`);

  if (seq) {
    // عمليات متتابعة بلا أي تأخير مُتعمّد لاختبار التقارب الزمني الشديد
    const patches: Record<string, unknown>[] = [
      { due_date: iso(5 * day) },
      { assigned_to: assistant.userId },
      { due_date: iso(7 * day), assigned_to: lawyer.userId },
      { status: "completed" },
      { status: "in_progress" },
    ];
    let allOk = true;
    for (const body of patches) {
      const r = await asUser(lawyer.token, `/rest/v1/tasks?id=eq.${seq.id}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(body),
      });
      if (r.status !== 200) allOk = false;
    }
    record("نجاح كل العمليات المتتابعة المتقاربة", allOk);

    const asc = await timedEventsOf(seq.id);
    const stamps = asc.map((e) => Date.parse(e.occurred_at));

    record(
      "عدد الأحداث المسجّلة = 7 بعد السلسلة المتقاربة",
      asc.length === 7,
      `فعلي=${asc.length} [${asc.map((e) => e.event).join(",")}]`,
    );

    record(
      "التواريخ غير متناقصة (ترتيب زمني صحيح)",
      stamps.every((t, i) => i === 0 || t >= stamps[i - 1]!),
      `الطوابع=[${asc.map((e) => `${e.event}@${e.occurred_at}`).join(" | ")}]`,
    );

    record(
      "تسلسل الأحداث بالترتيب الزمني مطابق للمتوقّع",
      asc.map((e) => e.event).join(",") ===
        "created,due_changed,assigned,assigned,due_changed,completed,reopened",
      `فعلي=[${asc.map((e) => e.event).join(",")}]`,
    );

    // حدثان في نفس اللحظة (نفس المعاملة) يجب أن يفصلهما تسلسل تصاعدي ثابت
    const seqs = asc.map((e) => e.seq);
    record(
      "تسلسل ثابت تصاعدي يفصل الأحداث المتزامنة",
      seqs.every((n) => Number.isFinite(n)) && seqs.every((n, i) => i === 0 || n > seqs[i - 1]!),
      `التسلسل=[${seqs.join(",")}]`,
    );

    const desc = await timedEventsOf(seq.id, true);
    record(
      "الترتيب التنازلي معكوس تماماً للترتيب التصاعدي",
      desc.map((e) => e.event).join(",") ===
        asc
          .map((e) => e.event)
          .reverse()
          .join(","),
      `تنازلي=[${desc.map((e) => e.event).join(",")}]`,
    );

    const first = asc[0];
    const last = asc[asc.length - 1];
    record(
      "أول حدث هو الإنشاء وآخر حدث هو الأحدث زمنياً",
      first?.event === "created" &&
        !!last &&
        Date.parse(last.occurred_at) >= Date.parse(first!.occurred_at),
      `أول=${first?.event ?? "—"} آخر=${last?.event ?? "—"}`,
    );

    await adminFetch(`${SUPABASE_URL}/rest/v1/tasks?id=eq.${seq.id}`, { method: "DELETE" });
  }
}

// ── مستخدمان عاديان في نفس المنظمة: صحّة الفاعل وعدم رؤية السجلات ──────────
{
  const mkTask = async (
    who: typeof lawyer,
    title: string,
    assignee: string,
  ): Promise<string | undefined> => {
    const r = await asUser(who.token, `/rest/v1/tasks`, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        organization_id: org,
        case_id: kase.id,
        title,
        assigned_to: assignee,
        due_date: iso(2 * day),
        created_by: who.userId,
      }),
    });
    record(`إنشاء «${title}» ينجح لمستخدم عادي`, r.status === 201, `status=${r.status}`);
    return Array.isArray(r.body) ? (r.body as { id: string }[])[0]?.id : undefined;
  };

  const lawyerTask = await mkTask(lawyer, "QA مهمة المحامي المشتركة", lawyer.userId);
  const assistantTask = await mkTask(assistant, "QA مهمة المساعد المشتركة", assistant.userId);

  const actorsOf = async (itemId: string) =>
    (await eventsOf(itemId)).map((e) => `${e.event}:${e.actor_id ?? "—"}`);

  if (lawyerTask && assistantTask) {
    record(
      "حدث الإنشاء يحمل فاعله الحقيقي — المحامي",
      (await actorsOf(lawyerTask)).join(",") === `created:${lawyer.userId}`,
      `فعلي=[${(await actorsOf(lawyerTask)).join(",")}]`,
    );
    record(
      "حدث الإنشاء يحمل فاعله الحقيقي — المساعد",
      (await actorsOf(assistantTask)).join(",") === `created:${assistant.userId}`,
      `فعلي=[${(await actorsOf(assistantTask)).join(",")}]`,
    );

    // تفاعل متبادل على نفس العنصر: كل حدث يُنسب لمن نفّذه فعلاً
    const cross = await asUser(assistant.token, `/rest/v1/tasks?id=eq.${lawyerTask}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ due_date: iso(8 * day) }),
    });
    const crossOk = cross.status === 200 && Array.isArray(cross.body) && cross.body.length > 0;
    record("المساعد يعدّل مهمة المحامي في نفس المنظمة", crossOk, `status=${cross.status}`);

    if (crossOk) {
      const back = await asUser(lawyer.token, `/rest/v1/tasks?id=eq.${lawyerTask}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ assigned_to: assistant.userId }),
      });
      record("المحامي يعيد إسناد المهمة للمساعد", back.status === 200, `status=${back.status}`);

      const done = await asUser(assistant.token, `/rest/v1/tasks?id=eq.${lawyerTask}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ status: "completed" }),
      });
      record("المساعد ينجز المهمة المسندة إليه", done.status === 200, `status=${done.status}`);

      record(
        "تسلسل الأحداث ينسب كل حدث لفاعله الصحيح بين المستخدمين",
        (await actorsOf(lawyerTask)).join(",") ===
          [
            `created:${lawyer.userId}`,
            `due_changed:${assistant.userId}`,
            `assigned:${lawyer.userId}`,
            `completed:${assistant.userId}`,
          ].join(","),
        `فعلي=[${(await actorsOf(lawyerTask)).join(",")}]`,
      );
    }

    // لا يرى أي مستخدم عادي سجلات: لا سجلاته ولا سجلات غيره
    for (const [label, who] of [
      ["المحامي", lawyer],
      ["المساعد", assistant],
    ] as const) {
      const own = await asUser(
        who.token,
        `/rest/v1/work_item_events?actor_id=eq.${who.userId}&select=id`,
      );
      record(
        `${label} لا يرى سجلاته الخاصة في work_item_events`,
        Array.isArray(own.body) && own.body.length === 0,
        `status=${own.status} rows=${Array.isArray(own.body) ? own.body.length : -1}`,
      );

      const other = who === lawyer ? assistant : lawyer;
      const foreign = await asUser(
        who.token,
        `/rest/v1/work_item_events?actor_id=eq.${other.userId}&select=id`,
      );
      record(
        `${label} لا يرى سجلات مستخدم آخر في نفس المنظمة`,
        Array.isArray(foreign.body) && foreign.body.length === 0,
        `status=${foreign.status} rows=${Array.isArray(foreign.body) ? foreign.body.length : -1}`,
      );

      const byItem = await asUser(
        who.token,
        `/rest/v1/work_item_events?item_id=eq.${assistantTask}&select=id`,
      );
      record(
        `${label} لا يرى سجل عنصر آخر بالمعرف المباشر`,
        Array.isArray(byItem.body) && byItem.body.length === 0,
        `rows=${Array.isArray(byItem.body) ? byItem.body.length : -1}`,
      );
    }

    // عزل خارج المنظمة: لا عناصر ولا سجلات
    const outsider = acc("outsider");
    const outTasks = await asUser(
      outsider.token,
      `/rest/v1/tasks?organization_id=eq.${org}&select=id`,
    );
    record(
      "مستخدم من خارج المنظمة لا يرى مهامها",
      Array.isArray(outTasks.body) && outTasks.body.length === 0,
      `rows=${Array.isArray(outTasks.body) ? outTasks.body.length : -1}`,
    );
    const outEvents = await asUser(
      outsider.token,
      `/rest/v1/work_item_events?organization_id=eq.${org}&select=id`,
    );
    record(
      "مستخدم من خارج المنظمة لا يرى سجل أحداثها",
      Array.isArray(outEvents.body) && outEvents.body.length === 0,
      `rows=${Array.isArray(outEvents.body) ? outEvents.body.length : -1}`,
    );

    // المالك وحده يرى سجلات المستخدمين ومنفصلة لكل عنصر
    const ownerLawyer = await eventsOf(lawyerTask);
    const ownerAssistant = await eventsOf(assistantTask);
    record(
      "المالك يرى سجلات المستخدمين بفاعلين مختلفين",
      new Set(ownerLawyer.map((e) => e.actor_id)).size >= 2 &&
        ownerAssistant.every((e) => e.actor_id === assistant.userId),
      `مهمة المحامي=${new Set(ownerLawyer.map((e) => e.actor_id)).size} فاعل`,
    );
    record(
      "لا تسرّب أحداث بين العنصرين",
      ownerLawyer.every((e) => e.item_id === lawyerTask) &&
        ownerAssistant.every((e) => e.item_id === assistantTask),
      `${ownerLawyer.length}/${ownerAssistant.length}`,
    );

    for (const id of [lawyerTask, assistantTask]) {
      await adminFetch(`${SUPABASE_URL}/rest/v1/tasks?id=eq.${id}`, { method: "DELETE" });
    }
  }
}

// ── قراءة السجل ضمن الصلاحيات الصحيحة فقط، ولا كتابة ولا تعديل لأي دور ─────
{
  // مهمة يعمل عليها المحامي: لها أحداث حقيقية داخل منظمة QA
  const created = await asUser(lawyer.token, `/rest/v1/tasks`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      organization_id: org,
      case_id: kase.id,
      title: "QA مهمة صلاحيات القراءة",
      assigned_to: lawyer.userId,
      due_date: iso(3 * day),
      created_by: lawyer.userId,
    }),
  });
  const readTask = Array.isArray(created.body)
    ? (created.body as { id: string }[])[0]?.id
    : undefined;
  record("تجهيز مهمة لاختبار صلاحيات القراءة", !!readTask, `status=${created.status}`);

  // منظمة أخرى بمهمة وأحداث: يجب ألا تظهر لمالك منظمة QA
  const foreignOrgRes = await adminFetch(`${SUPABASE_URL}/rest/v1/organizations`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ name: `${QA_ORG_PREFIX}قراءة-منظمة-أخرى-${Date.now()}` }),
  });
  const foreignOrg = ((await foreignOrgRes.json()) as { id: string }[])[0];
  let foreignTask: string | undefined;
  if (foreignOrg) {
    const fc = await adminFetch(`${SUPABASE_URL}/rest/v1/clients`, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ organization_id: foreignOrg.id, full_name: "QA عميل منظمة أخرى" }),
    });
    const fClient = ((await fc.json()) as { id: string }[])[0];
    const fk = await adminFetch(`${SUPABASE_URL}/rest/v1/cases`, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        organization_id: foreignOrg.id,
        case_title: "QA قضية منظمة أخرى",
        client_id: fClient?.id ?? null,
      }),
    });
    const fCase = ((await fk.json()) as { id: string }[])[0];
    const ft = await adminFetch(`${SUPABASE_URL}/rest/v1/tasks`, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        organization_id: foreignOrg.id,
        case_id: fCase?.id ?? null,
        title: "QA مهمة منظمة أخرى",
        due_date: iso(4 * day),
      }),
    });
    foreignTask = ((await ft.json()) as { id: string }[])[0]?.id;
  }

  if (readTask) {
    // 1) القراءة المسموحة: أدوار الإدارة فقط، ومحصورة بمنظمتها
    for (const role of ["owner", "admin"] as const) {
      const r = await asUser(
        acc(role).token,
        `/rest/v1/work_item_events?item_id=eq.${readTask}&select=id,organization_id`,
      );
      const rows = Array.isArray(r.body) ? (r.body as { organization_id: string }[]) : [];
      record(
        `دور ${role} يقرأ أحداث عنصر داخل منظمته`,
        r.status === 200 && rows.length > 0 && rows.every((x) => x.organization_id === org),
        `status=${r.status} rows=${rows.length}`,
      );
    }

    // 2) الأدوار غير الإدارية: قراءة صفرية دائماً (لا سجلاتها ولا سجل غيرها)
    for (const role of ["lawyer", "legal_assistant", "viewer"] as const) {
      const r = await asUser(
        acc(role).token,
        `/rest/v1/work_item_events?select=id&limit=5`,
      );
      record(
        `دور ${role} لا يقرأ أي صف من work_item_events`,
        Array.isArray(r.body) && r.body.length === 0,
        `status=${r.status} rows=${Array.isArray(r.body) ? r.body.length : -1}`,
      );
      const scoped = await asUser(
        acc(role).token,
        `/rest/v1/work_item_events?item_id=eq.${readTask}&select=id`,
      );
      record(
        `دور ${role} لا يقرأ سجل عنصر بمعرفه المباشر`,
        Array.isArray(scoped.body) && scoped.body.length === 0,
        `rows=${Array.isArray(scoped.body) ? scoped.body.length : -1}`,
      );
      const agg = await asUser(
        acc(role).token,
        `/rest/v1/work_item_events?select=id&organization_id=eq.${org}`,
        { headers: { Prefer: "count=exact" } },
      );
      record(
        `دور ${role} لا يستنتج عدد الأحداث عبر count`,
        Array.isArray(agg.body) && agg.body.length === 0,
        `rows=${Array.isArray(agg.body) ? agg.body.length : -1}`,
      );
    }

    // 3) عزل المنظمات: المالك لا يرى أحداث منظمة أخرى ولو بالمعرف الصريح
    if (foreignTask) {
      const cross = await asUser(
        acc("owner").token,
        `/rest/v1/work_item_events?item_id=eq.${foreignTask}&select=id`,
      );
      record(
        "مالك منظمة QA لا يقرأ أحداث عنصر في منظمة أخرى",
        Array.isArray(cross.body) && cross.body.length === 0,
        `rows=${Array.isArray(cross.body) ? cross.body.length : -1}`,
      );
      const crossOrg = await asUser(
        acc("owner").token,
        `/rest/v1/work_item_events?organization_id=eq.${foreignOrg?.id}&select=id`,
      );
      record(
        "مالك منظمة QA لا يقرأ سجل منظمة أخرى بالمعرف",
        Array.isArray(crossOrg.body) && crossOrg.body.length === 0,
        `rows=${Array.isArray(crossOrg.body) ? crossOrg.body.length : -1}`,
      );
    }

    // 4) لا كتابة ولا تعديل ولا حذف لأي دور — حتى المالك والمدير
    const existing = (await eventsOf(readTask))[0];
    for (const role of ["owner", "admin", "lawyer", "legal_assistant", "viewer"] as const) {
      const ins = await asUser(acc(role).token, `/rest/v1/work_item_events`, {
        method: "POST",
        body: JSON.stringify({
          organization_id: org,
          item_type: "task",
          item_id: readTask,
          event: "completed",
          actor_id: acc(role).userId,
        }),
      });
      record(
        `دور ${role} لا يستطيع إدراج حدث يدوياً`,
        ins.status >= 400,
        `status=${ins.status}`,
      );

      if (existing) {
        const upd = await asUser(
          acc(role).token,
          `/rest/v1/work_item_events?id=eq.${existing.id}`,
          {
            method: "PATCH",
            headers: { Prefer: "return=representation" },
            body: JSON.stringify({ event: "note" }),
          },
        );
        const updBlocked =
          upd.status >= 400 || (Array.isArray(upd.body) && upd.body.length === 0);
        record(`دور ${role} لا يستطيع تعديل حدث قائم`, updBlocked, `status=${upd.status}`);

        const del = await asUser(
          acc(role).token,
          `/rest/v1/work_item_events?id=eq.${existing.id}`,
          { method: "DELETE", headers: { Prefer: "return=representation" } },
        );
        const delBlocked =
          del.status >= 400 || (Array.isArray(del.body) && del.body.length === 0);
        record(`دور ${role} لا يستطيع حذف حدث قائم`, delBlocked, `status=${del.status}`);
      }
    }

    // 5) السجل بقي سليماً بعد كل محاولات الكتابة
    const after = await eventsOf(readTask);
    record(
      "السجل لم يتغيّر بعد محاولات الكتابة والتعديل والحذف",
      after.length === 1 && after[0]?.event === "created" && after[0]?.id === existing?.id,
      `events=${after.map((e) => e.event).join(",") || "لا شيء"}`,
    );

    await adminFetch(`${SUPABASE_URL}/rest/v1/tasks?id=eq.${readTask}`, { method: "DELETE" });
  }

  if (foreignOrg) {
    if (foreignTask)
      await adminFetch(`${SUPABASE_URL}/rest/v1/tasks?id=eq.${foreignTask}`, { method: "DELETE" });
    await adminFetch(`${SUPABASE_URL}/rest/v1/cases?organization_id=eq.${foreignOrg.id}`, {
      method: "DELETE",
    });
    await adminFetch(`${SUPABASE_URL}/rest/v1/clients?organization_id=eq.${foreignOrg.id}`, {
      method: "DELETE",
    });
    await adminFetch(`${SUPABASE_URL}/rest/v1/organizations?id=eq.${foreignOrg.id}`, {
      method: "DELETE",
    });
  }
}

const fail = results.filter((r) => !r.pass);

// تنظيف بيانات حقن العطل وأعطالها (مفتاح الخدمة — تنظيف QA فقط)
for (const { table, id } of faultIds) {
  await adminFetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, { method: "DELETE" });
  await adminFetch(
    `${SUPABASE_URL}/rest/v1/system_failures?action=eq.work_item_events.capture&metadata->>item_id=eq.${id}`,
    { method: "DELETE" },
  );
}

console.log(`\nالنتيجة: ${results.length - fail.length} PASS / ${fail.length} FAIL`);
if (fail.length) {
  for (const f of fail) console.log(`  FAIL — ${f.name} :: ${f.detail}`);
  process.exit(1);
}
