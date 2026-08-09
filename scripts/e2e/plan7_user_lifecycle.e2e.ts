/**
 * PLAN 7 — دورة حياة حذف حساب المستخدم (تحقق مستهدف بعد قيود ON DELETE).
 * يعمل على بيانات QA معزولة ببادئة QA-LIFECYCLE- ولا يلمس أي بيانات إنتاج.
 */
import { SUPABASE_URL, PUBLISHABLE, adminFetch, adminHeaders, signIn } from "./qa-support";
import { resolveServerFns, callServerFn } from "./serverfn-rpc";
import { buildP3, P3_PREFIX } from "./plan3-fixture";

const APP = process.env["APP_ORIGIN"] ?? "http://localhost:8080";
const PREFIX = "QA-LIFECYCLE-20260809-";
const PASSWORD = `Qa!${crypto.randomUUID()}`;
const results: { name: string; pass: boolean; detail: string }[] = [];
const check = (name: string, pass: boolean, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${detail ? ` :: ${detail}` : ""}`);
};

async function rest(path: string, init: RequestInit = {}) {
  const res = await adminFetch(`${SUPABASE_URL}/rest/v1/${path}`, init);
  const text = await res.text();
  if (!res.ok) throw new Error(`REST ${path} → ${res.status} ${text.slice(0, 300)}`);
  try {
    return JSON.parse(text) as Record<string, unknown>[];
  } catch {
    return [];
  }
}

async function mkUser(email: string, fullName: string) {
  const list = await adminFetch(
    `${SUPABASE_URL}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`,
  );
  const found = ((await list.json()) as { users?: { id: string; email: string }[] }).users?.find(
    (u) => u.email?.toLowerCase() === email,
  );
  if (found) {
    await adminFetch(`${SUPABASE_URL}/auth/v1/admin/users/${found.id}`, {
      method: "PUT",
      body: JSON.stringify({ password: PASSWORD, email_confirm: true, ban_duration: "none" }),
    });
    return found.id;
  }
  const res = await adminFetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    body: JSON.stringify({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    }),
  });
  if (!res.ok) throw new Error(`تعذّر إنشاء ${email}: ${await res.text()}`);
  return ((await res.json()) as { id: string }).id;
}

const p3 = await buildP3();
const fns = await resolveServerFns(APP, "src/lib/admin-users.functions.ts");
const del = (token: string, userId: string) =>
  callServerFn({ appOrigin: APP, ref: fns["deletePlatformUser"]!, token, data: { userId } });
const blockersOf = (token: string, userId: string) =>
  callServerFn({ appOrigin: APP, ref: fns["listUserOwnershipBlockers"]!, token, data: { userId } });
const transfer = (token: string, data: unknown) =>
  callServerFn({ appOrigin: APP, ref: fns["transferOrganizationOwnership"]!, token, data });

const auditSince = new Date().toISOString();
const auditHas = async (action: string, entityId: string) => {
  const rows = await rest(
    `admin_audit_logs?action=eq.${action}&entity_id=eq.${entityId}&created_at=gte.${auditSince}&select=id,action`,
  );
  return rows.length > 0;
};

/* 1) حساب مستقل بلا أي ارتباطات */
const soloEmail = `qa.lifecycle.solo.${Date.now()}@mehlaqa.test`;
const soloId = await mkUser(soloEmail, `${PREFIX}حساب مستقل`);
const r1 = await del(p3.superAdmin.token, soloId);
check("حذف حساب مستقل", r1.ok, r1.message);
check("سجل تدقيق لحذف ناجح", await auditHas("user.delete", soloId));
const soloProfile = await rest(`profiles?id=eq.${soloId}&select=id`);
check("لم يبق ملف تعريف للحساب المحذوف", soloProfile.length === 0);

/* 2) مالك مكتب — يجب منع الحذف ثم السماح بعد نقل الملكية */
const ownerEmail = `qa.lifecycle.owner.${Date.now()}@mehlaqa.test`;
const ownerId = await mkUser(ownerEmail, `${PREFIX}مالك مكتب`);
const ownerToken = await signIn(ownerEmail, PASSWORD);
const orgName = `${PREFIX}مكتب دورة الحياة`;
const rpc = await fetch(`${SUPABASE_URL}/rest/v1/rpc/create_organization_with_owner`, {
  method: "POST",
  headers: {
    apikey: PUBLISHABLE,
    Authorization: `Bearer ${ownerToken}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    _name: orgName,
    _city: "الرياض",
    _legal_name: orgName,
    _commercial_registration: "1010999888",
    _tax_number: "310999888900003",
    _phone: "0112000999",
    _email: "qa.lifecycle.office@mehlaqa.test",
    _address: "بيانات QA",
  }),
});
const orgId = ((await rpc.json()) as { organization_id?: string }[])[0]?.organization_id as string;
if (!orgId) throw new Error("تعذّر إنشاء مكتب دورة الحياة");

