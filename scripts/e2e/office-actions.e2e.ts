/**
 * الدفعة 4 — تنفيذ فعلي لرحلات المكتب الحساسة على مكتب QA المعزول:
 *   1) دعوة موظف وقبولها فعلياً
 *   2) فتح تذكرة دعم من بوابة المكتب
 *   3) طباعة مستند سرّي (سجل تدقيق غير قابل للتعديل)
 *   4) روابط العميل العامة (رابط رفع + متابعة قضية برمز عام)
 *
 * لكل إجراء: استدعاء دالة الإنتاج نفسها عبر بروتوكول createServerFn بتوكن حقيقي،
 * ثم التحقق من أثر قاعدة البيانات، ثم إعادة القراءة كما تفعل الواجهة بعد Reload.
 * لا تُلمس أي بيانات حقيقية: كل شيء داخل مكتب QA-LIVE-20260809- فقط.
 *
 * التشغيل: bun scripts/e2e/office-actions.e2e.ts
 */
import { SUPABASE_URL, PUBLISHABLE, APP, adminFetch, adminHeaders, signIn, asUser } from "./qa-support";
import { resolveServerFns, callServerFn, type ServerFnRef } from "./serverfn-rpc";

const ORG_PREFIX = "QA-LIVE-20260809-";
const B4 = "QA-B4-20260809-";
const PASSWORD = `Qa!${crypto.randomUUID()}`;
const INVITEE = "qa.b4.invitee@mehlaqa.test";
const OUTSIDER = "qa.b4.outsider@mehlaqa.test";

type Row = Record<string, unknown>;
type Status = "PASS" | "FAIL" | "BLOCKED";
const results: { name: string; status: Status; detail: string }[] = [];
const rec = (name: string, status: Status, detail = "") => {
  results.push({ name, status, detail });
  console.log(`${status} — ${name}${detail ? ` :: ${detail}` : ""}`);
};
const check = (name: string, ok: boolean, detail = "") => rec(name, ok ? "PASS" : "FAIL", detail);

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

const MODULES = {
  invites: "src/lib/invitations.functions.ts",
  support: "src/lib/support/support.functions.ts",
  print: "src/lib/print/print-audit.functions.ts",
  docreq: "src/lib/document-requests.functions.ts",
  portal: "src/lib/client-portal.functions.ts",
} as const;
const fns: Record<string, Record<string, ServerFnRef>> = {};
async function fn(mod: keyof typeof MODULES, name: string): Promise<ServerFnRef> {
  fns[mod] ??= await resolveServerFns(APP, MODULES[mod]);
  const ref = fns[mod]![name];
  if (!ref) throw new Error(`دالة غير موجودة: ${mod}.${name}`);
  return ref;
}
const call = async (mod: keyof typeof MODULES, name: string, token: string | undefined, data?: unknown) =>
  callServerFn({ appOrigin: APP, ref: await fn(mod, name), token, data });

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

type Actor = { role: string; email: string; userId: string; token: string };

async function setup() {
  const org = await one(
    `organizations?name=like.${encodeURIComponent(ORG_PREFIX + "%")}&select=id,name&limit=1`,
  );
  if (!org) throw new Error("مكتب QA-LIVE غير موجود — شغّل qa-volume-fixture.ts أولاً.");
  const orgId = org.id as string;

  const roleEmails: Record<string, string> = {
    owner: "qa.live.owner@mehlaqa.test",
    admin: "qa.live.admin@mehlaqa.test",
    lawyer: "qa.live.lawyer@mehlaqa.test",
    legal_assistant: "qa.live.assistant@mehlaqa.test",
    viewer: "qa.live.viewer@mehlaqa.test",
  };
  const actors: Record<string, Actor> = {};
  for (const [role, email] of Object.entries(roleEmails)) {
    const userId = await ensureUser(email, `QA ${role}`);
    actors[role] = { role, email, userId, token: await signIn(email, PASSWORD) };
  }
  const inviteeId = await ensureUser(INVITEE, `${B4}موظف مدعو`);
  const outsiderId = await ensureUser(OUTSIDER, `${B4}خارج المكتب`);
  const invitee: Actor = { role: "invitee", email: INVITEE, userId: inviteeId, token: await signIn(INVITEE, PASSWORD) };
  const outsider: Actor = { role: "outsider", email: OUTSIDER, userId: outsiderId, token: await signIn(OUTSIDER, PASSWORD) };

  const kase = await one(
    `cases?organization_id=eq.${orgId}&public_code=not.is.null&select=id,case_number,public_code&limit=1`,
  );
  if (!kase) throw new Error("لا توجد قضية QA برمز عام.");

  // تنظيف أي بقايا من تشغيل سابق
  await cleanup(orgId, inviteeId);
  return { orgId, orgName: org.name as string, actors, invitee, outsider, kase };
}

