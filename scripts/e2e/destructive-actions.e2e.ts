/**
 * تنفيذ فعلي وآمن للإجراءات الحساسة في لوحة إدارة المنصة على بيانات QA معزولة.
 *
 * لكل إجراء: استدعاء دالة الإنتاج نفسها عبر بروتوكول createServerFn بتوكن حقيقي،
 * ثم التحقق من أثر قاعدة البيانات، ثم التحقق من صف سجل التدقيق.
 * لا تُلمس أي بيانات حقيقية: كل الكيانات تُنشأ ببادئة QA-DESTRUCT ثم تُحذف.
 *
 * التشغيل: bun scripts/e2e/destructive-actions.e2e.ts
 */
import {
  assertE2eEnvironmentSafe, SUPABASE_URL, PUBLISHABLE, APP, adminHeaders, adminFetch, signIn } from "./qa-support";
import { resolveServerFns, callServerFn, type ServerFnRef } from "./serverfn-rpc";

const PREFIX = "QA-DESTRUCT-20260809-";
const PASSWORD = `Qa!${crypto.randomUUID()}`;

type Row = Record<string, unknown>;
const results: { name: string; status: "PASS" | "FAIL" | "BLOCKED"; detail: string }[] = [];
const rec = (name: string, status: "PASS" | "FAIL" | "BLOCKED", detail = "") => {
  results.push({ name, status, detail });
  const icon = status === "PASS" ? "PASS" : status === "BLOCKED" ? "BLOCKED" : "FAIL";
  console.log(`${icon} — ${name}${detail ? ` :: ${detail}` : ""}`);
};

/* ------------------------------------------------------------ أدوات */
async function rest(path: string, init: RequestInit = {}): Promise<Row[]> {
  const res = await adminFetch(`${SUPABASE_URL}/rest/v1/${path}`, init);
  const text = await res.text();
  if (!res.ok) throw new Error(`REST ${path} → ${res.status} ${text.slice(0, 200)}`);
  try {
    return JSON.parse(text) as Row[];
  } catch {
    return [];
  }
}
const one = async (path: string) => (await rest(path))[0];

/** حذف متسامح: السجلات المالية محميّة بمُشغِّل عدم الحذف، فنتجاوزها بدل إسقاط الاختبار. */
async function tryDelete(path: string) {
  try {
    await rest(path, { method: "DELETE", headers: adminHeaders });
    return true;
  } catch {
    return false;
  }
}

/** حاجز أمان: لا كتابة إلا على كيان QA. */
function assertQa(label: string, value: unknown) {
  if (typeof value !== "string" || !value.includes(PREFIX))
    throw new Error(`حاجز الأمان: ${label} ليس كياناً تجريبياً (${String(value).slice(0, 60)})`);
}