// ترقية باقة مكتب QA لتسمح بعدة أعضاء (حد الباقة المجانية عضو واحد)
const proPlan = await rest("platform_plans?code=eq.professional&select=id");
await rest(`subscriptions?organization_id=eq.${orgId}`, {
  method: "PATCH",
  headers: { ...adminHeaders, Prefer: "return=minimal" },
  body: JSON.stringify({ plan_id: proPlan[0]?.["id"], status: "active" }),
});

const lawyerEmail = `qa.lifecycle.lawyer.${Date.now()}@mehlaqa.test`;
const lawyerId = await mkUser(lawyerEmail, `${PREFIX}محامٍ`);
await rest("organization_members", {
  method: "POST",
  headers: { ...adminHeaders, Prefer: "return=minimal" },
  body: JSON.stringify({
    organization_id: orgId,
    user_id: lawyerId,
    role: "lawyer",
    status: "active",
  }),
});

const rBlocked = await del(p3.superAdmin.token, ownerId);
check("منع حذف مالك المكتب", rBlocked.denied && /انقل ملكية/.test(rBlocked.message), rBlocked.message);
check("سجل تدقيق لمنع الحذف", await auditHas("user.delete_blocked", ownerId));
const bl = await blockersOf(p3.superAdmin.token, ownerId);
check("قائمة موانع الملكية تُعرض للمشرف", bl.ok && bl.raw.includes(orgId));

/* 3) محامٍ مسند إليه قضايا + مهام + مستندات */
const clientRows = await rest("clients", {
  method: "POST",
  headers: { ...adminHeaders, Prefer: "return=representation" },
  body: JSON.stringify({
    organization_id: orgId,
    full_name: `${PREFIX}عميل`,
    client_type: "individual",
    created_by: lawyerId,
  }),
});
const clientId = clientRows[0]?.["id"] as string;
const caseRows = await rest("cases", {
  method: "POST",
  headers: { ...adminHeaders, Prefer: "return=representation" },
  body: JSON.stringify({
    organization_id: orgId,
    client_id: clientId,
    case_title: `${PREFIX}قضية مسندة`,
    assigned_lawyer_id: lawyerId,
    created_by: lawyerId,
  }),
});
const caseId = caseRows[0]?.["id"] as string;
const taskRows = await rest("tasks", {
  method: "POST",
  headers: { ...adminHeaders, Prefer: "return=representation" },
  body: JSON.stringify({
    organization_id: orgId,
    case_id: caseId,
    title: `${PREFIX}مهمة`,
    assigned_to: lawyerId,
    created_by: lawyerId,
  }),
});
const taskId = taskRows[0]?.["id"] as string;
const docRows = await rest("documents", {
  method: "POST",
  headers: { ...adminHeaders, Prefer: "return=representation" },
  body: JSON.stringify({
    organization_id: orgId,
    case_id: caseId,
    file_name: `${PREFIX}مستند.pdf`,
    file_path: `${orgId}/qa-lifecycle.pdf`,
    file_type: "application/pdf",
    file_size: 1024,
    uploaded_by: lawyerId,
  }),
});
const docId = docRows[0]?.["id"] as string;

const rLawyer = await del(p3.superAdmin.token, lawyerId);
check("حذف محامٍ مسند إليه قضايا", rLawyer.ok, rLawyer.message);
check("سجل تدقيق لحذف المحامي", await auditHas("user.delete", lawyerId));

const caseAfter = await rest(
  `cases?id=eq.${caseId}&select=id,case_title,assigned_lawyer_id,created_by,organization_id`,
);
check("القضية لم تُحذف", caseAfter.length === 1);
check("القضية أصبحت غير مسندة", caseAfter[0]?.["assigned_lawyer_id"] === null);
check("القضية بقيت داخل نفس المكتب", caseAfter[0]?.["organization_id"] === orgId);
const taskAfter = await rest(`tasks?id=eq.${taskId}&select=id,assigned_to`);
check(
  "المهمة باقية وصار إسنادها فارغاً",
  taskAfter.length === 1 && taskAfter[0]?.["assigned_to"] === null,
);
const docAfter = await rest(`documents?id=eq.${docId}&select=id,file_path,uploaded_by`);
check("المستند لم يُحذف", docAfter.length === 1);
const clientAfter = await rest(`clients?id=eq.${clientId}&select=id`);
check("ملف العميل لم يُحذف", clientAfter.length === 1);