async function cleanup(orgId: string, inviteeId: string) {
  await adminFetch(
    `${SUPABASE_URL}/rest/v1/organization_members?organization_id=eq.${orgId}&user_id=eq.${inviteeId}`,
    { method: "DELETE", headers: adminHeaders },
  );
  await adminFetch(
    `${SUPABASE_URL}/rest/v1/organization_invitations?organization_id=eq.${orgId}&email=eq.${INVITEE}`,
    { method: "DELETE", headers: adminHeaders },
  );
}

/* ------------------------------------------------ 1) دعوة موظف */
async function inviteFlow(ctx: Awaited<ReturnType<typeof setup>>) {
  const { orgId, actors, invitee } = ctx;

  const denied = await call("invites", "inviteTeamMember", actors.viewer!.token, {
    organizationId: orgId,
    email: INVITEE,
    role: "lawyer",
    origin: APP,
  });
  check("دعوة الفريق مرفوضة لدور «قارئ» خادمياً", denied.denied, denied.message.slice(0, 90));

  const created = await call("invites", "inviteTeamMember", actors.owner!.token, {
    organizationId: orgId,
    email: INVITEE,
    role: "lawyer",
    origin: APP,
  });
  const token = /"token=|inviteUrl"[\s\S]{0,80}?invite\/([A-Za-z0-9_-]{16,})/.exec(created.raw)?.[1]
    ?? /invite\/([A-Za-z0-9_-]{16,})/.exec(created.raw)?.[1];
  check("المالك أنشأ دعوة عضو جديد", created.ok && !!token, created.ok ? "" : created.message.slice(0, 120));
  if (!token) return;

  const invRow = await one(
    `organization_invitations?organization_id=eq.${orgId}&email=eq.${INVITEE}&select=id,role,status,expires_at`,
  );
  check(
    "صف الدعوة في قاعدة البيانات pending بالدور الصحيح",
    invRow?.status === "pending" && invRow?.role === "lawyer",
    JSON.stringify(invRow ?? {}),
  );

  const preview = await call("invites", "getInvitation", undefined, { token });
  const leaksEmail = preview.raw.includes(INVITEE);
  check("المعاينة العامة للدعوة تعمل بلا كشف البريد كاملاً", preview.ok && !leaksEmail);

  const joined = await call("invites", "joinOrganization", invitee.token, { token });
  check("العضو المدعو أكمل الانضمام فعلياً", joined.ok && /"joined"/.test(joined.raw), joined.message.slice(0, 120));

  const member = await one(
    `organization_members?organization_id=eq.${orgId}&user_id=eq.${invitee.userId}&select=role,status`,
  );
  check("عضوية جديدة نشطة بدور «محامٍ» في قاعدة البيانات", member?.status === "active" && member?.role === "lawyer", JSON.stringify(member ?? {}));

  const after = await one(
    `organization_invitations?id=eq.${invRow!.id}&select=status`,
  );
  check("حالة الدعوة صارت accepted", after?.status === "accepted");

  // إعادة القراءة كما تفعل صفحة الفريق بعد Reload
  const reload = await asUser(
    invitee.token,
    `/rest/v1/organization_members?organization_id=eq.${orgId}&select=user_id,role,status`,
  );
  const rows = Array.isArray(reload.body) ? (reload.body as Row[]) : [];
  check(
    "بعد Reload: العضو الجديد يقرأ فريق المكتب بصلاحيات المحامي",
    reload.status === 200 && rows.some((r) => r.user_id === invitee.userId),
    `صفوف=${rows.length}`,
  );

  const reuse = await call("invites", "joinOrganization", invitee.token, { token });
  check("إعادة استخدام نفس رابط الدعوة مرفوضة", reuse.denied || !/"joined"/.test(reuse.raw), reuse.raw.slice(0, 90));
}