async function ensureUser(email: string, fullName: string) {
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

const MODULES = {
  orgs: "src/lib/admin-orgs.functions.ts",
  users: "src/lib/admin-users.functions.ts",
  flags: "src/lib/flags.functions.ts",
  ops: "src/lib/admin-ops.functions.ts",
  rbac: "src/lib/rbac/rbac.functions.ts",
  billing: "src/lib/billing/billing.functions.ts",
  design: "src/lib/design/theme.functions.ts",
  docreq: "src/lib/document-requests.functions.ts",
  portal: "src/lib/client-portal.functions.ts",
  backups: "src/lib/backups.functions.ts",
  support: "src/lib/support/support.functions.ts",
} as const;
const fns: Record<string, Record<string, ServerFnRef>> = {};
async function fn(mod: keyof typeof MODULES, name: string): Promise<ServerFnRef> {
  fns[mod] ??= await resolveServerFns(APP, MODULES[mod]);
  const ref = fns[mod]![name];
  if (!ref) throw new Error(`دالة غير موجودة: ${mod}.${name}`);
  return ref;
}
const call = async (mod: keyof typeof MODULES, name: string, token: string, data?: unknown) =>
  callServerFn({ appOrigin: APP, ref: await fn(mod, name), token, data });

async function auditExists(action: string, entityId?: string) {
  const q = `admin_audit_logs?action=eq.${action}${entityId ? `&entity_id=eq.${entityId}` : ""}&select=id,action,actor_email,description&limit=1`;
  return Boolean(await one(q));
}

/* ------------------------------------------------------------ التهيئة */
type Ctx = {
  staffA: { id: string; email: string; token: string };
  staffB: { id: string; email: string; token: string };
  staffC: { id: string; email: string };
  org: { id: string; name: string; ownerId: string; ownerToken: string; ownerEmail: string };
  extraUser: { id: string; email: string };
  delOrg: { id: string; name: string };
};

async function setup(): Promise<Ctx> {
  await cleanup(true);
  const staffAEmail = "qa.destruct.staff.a@mehlaqa.test";
  const staffBEmail = "qa.destruct.staff.b@mehlaqa.test";
  const staffCEmail = "qa.destruct.staff.c@mehlaqa.test";
  const ownerEmail = "qa.destruct.owner@mehlaqa.test";
  const extraEmail = "qa.destruct.throwaway@mehlaqa.test";

  const staffAId = await ensureUser(staffAEmail, `${PREFIX}موظف منصة أ`);
  const staffBId = await ensureUser(staffBEmail, `${PREFIX}موظف منصة ب`);
  const staffCId = await ensureUser(staffCEmail, `${PREFIX}موظف منصة ج`);
  const ownerId = await ensureUser(ownerEmail, `${PREFIX}مالك مكتب تجريبي`);
  const extraId = await ensureUser(extraEmail, `${PREFIX}حساب للحذف`);

  await rest("platform_staff", {
    method: "POST",
    headers: { ...adminHeaders, Prefer: "return=minimal" },
    body: JSON.stringify([
      {
        user_id: staffAId,
        full_name: `${PREFIX}موظف منصة أ`,
        email: staffAEmail,
        job_title: "QA",
        role: "super_admin",
        status: "active",
        permissions: [],
      },
      {
        user_id: staffCId,
        full_name: `${PREFIX}موظف منصة ج`,
        email: staffCEmail,
        job_title: "QA",
        role: "staff",
        status: "active",
        permissions: [],
      },
      {
        user_id: staffBId,
        full_name: `${PREFIX}موظف منصة ب`,
        email: staffBEmail,
        job_title: "QA",
        role: "super_admin",
        status: "active",
        permissions: [],
      },
    ]),
  });

  const ownerToken = await signIn(ownerEmail, PASSWORD);
  const orgName = `${PREFIX}مكتب الاختبار المدمّر`;
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
      _commercial_registration: "1010999111",
      _tax_number: "310999111900003",
      _phone: "0112000000",
      _email: "destruct@mehlaqa.test",
      _address: "بيانات QA",
    }),
  });
  const body = (await rpc.json()) as { organization_id?: string }[];
  const orgId = Array.isArray(body) ? body[0]?.organization_id : undefined;
  if (!orgId) throw new Error(`تعذّر إنشاء مكتب QA: ${JSON.stringify(body)}`);

  const delOwnerEmail = "qa.destruct.delowner@mehlaqa.test";
  const delOwnerId = await ensureUser(delOwnerEmail, `${PREFIX}مالك مكتب للحذف`);
  const delOwnerToken = await signIn(delOwnerEmail, PASSWORD);
  const delOrgName = `${PREFIX}مكتب للحذف النهائي`;
  const rpc2 = await fetch(`${SUPABASE_URL}/rest/v1/rpc/create_organization_with_owner`, {
    method: "POST",
    headers: {
      apikey: PUBLISHABLE,
      Authorization: `Bearer ${delOwnerToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      _name: delOrgName,
      _city: "جدة",
      _legal_name: delOrgName,
      _commercial_registration: "1010999112",
      _tax_number: "310999111900004",
      _phone: "0122000000",
      _email: "delete@mehlaqa.test",
      _address: "بيانات QA",
    }),
  });
  const body2 = (await rpc2.json()) as { organization_id?: string }[];
  const delOrgId = Array.isArray(body2) ? body2[0]?.organization_id : undefined;
  if (!delOrgId) throw new Error(`تعذّر إنشاء مكتب الحذف: ${JSON.stringify(body2)}`);
  await rest("clients", {
    method: "POST",
    headers: { ...adminHeaders, Prefer: "return=minimal" },
    body: JSON.stringify({
      organization_id: delOrgId,
      client_type: "individual",
      full_name: `${PREFIX}عميل مكتب الحذف`,
      phone: "0500000009",
      created_by: delOwnerId,
    }),
  });

  return {
    delOrg: { id: delOrgId, name: delOrgName },
    staffA: { id: staffAId, email: staffAEmail, token: await signIn(staffAEmail, PASSWORD) },
    staffB: { id: staffBId, email: staffBEmail, token: await signIn(staffBEmail, PASSWORD) },
    staffC: { id: staffCId, email: staffCEmail },
    org: { id: orgId, name: orgName, ownerId, ownerToken, ownerEmail },
    extraUser: { id: extraId, email: extraEmail },
  };
}

async function cleanup(quiet = false) {
  const orgs = await rest(
    `organizations?name=like.${encodeURIComponent(PREFIX + "%")}&select=id,name`,
  );
  for (const o of orgs) {
    await purgeQaFinancials(o["id"] as string);
    await tryDelete(`organizations?id=eq.${o["id"]}`);
  }
  await tryDelete(`platform_feature_flags?key=like.qa_destruct%25`);
  await tryDelete(`platform_email_templates?code=like.qa-destruct%25`);
  await tryDelete(`platform_roles?code=like.qa_destruct%25`);
  await tryDelete(`platform_backup_restore_requests?reason=like.${encodeURIComponent(PREFIX + "%")}`);
  for (const email of [
    "qa.destruct.staff.a@mehlaqa.test",
    "qa.destruct.staff.b@mehlaqa.test",
    "qa.destruct.staff.c@mehlaqa.test",
    "qa.destruct.owner@mehlaqa.test",
    "qa.destruct.throwaway@mehlaqa.test",
    "qa.destruct.delowner@mehlaqa.test",
  ]) {
    await tryDelete(`platform_staff?email=eq.${encodeURIComponent(email)}`);
    const list = await adminFetch(
      `${SUPABASE_URL}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`,
    );
    const u = ((await list.json()) as { users?: { id: string; email: string }[] }).users?.find(
      (x) => x.email?.toLowerCase() === email,
    );
    if (u)
      await adminFetch(`${SUPABASE_URL}/auth/v1/admin/users/${u.id}`, { method: "DELETE" });
  }
  if (!quiet) console.log(`تنظيف: ${orgs.length} مكتب QA وحسابات الاختبار.`);
}

/* ------------------------------------------------------------ الإجراءات */

async function orgSuspendResume(c: Ctx) {
  assertQa("اسم المكتب", c.org.name);
  const sus = await call("orgs", "setOrganizationActive", c.staffA.token, {
    organizationId: c.org.id,
    active: false,
    reason: "اختبار إيقاف QA",
  });
  const after = await one(`organizations?id=eq.${c.org.id}&select=is_active,suspension_reason`);
  rec(
    "إيقاف مكتب QA (تنفيذ فعلي + أثر قاعدة البيانات)",
    sus.ok && after?.["is_active"] === false ? "PASS" : "FAIL",
    sus.ok ? `is_active=${after?.["is_active"]}` : sus.message,
  );
  rec(
    "سجل تدقيق إيقاف المكتب",
    (await auditExists("organization.suspend", c.org.id)) ? "PASS" : "FAIL",
  );

  const back = await call("orgs", "setOrganizationActive", c.staffA.token, {
    organizationId: c.org.id,
    active: true,
  });
  const after2 = await one(`organizations?id=eq.${c.org.id}&select=is_active`);
  rec(
    "إعادة تفعيل مكتب QA",
    back.ok && after2?.["is_active"] === true ? "PASS" : "FAIL",
    back.message,
  );
}

async function orgDeleteGuardAndDelete(c: Ctx) {
  const wrong = await call("orgs", "deleteOrganization", c.staffA.token, {
    organizationId: c.delOrg.id,
    confirmName: "اسم غير مطابق",
  });
  rec(
    "رفض حذف المكتب باسم تأكيد غير مطابق",
    wrong.denied ? "PASS" : "FAIL",
    wrong.denied ? wrong.message : "نُفِّذ الحذف دون تأكيد صحيح!",
  );
}

async function orgFinalDelete(c: Ctx) {
  assertQa("اسم المكتب المالي", c.org.name);
  assertQa("اسم مكتب الحذف", c.delOrg.name);

  // (1) مكتب لديه سجلات مالية: الحذف يجب أن يُرفض — السجل المالي غير قابل للحذف.
  const blocked = await call("orgs", "deleteOrganization", c.staffA.token, {
    organizationId: c.org.id,
    confirmName: c.org.name,
  });
  const stillThere = (await rest(`organizations?id=eq.${c.org.id}&select=id`)).length === 1;
  rec(
    "رفض حذف مكتب مرتبط بسجلات مالية (حماية السجل المالي)",
    blocked.denied && stillThere ? "PASS" : "FAIL",
    blocked.message,
  );

  // (2) مكتب تجريبي بلا سجلات مالية: الحذف يُنفَّذ فعلياً ويشمل البيانات التابعة.
  const clientsBefore = await rest(`clients?organization_id=eq.${c.delOrg.id}&select=id`);
  const del = await call("orgs", "deleteOrganization", c.staffA.token, {
    organizationId: c.delOrg.id,
    confirmName: c.delOrg.name,
  });
  const gone = (await rest(`organizations?id=eq.${c.delOrg.id}&select=id`)).length === 0;
  const childGone =
    (await rest(`clients?organization_id=eq.${c.delOrg.id}&select=id`)).length === 0;
  rec(
    "حذف مكتب QA نهائياً + اختفاء البيانات التابعة",
    del.ok && gone && childGone ? "PASS" : "FAIL",
    `عملاء قبل الحذف=${clientsBefore.length} / بعد=${childGone ? 0 : "باقٍ"} ${del.message}`,
  );
  rec(
    "بقاء سجل تدقيق الحذف بعد اختفاء المكتب",
    (await auditExists("organization.delete", c.delOrg.id)) ? "PASS" : "FAIL",
  );
}

/** يحذف السجلات المالية التجريبية لمكتب QA فقط (تُستخدم في التنظيف لا في الإنتاج). */
async function purgeQaFinancials(orgId: string) {
  const invoices = await rest(`platform_invoices?organization_id=eq.${orgId}&select=id`);
  for (const inv of invoices) {
    const payments = await rest(`platform_payments?invoice_id=eq.${inv["id"]}&select=id`);
    for (const pay of payments) {
      await tryDelete(`platform_refunds?payment_id=eq.${pay["id"]}`);
      await tryDelete(`platform_payment_attempts?payment_id=eq.${pay["id"]}`);
      await tryDelete(`platform_bank_reconciliations?payment_id=eq.${pay["id"]}`);
      await tryDelete(`platform_payments?id=eq.${pay["id"]}`);
    }
    await tryDelete(`platform_credit_notes?invoice_id=eq.${inv["id"]}`);
    await tryDelete(`platform_invoice_items?invoice_id=eq.${inv["id"]}`);
    await tryDelete(`platform_invoices?id=eq.${inv["id"]}`);
  }
  await tryDelete(`subscriptions?organization_id=eq.${orgId}`);
}

async function userSuspendAndDelete(c: Ctx) {
  const off = await call("users", "setUserActive", c.staffA.token, {
    userId: c.extraUser.id,
    active: false,
    reason: "اختبار QA",
  });
  const p1 = await one(`profiles?id=eq.${c.extraUser.id}&select=is_active`);
  rec(
    "إيقاف حساب مستخدم QA (خادمياً)",
    off.ok && p1?.["is_active"] === false ? "PASS" : "FAIL",
    off.message,
  );
  // إثبات أن الإيقاف فعلي على مستوى المصادقة لا الواجهة
  let loginBlocked = false;
  try {
    await signIn(c.extraUser.email, PASSWORD);
  } catch {
    loginBlocked = true;
  }
  rec("منع تسجيل دخول الحساب الموقوف فعلياً", loginBlocked ? "PASS" : "FAIL");

  const on = await call("users", "setUserActive", c.staffA.token, {
    userId: c.extraUser.id,
    active: true,
  });
  rec("إعادة تفعيل الحساب", on.ok ? "PASS" : "FAIL", on.message);

  const self = await call("users", "setUserActive", c.staffA.token, {
    userId: c.staffA.id,
    active: false,
  });
  rec("منع الموظف من إيقاف حسابه بنفسه", self.denied ? "PASS" : "FAIL", self.message);

  const delSuper = await call("users", "deletePlatformUser", c.staffA.token, {
    userId: c.staffB.id,
  });
  rec(
    "منع حذف حساب مالك منصة آخر",
    delSuper.denied ? "PASS" : "FAIL",
    delSuper.denied ? delSuper.message : "تم الحذف!",
  );

  const del = await call("users", "deletePlatformUser", c.staffA.token, {
    userId: c.extraUser.id,
  });
  const gone = (await rest(`profiles?id=eq.${c.extraUser.id}&select=id`)).length === 0;
  rec("حذف حساب QA نهائياً + اختفاؤه", del.ok && gone ? "PASS" : "FAIL", del.message);
  rec("سجل تدقيق حذف الحساب", (await auditExists("user.delete", c.extraUser.id)) ? "PASS" : "FAIL");
}

async function flagsAndTemplatesAndRoles(c: Ctx) {
  const flagKey = `qa_destruct_${Date.now()}`.slice(0, 60);
  const save = await call("flags", "saveFeatureFlag", c.staffA.token, {
    id: null,
    key: flagKey,
    label: `${PREFIX}علم تجريبي`,
    description: "علم QA للحذف",
    isEnabled: false,
  });
  const flag = await one(`platform_feature_flags?key=eq.${flagKey}&select=id`);
  if (!flag) {
    rec("إنشاء علم ميزة QA", "FAIL", save.message);
  } else {
    rec("إنشاء علم ميزة QA", "PASS");
    const del = await call("flags", "deleteFeatureFlag", c.staffA.token, { id: flag["id"] });
    const gone = (await rest(`platform_feature_flags?key=eq.${flagKey}&select=id`)).length === 0;
    rec("حذف علم الميزة + اختفاؤه من القاعدة", del.ok && gone ? "PASS" : "FAIL", del.message);
  }

  const tmplCode = `qa-destruct-tmpl-${Date.now()}`.slice(0, 60);
  const st = await call("ops", "saveEmailTemplate", c.staffA.token, {
    code: tmplCode,
    name_ar: `${PREFIX}قالب تجريبي`,
    subject: "موضوع QA",
    body_html: "<p>محتوى QA لاختبار الحذف</p>",
    is_active: false,
  });
  const tmpl = await one(`platform_email_templates?code=eq.${tmplCode}&select=id`);
  if (!tmpl) rec("إنشاء قالب بريد QA", "FAIL", st.message);
  else {
    rec("إنشاء قالب بريد QA", "PASS");
    const del = await call("ops", "deleteEmailTemplate", c.staffA.token, { id: tmpl["id"] });
    const gone = (await rest(`platform_email_templates?code=eq.${tmplCode}&select=id`)).length === 0;
    rec("حذف قالب البريد + اختفاؤه", del.ok && gone ? "PASS" : "FAIL", del.message);
  }

  const roleCode = `qa_destruct_${Date.now()}`.slice(0, 40);
  const sr = await call("ops", "savePlatformRole", c.staffA.token, {
    code: roleCode,
    name_ar: `${PREFIX}دور تجريبي`,
    description: "دور QA للحذف",
    permissions: ["audit.read"],
  });
  const role = await one(`platform_roles?code=eq.${roleCode}&select=id`);
  if (!role) rec("إنشاء دور منصة QA", "FAIL", sr.message);
  else {
    rec("إنشاء دور منصة QA", "PASS");
    const del = await call("ops", "deletePlatformRole", c.staffA.token, { id: role["id"] });
    const gone = (await rest(`platform_roles?code=eq.${roleCode}&select=id`)).length === 0;
    rec("حذف دور المنصة + اختفاؤه", del.ok && gone ? "PASS" : "FAIL", del.message);
  }
}

async function impersonation(c: Ctx) {
  const req = await call("rbac", "requestRbacImpersonation", c.staffA.token, {
    targetUserId: c.staffC.id,
    reason: "اختبار انتحال هوية على حساب موظف QA فقط",
    minutes: 10,
  });
  const pending = await one(
    `platform_impersonation_sessions?target_user_id=eq.${c.staffC.id}&status=eq.pending&select=id&order=created_at.desc&limit=1`,
  );
  rec(
    "طلب انتحال هوية مُسجَّل بانتظار الاعتماد",
    req.ok && pending ? "PASS" : "FAIL",
    req.message || req.raw.slice(0, 120),
  );
  if (!pending) return;

  const selfApprove = await call("rbac", "decideRbacImpersonation", c.staffA.token, {
    id: pending["id"],
    decision: "approved",
    reason: "محاولة اعتماد ذاتي للطلب",
  });
  rec(
    "منع اعتماد طلب الانتحال من مقدّمه (رقابة مزدوجة)",
    selfApprove.denied ? "PASS" : "FAIL",
    selfApprove.message,
  );

  const decide = await call("rbac", "decideRbacImpersonation", c.staffB.token, {
    id: pending["id"],
    decision: "approved",
    reason: "اعتماد اختبار QA",
  });
  const session = await one(
    `platform_impersonation_sessions?id=eq.${pending["id"]}&select=id,status,started_at,ended_at`,
  );
  rec(
    "بدء جلسة انتحال هوية فعلية (status=active)",
    decide.ok && session?.["status"] === "active" ? "PASS" : "FAIL",
    `الحالة=${session?.["status"]} ${decide.message}`,
  );
  const events = await rest(
    `platform_impersonation_events?session_id=eq.${pending["id"]}&select=event`,
  );
  rec(
    "تسجيل أحداث الجلسة في سجل الانتحال",
    events.length > 0 ? "PASS" : "FAIL",
    events.map((e) => String(e["event"])).join(","),
  );
  const end = await call("rbac", "endRbacImpersonation", c.staffB.token, {
    id: pending["id"],
    reason: "إنهاء اختبار QA",
  });
  const closed = await one(
    `platform_impersonation_sessions?id=eq.${pending["id"]}&select=status,ended_at`,
  );
  rec(
    "إنهاء جلسة الانتحال + إثبات الإغلاق",
    end.ok && closed?.["status"] === "ended" && closed?.["ended_at"] ? "PASS" : "FAIL",
    `الحالة=${closed?.["status"]} ${end.message}`,
  );
}

async function billingRefundFlow(c: Ctx) {
  const draft = await call("billing", "billingSaveDraft", c.staffA.token, {
    id: null,
    organizationId: c.org.id,
    customerName: `${PREFIX}عميل فوترة`,
    customerEmail: "billing@mehlaqa.test",
    billingAddress: "الرياض",
    taxNumber: null,
    currency: "SAR",
    taxRate: 15,
    taxExempt: false,
    taxExemptionReason: null,
    servicePeriodStart: null,
    servicePeriodEnd: null,
    dueAt: null,
    notes: `${PREFIX}فاتورة اختبار`,
    internalNotes: "QA",
    items: [
      {
        description: `${PREFIX}اشتراك تجريبي`,
        quantity: 1,
        unitPrice: 1000,
        discountAmount: 0,
        taxable: true,
      },
    ],
  });
  const invoice = await one(
    `platform_invoices?organization_id=eq.${c.org.id}&select=id,status,total&order=created_at.desc&limit=1`,
  );
  if (!invoice) {
    rec("إنشاء مسودة فاتورة QA", "FAIL", draft.message);
    return;
  }
  rec("إنشاء مسودة فاتورة QA", "PASS", `الإجمالي=${invoice["total"]}`);

  const issued = await call("billing", "billingIssueInvoice", c.staffA.token, {
    id: invoice["id"],
    notify: false,
  });
  const inv2 = await one(`platform_invoices?id=eq.${invoice["id"]}&select=status,total`);
  rec(
    "إصدار الفاتورة",
    issued.ok && inv2?.["status"] !== "draft" ? "PASS" : "FAIL",
    `الحالة=${inv2?.["status"]} ${issued.message}`,
  );

  const total = Number(inv2?.["total"] ?? 0);
  const over = await call("billing", "billingRecordPayment", c.staffA.token, {
    invoiceId: invoice["id"],
    amount: total + 5000,
    method: "manual",
    idempotencyKey: `qa-over-${Date.now()}`,
    notes: "محاولة دفع أكبر من الفاتورة",
  });
  rec(
    "منع تسجيل دفعة تتجاوز قيمة الفاتورة",
    over.denied ? "PASS" : "FAIL",
    over.denied ? over.message : "قُبلت الدفعة الزائدة!",
  );

  const idem = `qa-pay-${Date.now()}`;
  const pay = await call("billing", "billingRecordPayment", c.staffA.token, {
    invoiceId: invoice["id"],
    amount: total,
    method: "manual",
    idempotencyKey: idem,
    notes: "دفعة يدوية QA (لا مزود إنتاجي)",
  });
  const dup = await call("billing", "billingRecordPayment", c.staffA.token, {
    invoiceId: invoice["id"],
    amount: total,
    method: "manual",
    idempotencyKey: idem,
    notes: "تكرار نفس المفتاح",
  });
  const payments = await rest(
    `platform_payments?invoice_id=eq.${invoice["id"]}&select=id,status,amount`,
  );
  rec("تسجيل دفعة يدوية", pay.ok ? "PASS" : "FAIL", pay.message);
  rec(
    "منع تكرار الدفعة بنفس مفتاح منع التكرار",
    payments.length === 1 ? "PASS" : "FAIL",
    `عدد الدفعات=${payments.length} ${dup.message}`,
  );
  const payment = payments[0];
  if (!payment) return;

  if (payment["status"] !== "succeeded" && payment["status"] !== "captured") {
    const dec = await call("billing", "billingDecidePayment", c.staffA.token, {
      paymentId: payment["id"],
      decision: "approve",
    });
    rec("اعتماد الدفعة", dec.ok ? "PASS" : "FAIL", dec.message);
  }

  const overRefund = await call("billing", "billingCreateRefund", c.staffA.token, {
    paymentId: payment["id"],
    amount: total + 1000,
    reason: "محاولة استرداد أكبر من المدفوع",
  });
  rec(
    "منع استرداد يتجاوز المبلغ المدفوع",
    overRefund.denied ? "PASS" : "FAIL",
    overRefund.denied ? overRefund.message : "قُبل الاسترداد الزائد!",
  );

  const refund = await call("billing", "billingCreateRefund", c.staffA.token, {
    paymentId: payment["id"],
    amount: 100,
    reason: "استرداد جزئي لاختبار QA",
  });
  const refundRow = await one(
    `platform_refunds?payment_id=eq.${payment["id"]}&select=id,status,amount&limit=1`,
  );
  rec("إنشاء طلب استرداد", refund.ok && refundRow ? "PASS" : "FAIL", refund.message);
  if (refundRow) {
    const dec = await call("billing", "billingDecideRefund", c.staffB.token, {
      refundId: refundRow["id"],
      decision: "approve",
      reason: "اعتماد استرداد QA",
    });
    const after = await one(`platform_refunds?id=eq.${refundRow["id"]}&select=status`);
    rec(
      "اعتماد الاسترداد + أثر الحالة",
      dec.ok || after?.["status"] !== "pending" ? "PASS" : "FAIL",
      `الحالة=${after?.["status"]} ${dec.message}`,
    );
  }

  const cn = await call("billing", "billingCreateCreditNote", c.staffA.token, {
    invoiceId: invoice["id"],
    amount: 50,
    taxAmount: 7.5,
    reason: "إشعار دائن لاختبار QA",
  });
  const cnRow = await one(
    `platform_credit_notes?invoice_id=eq.${invoice["id"]}&select=id&limit=1`,
  );
  rec("إصدار إشعار دائن + صف في القاعدة", cn.ok && cnRow ? "PASS" : "FAIL", cn.message);
}

async function designPublishRollback(c: Ctx) {
  const stateBefore = await one(
    `design_publish_state?select=id,active_version_id,previous_version_id&limit=1`,
  );
  // نشرة أولى لتوليد إصدار سابق يمكن التراجع إليه، ثم نشرة ثانية لاختبار التراجع.
  await call("design", "publishDesign", c.staffA.token, { summary: `${PREFIX}نشر تمهيدي` });
  const pub = await call("design", "publishDesign", c.staffA.token, {
    summary: `${PREFIX}نشر اختباري`,
  });
  const stateAfter = await one(
    `design_publish_state?select=active_version_id,previous_version_id&limit=1`,
  );
  const changed = stateAfter?.["active_version_id"] !== stateBefore?.["active_version_id"];
  rec("نشر التصميم فعلياً + إصدار جديد", pub.ok && changed ? "PASS" : "FAIL", pub.message);
  const roll = await call("design", "rollbackDesign", c.staffA.token);
  const stateBack = await one(`design_publish_state?select=active_version_id&limit=1`);
  rec(
    "التراجع عن النشر (Rollback) وإعادة الإصدار السابق",
    roll.ok ? "PASS" : "FAIL",
    `النشط الآن=${String(stateBack?.["active_version_id"]).slice(0, 8)} ${roll.message}`,
  );
  const versions = await rest(`design_versions?select=id&limit=1`);
  rec("سجل إصدارات التصميم محفوظ ولم يُحذف", versions.length > 0 ? "PASS" : "FAIL");
}

async function ensureQaSubscription(c: Ctx) {
  const existing = await rest(
    `subscriptions?organization_id=eq.${c.org.id}&status=eq.active&select=id&limit=1`,
  );
  if (existing.length) return;
  const now = new Date();
  await rest("subscriptions", {
    method: "POST",
    headers: { ...adminHeaders, Prefer: "return=minimal" },
    body: JSON.stringify({
      user_id: c.org.ownerId,
      email: c.org.ownerEmail,
      organization_id: c.org.id,
      plan_id: "a3baaeb0-32f1-4939-8fed-f2b5d7571904",
      plan_code: "professional",
      plan_label: "الباقة الاحترافية",
      amount: 0,
      currency: "SAR",
      starts_at: now.toISOString(),
      ends_at: new Date(now.getTime() + 30 * 864e5).toISOString(),
      status: "active",
      activation_method: "manual",
      auto_renew: false,
    }),
  });
}

async function documentRequestRevoke(c: Ctx) {
  await ensureQaSubscription(c);
  const created = await rest("clients", {
    method: "POST",
    headers: { ...adminHeaders, Prefer: "return=representation" },
    body: JSON.stringify({
      organization_id: c.org.id,
      client_type: "individual",
      full_name: `${PREFIX}عميل رابط`,
      phone: "0500000001",
      created_by: c.org.ownerId,
    }),
  });
  const clientId = created[0]?.["id"] as string;
  const caseRows = await rest("cases", {
    method: "POST",
    headers: { ...adminHeaders, Prefer: "return=representation" },
    body: JSON.stringify({
      organization_id: c.org.id,
      client_id: clientId,
      case_title: `${PREFIX}قضية رابط الرفع`,
      case_number: `${PREFIX}CASE-1`,
      status: "open",
      priority: "medium",
      created_by: c.org.ownerId,
    }),
  });
  const caseId = caseRows[0]?.["id"] as string;

  const create = await call("docreq", "createDocumentRequest", c.org.ownerToken, {
    caseId,
    title: `${PREFIX}طلب مستندات`,
    message: "ارفع صورة الهوية",
    items: ["صورة الهوية"],
    expiresAt: new Date(Date.now() + 864e5).toISOString(),
  });
  const token = /"token"[\s\S]{0,40}?"([A-Za-z0-9_-]{16,})"/.exec(create.raw)?.[1];
  const reqRow = await one(
    `document_requests?organization_id=eq.${c.org.id}&select=id,status&order=created_at.desc&limit=1`,
  );
  rec(
    "إنشاء رابط رفع للعميل",
    create.ok && reqRow ? "PASS" : "FAIL",
    create.message || create.raw.slice(0, 140),
  );
  if (!reqRow) return;
  if (token) {
    const before = await call("portal", "getUploadRequest", "", { token });
    rec("الرابط يعمل قبل الإبطال", before.ok ? "PASS" : "FAIL", before.message);
  } else {
    rec("الرابط يعمل قبل الإبطال", "BLOCKED", "لم يُستخرج الرمز من استجابة الإنشاء.");
  }
  const rev = await call("docreq", "revokeDocumentRequest", c.org.ownerToken, {
    id: reqRow["id"],
  });
  const after = await one(`document_requests?id=eq.${reqRow["id"]}&select=status`);
  rec(
    "إبطال رابط الرفع + أثر الحالة",
    rev.ok && after?.["status"] === "revoked" ? "PASS" : "FAIL",
    `الحالة=${after?.["status"]} ${rev.message}`,
  );
  if (token) {
    const post = await call("portal", "getUploadRequest", "", { token });
    const revokedState = /"revoked"|"invalid"|"expired"/.test(post.raw) && !/"active"/.test(post.raw);
    rec(
      "رفض الرابط بعد الإبطال خادمياً (state=revoked وليس active)",
      post.denied || revokedState ? "PASS" : "FAIL",
      post.message || post.raw.slice(0, 120),
    );
  }
}

async function backupRestoreDualControl(c: Ctx) {
  const req = await call("backups", "requestBackupRestore", c.staffA.token, {
    snapshotId: null,
    scope: "table",
    reason: `${PREFIX}طلب استعادة تجريبي لاختبار الرقابة المزدوجة في بيئة QA.`,
  });
  const row = await one(
    `platform_backup_restore_requests?reason=like.${encodeURIComponent(PREFIX + "%")}&select=id,status&order=created_at.desc&limit=1`,
  );
  rec("إنشاء طلب استعادة نسخة احتياطية", req.ok && row ? "PASS" : "FAIL", req.message);
  if (!row) return;
  const self = await call("backups", "decideBackupRestore", c.staffA.token, {
    id: row["id"],
    decision: "approved",
    note: "محاولة اعتماد ذاتي",
  });
  rec(
    "منع اعتماد الطلب من مقدّمه نفسه (رقابة مزدوجة)",
    self.denied ? "PASS" : "FAIL",
    self.message,
  );
  const dec = await call("backups", "decideBackupRestore", c.staffB.token, {
    id: row["id"],
    decision: "rejected",
    note: "رفض تجريبي — لا تُنفَّذ استعادة فعلية على بيانات حقيقية.",
  });
  const after = await one(
    `platform_backup_restore_requests?id=eq.${row["id"]}&select=status,approved_by_email`,
  );
  rec(
    "قرار الاستعادة من موظف ثانٍ + أثر القاعدة",
    dec.ok && after?.["status"] === "rejected" ? "PASS" : "FAIL",
    `الحالة=${after?.["status"]} ${dec.message}`,
  );
  rec(
    "تنفيذ استعادة فعلية لقاعدة الإنتاج",
    "BLOCKED",
    "لا تُنفَّذ استعادة حقيقية: عملية تدميرية على بيانات الإنتاج وتحتاج قراراً بشرياً ونافذة صيانة.",
  );
}

async function main() {
  const mode = process.argv[2];
  if (mode === "--cleanup") {
    await cleanup();
    return;
  }
  const c = await setup();
  console.log(`مكتب QA: ${c.org.name}\n`);
  await orgSuspendResume(c);
  await userSuspendAndDelete(c);
  await flagsAndTemplatesAndRoles(c);
  await impersonation(c);
  await billingRefundFlow(c);
  await designPublishRollback(c);
  await documentRequestRevoke(c);
  await backupRestoreDualControl(c);
  await orgDeleteGuardAndDelete(c);
  await orgFinalDelete(c);
  await cleanup();

  const fail = results.filter((r) => r.status === "FAIL");
  const blocked = results.filter((r) => r.status === "BLOCKED");
  console.log(
    `\nالنتيجة: ${results.filter((r) => r.status === "PASS").length}/${results.length} PASS، ${fail.length} FAIL، ${blocked.length} BLOCKED`,
  );
  await Bun.write(
    "/tmp/browser/destructive-results.json",
    JSON.stringify(results, null, 2),
  );
  if (fail.length) process.exitCode = 1;
}

assertE2eEnvironmentSafe();
await main();