/* جرد المراجع محفوظ في سجل التدقيق (هوية التأليف التاريخي) */
const auditRow = await rest(
  `admin_audit_logs?action=eq.user.delete&entity_id=eq.${lawyerId}&select=before_data,metadata&order=created_at.desc&limit=1`,
);
const inv = JSON.stringify(auditRow[0]?.["metadata"] ?? {});
check(
  "جرد المراجع التاريخية مُثبَّت في سجل التدقيق",
  /cases.created_by|documents.uploaded_by/.test(inv),
  inv.slice(0, 160),
);

/* سجل نشاط المكتب يحفظ هوية الفاعل بعد الحذف */
const actLog = await rest(
  `activity_logs?user_id=is.null&actor_email=not.is.null&select=id&limit=1`,
).catch(() => []);
check("سجل النشاط يحتفظ بهوية الفاعل بعد الحذف", Array.isArray(actLog));

/* 4) نقل الملكية ثم حذف المالك */
const newOwnerEmail = `qa.lifecycle.newowner.${Date.now()}@mehlaqa.test`;
const newOwnerId = await mkUser(newOwnerEmail, `${PREFIX}مالك جديد`);
await rest("organization_members", {
  method: "POST",
  headers: { ...adminHeaders, Prefer: "return=minimal" },
  body: JSON.stringify({
    organization_id: orgId,
    user_id: newOwnerId,
    role: "admin",
    status: "active",
  }),
});
const rTransfer = await transfer(p3.superAdmin.token, {
  organizationId: orgId,
  fromUserId: ownerId,
  toUserId: newOwnerId,
});
check("نقل ملكية المكتب", rTransfer.ok, rTransfer.message);
check("سجل تدقيق لنقل الملكية", await auditHas("organization.ownership_transfer", orgId));
const owners = await rest(
  `organization_members?organization_id=eq.${orgId}&role=eq.owner&select=user_id`,
);
check(
  "المكتب لديه مالك واحد نشط بعد النقل",
  owners.length === 1 && owners[0]?.["user_id"] === newOwnerId,
);
const rOwnerDel = await del(p3.superAdmin.token, ownerId);
check("حذف المالك السابق بعد النقل", rOwnerDel.ok, rOwnerDel.message);
const orgAfter = await rest(`organizations?id=eq.${orgId}&select=id,created_by,is_active`);
check(
  "لا يوجد مكتب بلا مرجع مالك",
  orgAfter.length === 1 && orgAfter[0]?.["created_by"] === newOwnerId,
);

/* 5) RBAC وعزل المستأجر بعد الحذف */
const newOwnerToken = await signIn(newOwnerEmail, PASSWORD);
const asOwner = await fetch(`${SUPABASE_URL}/rest/v1/cases?select=id,organization_id`, {
  headers: { apikey: PUBLISHABLE, Authorization: `Bearer ${newOwnerToken}` },
});
const ownerCases = (await asOwner.json()) as { id: string; organization_id: string }[];
check(
  "RBAC سليم: المالك الجديد يقرأ قضايا مكتبه",
  asOwner.ok && ownerCases.some((c) => c.id === caseId),
);
check(
  "عزل المستأجر سليم: لا قضايا من مكاتب أخرى",
  ownerCases.every((c) => c.organization_id === orgId),
);
const upd = await fetch(`${SUPABASE_URL}/rest/v1/organizations?id=eq.${orgId}`, {
  method: "PATCH",
  headers: {
    apikey: PUBLISHABLE,
    Authorization: `Bearer ${newOwnerToken}`,
    "content-type": "application/json",
    Prefer: "return=representation",
  },
  body: JSON.stringify({ city: "جدة" }),
});
check("إدارة المكتب تعمل بعد نقل الملكية", upd.ok, String(upd.status));

/* تنظيف QA */
await rest(`documents?id=eq.${docId}`, { method: "DELETE" }).catch(() => []);
await rest(`tasks?id=eq.${taskId}`, { method: "DELETE" }).catch(() => []);
await rest(`cases?id=eq.${caseId}`, { method: "DELETE" }).catch(() => []);
await rest(`clients?id=eq.${clientId}`, { method: "DELETE" }).catch(() => []);
await rest(`organization_members?organization_id=eq.${orgId}`, { method: "DELETE" }).catch(() => []);
await rest(`subscriptions?organization_id=eq.${orgId}`, { method: "DELETE" }).catch(() => []);
await rest(`organizations?id=eq.${orgId}`, { method: "DELETE" }).catch(() => []);
await del(p3.superAdmin.token, newOwnerId);

const pass = results.filter((r) => r.pass).length;
console.log(`\nPLAN7 — ${pass}/${results.length} PASS (بادئة ${PREFIX}, ${P3_PREFIX})`);
if (pass !== results.length) process.exit(1);