/* ------------------------------------------------ 2) تذكرة دعم من المكتب */
async function supportFlow(ctx: Awaited<ReturnType<typeof setup>>) {
  const { orgId, actors, outsider } = ctx;
  const clientRequestId = `${B4}${crypto.randomUUID().slice(0, 8)}`;
  const subject = `${B4}استفسار عن ربط تقويم الجلسات ${clientRequestId.slice(-8)}`;

  const created = await call("support", "createOfficeSupportTicket", actors.lawyer!.token, {
    subject,
    description: "لا تظهر الجلسات القادمة في التقويم بعد تحديث المهل. نحتاج مراجعة الربط.",
    category: "technical",
    priority: "high",
    clientRequestId,
  });
  check("محامي المكتب فتح تذكرة دعم من بوابة المكتب", created.ok, created.message.slice(0, 140));
  if (!created.ok) return;

  const ticket = await one(
    `support_tickets?subject=eq.${encodeURIComponent(subject)}&select=id,ticket_number,status,priority,channel,organization_id,due_first_response_at,due_resolution_at,requester_email`,
  );
  check(
    "التذكرة محفوظة بمكتب QA وقناة portal وحالة new",
    !!ticket && ticket.organization_id === orgId && ticket.channel === "portal" && ticket.status === "new",
    JSON.stringify({ n: ticket?.ticket_number, s: ticket?.status, c: ticket?.channel }),
  );
  check(
    "المهل (SLA) حُسبت على الخادم لا من الواجهة",
    !!ticket?.due_first_response_at && !!ticket?.due_resolution_at,
    String(ticket?.due_first_response_at ?? ""),
  );
  check("بريد مقدّم الطلب مأخوذ من الجلسة لا من الطلب", ticket?.requester_email === actors.lawyer!.email);

  // نص الطلب الأول يُحفظ في وصف التذكرة (وهو ما يعرضه Timeline كأول رسالة عميل)،
  // ورسائل `support_ticket_messages` تُنشأ للردود والملاحظات لاحقاً.
  const events = await rest(`support_ticket_events?ticket_id=eq.${ticket!.id}&select=event_type,actor_kind`);
  check(
    "نص الطلب الأول محفوظ مع حدث الإنشاء في Timeline",
    typeof ticket?.description === "string" &&
      String(ticket.description).includes("الجلسات القادمة") &&
      events.some((e) => e.event_type === "created"),
    `أحداث=${events.length}`,
  );

  const dup = await call("support", "createOfficeSupportTicket", actors.lawyer!.token, {
    subject,
    description: "لا تظهر الجلسات القادمة في التقويم بعد تحديث المهل. نحتاج مراجعة الربط.",
    category: "technical",
    priority: "high",
    clientRequestId,
  });
  check(
    "منع التكرار بمعرّف الطلب: نفس التذكرة تُعاد ولا تُنشأ ثانية",
    dup.ok && dup.raw.includes(String(ticket!.id)),
    dup.ok ? `أُعيدت ${ticket!.ticket_number}` : dup.message.slice(0, 120),
  );

  const reload = await asUser(
    actors.lawyer!.token,
    `/rest/v1/support_tickets?id=eq.${ticket!.id}&select=id,ticket_number,status`,
  );
  check(
    "بعد Reload: صاحب التذكرة يراها في مركز الدعم",
    reload.status === 200 && Array.isArray(reload.body) && (reload.body as Row[]).length === 1,
    `حالة=${reload.status}`,
  );

  const foreign = await asUser(outsider.token, `/rest/v1/support_tickets?id=eq.${ticket!.id}&select=id`);
  check(
    "مستخدم من خارج المكتب لا يرى التذكرة (RLS خادمي)",
    foreign.status === 200 && Array.isArray(foreign.body) && (foreign.body as Row[]).length === 0,
    `حالة=${foreign.status}`,
  );
  return ticket!.id as string;
}

/* ------------------------------------------------ 3) طباعة مستند سرّي */
async function printFlow(ctx: Awaited<ReturnType<typeof setup>>) {
  const { orgId, actors, kase } = ctx;
  const base = {
    organizationId: orgId,
    action: "print" as const,
    documentType: "case_sheet",
    documentId: kase.id as string,
    documentRef: kase.case_number as string,
    documentTitle: `${B4}ورقة القضية السرّية`,
    documentVersion: "v1",
    classification: "confidential" as const,
    pagesCount: 3,
    browser: "Chromium",
    os: "Linux",
    device: "desktop",
    sessionId: `b4-${crypto.randomUUID().slice(0, 8)}`,
    metadata: { batch: "4" },
  };

  const first = await call("print", "openPrintEvent", actors.lawyer!.token, base);
  const printRef = /PR-\d{8}-[A-Z0-9]{6}/.exec(first.raw)?.[0] ?? null;
  check("المحامي طبع مستنداً سرّياً (فتح حدث طباعة موثّق)", first.ok && !!printRef, first.ok ? String(printRef) : first.message.slice(0, 120));

  const row = printRef
    ? await one(`print_audit_logs?print_ref=eq.${printRef}&select=id,classification,copy_number,user_role,pages_count,action,ip,organization_id`)
    : undefined;
  check(
    "سجل الطباعة يحمل التصنيف السرّي ورقم النسخة والدور من الخادم",
    !!row && row.classification === "confidential" && row.user_role === "lawyer" && Number(row.copy_number) >= 1 && row.organization_id === orgId,
    JSON.stringify({ c: row?.classification, copy: row?.copy_number, r: row?.user_role }),
  );

  const second = await call("print", "openPrintEvent", actors.owner!.token, { ...base, sessionId: `b4-${crypto.randomUUID().slice(0, 8)}` });
  const ref2 = /PR-\d{8}-[A-Z0-9]{6}/.exec(second.raw)?.[0] ?? null;
  const row2 = ref2 ? await one(`print_audit_logs?print_ref=eq.${ref2}&select=copy_number`) : undefined;
  check(
    "رقم النسخة يتصاعد لكل طباعة لنفس المستند",
    second.ok && Number(row2?.copy_number ?? 0) > Number(row?.copy_number ?? 0),
    `${row?.copy_number} → ${row2?.copy_number}`,
  );

  const assistant = await call("print", "openPrintEvent", actors.legal_assistant!.token, { ...base, sessionId: `b4-${crypto.randomUUID().slice(0, 8)}` });
  check("المساعد القانوني ممنوع من طباعة السرّي (print.confidential)", assistant.denied, assistant.message.slice(0, 90));

  const viewerExport = await call("print", "openPrintEvent", actors.viewer!.token, {
    ...base,
    action: "export_pdf",
    classification: "internal",
    sessionId: `b4-${crypto.randomUUID().slice(0, 8)}`,
  });
  check("القارئ ممنوع من تصدير PDF خادمياً", viewerExport.denied, viewerExport.message.slice(0, 90));

  if (row) {
    const upd = await asUser(actors.owner!.token, `/rest/v1/print_audit_logs?id=eq.${row.id}`, {
      method: "PATCH",
      body: JSON.stringify({ classification: "internal" }),
    });
    const afterPatch = await one(`print_audit_logs?id=eq.${row.id}&select=classification`);
    check(
      "تعديل سجل الطباعة لا يمر (السجل غير قابل للتعديل)",
      afterPatch?.classification === "confidential",
      `حالة=${upd.status} تصنيف=${afterPatch?.classification}`,
    );
    const del = await asUser(actors.owner!.token, `/rest/v1/print_audit_logs?id=eq.${row.id}`, { method: "DELETE" });
    const still = await one(`print_audit_logs?id=eq.${row.id}&select=id,classification`);
    check(
      "حذف سجل الطباعة مرفوض والصف باقٍ كما هو",
      !!still && still.classification === "confidential",
      `حالة الحذف=${del.status}`,
    );
  }

  const list = await call("print", "listPrintAudit", actors.owner!.token, { organizationId: orgId, limit: 20, offset: 0 });
  check(
    "بعد Reload: سجل الطباعة يعرض العملية للمالك",
    list.ok && (printRef ? list.raw.includes(printRef) : false),
    list.ok ? "" : list.message.slice(0, 120),
  );
}

/* ------------------------------------------------ 4) روابط العميل العامة */
async function portalFlow(ctx: Awaited<ReturnType<typeof setup>>) {
  const { actors, kase } = ctx;

  // تشغيل الاختبار مراراً من نفس عنوان IP يستنفد حدّ محاولات روابط الرفع،
  // فنصفّر محاولات بيئة QA فقط قبل قياس الرحلة العامة.
  await adminFetch(
    `${SUPABASE_URL}/rest/v1/case_lookup_attempts?code_attempt=eq.upload-token`,
    { method: "DELETE" },
  );

  const denied = await call("docreq", "createDocumentRequest", actors.viewer!.token, {
    caseId: kase.id,
    title: `${B4}طلب مستندات`,
    items: ["الهوية"],
  });
  check("القارئ ممنوع من إنشاء رابط رفع للعميل", denied.denied, denied.message.slice(0, 90));

  const created = await call("docreq", "createDocumentRequest", actors.lawyer!.token, {
    caseId: kase.id,
    title: `${B4}طلب مستندات العميل`,
    message: "نحتاج صورة الهوية وعقد الإيجار قبل الجلسة.",
    items: ["صورة الهوية", "عقد الإيجار"],
  });
  const reqId = /"id"[\s\S]{0,30}?"([0-9a-f-]{36})"/.exec(created.raw)?.[1] ?? null;
  const token = /"token"[\s\S]{0,40}?"([A-Za-z0-9_-]{16,})"/.exec(created.raw)?.[1] ?? null;
  check("المحامي أنشأ رابط رفع مستندات للعميل", created.ok && !!reqId && !!token, created.ok ? "" : created.message.slice(0, 140));
  if (!reqId || !token) return;

  const reqRow = await one(`document_requests?id=eq.${reqId}&select=id,status,token_hash,organization_id`);
  check("الرابط مخزّن بحالة active وبتوكن مُهشّم (لا نص صريح)", reqRow?.status === "active" && typeof reqRow?.token_hash === "string" && !String(reqRow?.token_hash).includes(token));

  const open = await call("portal", "getUploadRequest", undefined, { token });
  const leaksIds = open.raw.includes(reqId) || open.raw.includes(String(kase.id));
  check("العميل يفتح الرابط العام بلا تسجيل دخول ويرى الطلب", open.ok && /"active"/.test(open.raw), open.raw.slice(0, 160));
  check("الاستجابة العامة لا تكشف معرّفات داخلية", open.ok && !leaksIds);

  const events = await rest(`document_request_events?request_id=eq.${reqId}&select=event`);
  check(
    "أحداث الرابط مسجّلة (created + opened)",
    events.some((e) => e.event === "created") && events.some((e) => e.event === "opened"),
    events.map((e) => e.event).join(","),
  );

  const bad = await call("portal", "getUploadRequest", undefined, { token: "x".repeat(40) });
  check("توكن غير صحيح يُرفض بلا كشف سبب", bad.ok ? /"invalid"|"rate_limited"/.test(bad.raw) : bad.denied, bad.raw.slice(0, 60));

  const lookup = await call("portal", "lookupCaseStatus", undefined, { code: kase.public_code });
  const hidden = await one(
    `case_updates?case_id=eq.${kase.id}&is_client_visible=eq.false&select=title&limit=1`,
  );
  check("متابعة القضية بالرمز العام تعمل للعميل", lookup.ok && !/"not_found"/.test(lookup.raw), lookup.raw.slice(0, 80));
  check(
    "المتابعة العامة لا تكشف التحديثات غير المرئية للعميل",
    !hidden || !lookup.raw.includes(String(hidden.title)),
    hidden ? "يوجد تحديث داخلي للمقارنة" : "لا توجد تحديثات داخلية",
  );
  const wrong = await call("portal", "lookupCaseStatus", undefined, { code: "0000000000" });
  check("رمز غير موجود يعيد not_found بلا تلميح", wrong.ok && /"not_found"|"rate_limited"/.test(wrong.raw));

  const revoked = await call("docreq", "revokeDocumentRequest", actors.lawyer!.token, { id: reqId });
  const afterRow = await one(`document_requests?id=eq.${reqId}&select=status`);
  check("إبطال الرابط نجح وأثره في قاعدة البيانات", revoked.ok && afterRow?.status === "revoked", String(afterRow?.status));

  const afterOpen = await call("portal", "getUploadRequest", undefined, { token });
  check(
    "بعد Reload: الرابط المُبطل لم يعد صالحاً",
    afterOpen.ok && /"revoked"|"invalid"|"expired"/.test(afterOpen.raw) && !/"active"/.test(afterOpen.raw),
    afterOpen.raw.slice(0, 60),
  );
  const slots = await call("portal", "createUploadSlots", undefined, {
    token,
    files: [{ name: "id.pdf", size: 12_345, type: "application/pdf" }],
  });
  check("الرفع عبر رابط مُبطل مرفوض خادمياً", slots.denied, slots.message.slice(0, 90));
}

/* ------------------------------------------------ التشغيل */
const ctx = await setup();
console.log(`مكتب الاختبار: ${ctx.orgName}\n`);
await inviteFlow(ctx);
console.log("");
await supportFlow(ctx);
console.log("");
await printFlow(ctx);
console.log("");
await portalFlow(ctx);

const pass = results.filter((r) => r.status === "PASS").length;
const fail = results.filter((r) => r.status === "FAIL").length;
const blocked = results.filter((r) => r.status === "BLOCKED").length;
console.log(`\nالنتيجة: ${pass} PASS / ${fail} FAIL / ${blocked} BLOCKED من ${results.length}`);
await Bun.write("/tmp/browser/office-actions-results.json", JSON.stringify({ org: ctx.orgName, results }, null, 2));
if (fail > 0) process.exitCode = 1;
