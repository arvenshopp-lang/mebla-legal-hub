/**
 * PLAN 4 / ب — الطوابير والمهام ومحرك الإشعارات.
 * يشغّل المسار الدوري الحقيقي (api/public/hooks/notifications-dispatch) ويتحقق من
 * التحويل والإلغاء ومنع التكرار وإعادة العالقين، ومن تطابق عدّادات لوحة الإدارة
 * مع القاعدة، ومن عزل الطابور بين المكاتب.
 */
import { APP, SUPABASE_URL, PUBLISHABLE } from "./qa-support";
import { loadCtx, t, expect, eq, rest, restOne, mod, call, assertSafeArabic, writeReport } from "./plan4-lib";

const ctx = await loadCtx();
const consoleFns = await mod("src/lib/admin-console.functions.ts");
const SA = ctx.superAdmin.token;
const ORG = ctx.volume.orgId;
const EVENT_TYPE = "hearing_reminder";
const stamp = Date.now();

async function dispatch(apikey: string | null): Promise<{ status: number; body: string }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (apikey) headers["apikey"] = apikey;
  const res = await fetch(`${APP}/api/public/hooks/notifications-dispatch`, {
    method: "POST",
    headers,
    body: "{}",
  });
  return { status: res.status, body: (await res.text()).slice(0, 300) };
}

async function insertEvent(orgId: string, type = EVENT_TYPE): Promise<string> {
  const created = await rest<{ id: string }>(`notification_events`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      organization_id: orgId,
      event_type: type,
      entity_type: "hearing",
      payload: { qa: `plan4-${stamp}` },
    }),
  });
  return created[0]!.id;
}

/* ------------------------------------------------------- المسار الدوري وحمايته */

await t("jobs", "المسار الدوري يرفض الطلب بلا مفتاح", async () => {
  const r = await dispatch(null);
  eq(r.status, 401, "حالة الطلب بلا مفتاح");
  expect(!/select|postgres|eyJ/i.test(r.body), "الاستجابة تكشف تفاصيل داخلية.");
  return r.body;
});

await t("jobs", "المسار الدوري يرفض مفتاحاً خاطئاً", async () => {
  const r = await dispatch(`${PUBLISHABLE}x`);
  eq(r.status, 401, "حالة الطلب بمفتاح خاطئ");
  return r.body;
});

await t("jobs", "المسار الدوري يعمل بالمفتاح الصحيح ويعيد عدّادات فقط", async () => {
  const r = await dispatch(PUBLISHABLE);
  eq(r.status, 200, "حالة التشغيل");
  expect(/"ok":true/.test(r.body), `استجابة غير متوقعة: ${r.body}`);
  expect(!/966\d|@|recipient_phone/.test(r.body), "الاستجابة تكشف بيانات مستلمين.");
  return r.body;
});

/* ------------------------------------------------- تحويل الأحداث حسب القواعد */

await t("notifications", "حدث بلا قاعدة مفعّلة: لا صف في الطابور والحدث يُستهلك", async () => {
  await rest(`notification_rules?organization_id=eq.${ORG}&event_type=eq.${EVENT_TYPE}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
  const eventId = await insertEvent(ORG);
  await dispatch(PUBLISHABLE);
  const queued = await rest(`notification_queue?event_id=eq.${eventId}&select=id`);
  eq(queued.length, 0, "عدد صفوف الطابور");
  const ev = await restOne<{ processed_at: string | null }>(
    `notification_events?id=eq.${eventId}&select=processed_at`,
  );
  expect(ev!.processed_at !== null, "لم يُعلَّم الحدث كمُعالَج.");
  return "تم التخطي بلا ضجيج في الطابور";
});

let cancelledEventId = "";
await t("notifications", "قاعدة مفعّلة ومزوّد معطّل: صف ملغى بسبب واضح", async () => {
  const state = await restOne<{ is_enabled: boolean }>(
    `whatsapp_provider_state?provider=eq.whatsline&select=is_enabled`,
  );
  expect(state && state.is_enabled === false, "المزوّد مفعّل — هذا الاختبار يفترض تعطيله.");
  await rest(`notification_rules`, {
    method: "POST",
    headers: { Prefer: "return=representation,resolution=merge-duplicates" },
    body: JSON.stringify({
      organization_id: ORG,
      event_type: EVENT_TYPE,
      channel: "whatsapp",
      is_enabled: true,
    }),
  });
  cancelledEventId = await insertEvent(ORG);
  await dispatch(PUBLISHABLE);
  const rows = await rest<{ status: string; last_error_code: string; recipient_phone: string | null }>(
    `notification_queue?event_id=eq.${cancelledEventId}&select=status,last_error_code,recipient_phone`,
  );
  eq(rows.length, 1, "عدد صفوف الطابور");
  eq(rows[0]!.status, "cancelled", "حالة الصف");
  eq(rows[0]!.last_error_code, "PROVIDER_DISABLED", "رمز السبب");
  return `${rows[0]!.status} / ${rows[0]!.last_error_code}`;
});

await t("notifications", "تشغيل ثانٍ لا يكرر الصف لنفس الحدث", async () => {
  await dispatch(PUBLISHABLE);
  const rows = await rest(`notification_queue?event_id=eq.${cancelledEventId}&select=id`);
  eq(rows.length, 1, "عدد صفوف الطابور بعد التشغيل الثاني");
  return "بلا تكرار";
});

await t("notifications", "مفتاح منع التكرار مفروض في القاعدة", async () => {
  const row = await restOne<{ idempotency_key: string; organization_id: string; event_type: string }>(
    `notification_queue?event_id=eq.${cancelledEventId}&select=idempotency_key,organization_id,event_type`,
  );
  const res = await fetch(`${SUPABASE_URL}/rest/v1/notification_queue`, {
    method: "POST",
    headers: {
      apikey: process.env["SUPABASE_SERVICE_ROLE_KEY"]!,
      Authorization: `Bearer ${process.env["SUPABASE_SERVICE_ROLE_KEY"]!}`,
      "content-type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      organization_id: row!.organization_id,
      event_type: row!.event_type,
      idempotency_key: row!.idempotency_key,
    }),
  });
  eq(res.status, 409, "حالة الإدراج المكرر");
  return "القاعدة ترفض التكرار (409)";
});

await t("notifications", "إعادة العالقين تُعيد الصف من processing إلى الطابور", async () => {
  const stale = await rest<{ id: string }>(`notification_queue`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      organization_id: ORG,
      event_type: EVENT_TYPE,
      channel: "whatsapp",
      provider: "whatsline",
      recipient_type: "client",
      status: "processing",
      processing_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      attempts: 1,
      idempotency_key: `qa-plan4-stale-${stamp}`,
      payload: { qa: true },
    }),
  });
  const id = stale[0]!.id;
  await dispatch(PUBLISHABLE);
  const row = await restOne<{ status: string; attempts: number }>(
    `notification_queue?id=eq.${id}&select=status,attempts`,
  );
  expect(row!.status !== "processing", `الصف بقي معلقاً في processing (${row!.status}).`);
  return `الحالة بعد الإعادة=${row!.status}`;
});

await t("notifications", "صف مجدول للمستقبل لا يُسحب قبل موعده", async () => {
  const future = await rest<{ id: string }>(`notification_queue`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      organization_id: ORG,
      event_type: EVENT_TYPE,
      channel: "whatsapp",
      provider: "whatsline",
      recipient_type: "client",
      status: "queued",
      scheduled_at: new Date(Date.now() + 3 * 3_600_000).toISOString(),
      idempotency_key: `qa-plan4-future-${stamp}`,
      payload: { qa: true },
    }),
  });
  const id = future[0]!.id;
  await dispatch(PUBLISHABLE);
  const row = await restOne<{ status: string; attempts: number }>(
    `notification_queue?id=eq.${id}&select=status,attempts`,
  );
  eq(row!.status, "queued", "حالة الصف المجدول");
  eq(Number(row!.attempts), 0, "عدد المحاولات");
  return "لم يُسحب قبل موعده";
});

await t("notifications", "صف استهلك محاولاته لا يُعاد سحبه", async () => {
  const dead = await rest<{ id: string }>(`notification_queue`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      organization_id: ORG,
      event_type: EVENT_TYPE,
      channel: "whatsapp",
      provider: "whatsline",
      recipient_type: "client",
      status: "failed",
      attempts: 4,
      max_attempts: 4,
      failed_at: new Date().toISOString(),
      last_error_code: "QA_DEAD",
      idempotency_key: `qa-plan4-dead-${stamp}`,
      payload: { qa: true },
    }),
  });
  const id = dead[0]!.id;
  await dispatch(PUBLISHABLE);
  const row = await restOne<{ status: string; attempts: number }>(
    `notification_queue?id=eq.${id}&select=status,attempts`,
  );
  eq(row!.status, "failed", "حالة الصف الميت");
  eq(Number(row!.attempts), 4, "عدد المحاولات");
  return "بقي في الرسائل الميتة";
});

/* ---------------------------------------------- عدّادات اللوحة مقابل القاعدة */

await t("jobs", "عدّادات لوحة المهام تطابق القاعدة", async () => {
  const r = await call(consoleFns, "getJobsOverview", SA);
  expect(r.ok, r.message);
  const queues = (r.value as { queues: { key: string; queued: number; failed: number; done: number }[] })
    .queues;
  const email = queues.find((q) => q.key === "email_outbox");
  expect(email, "لا يوجد طابور البريد في الاستجابة.");
  const dbQueued = (await rest(`email_outbox?status=eq.queued&select=id`)).length;
  const dbFailed = (await rest(`email_outbox?status=eq.failed&select=id`)).length;
  eq(email!.queued, dbQueued, "عدد المنتظر في طابور البريد");
  eq(email!.failed, dbFailed, "عدد الفاشل في طابور البريد");
  const docs = queues.find((q) => q.key === "document_processing");
  if (docs) {
    const dbDone = (await rest(`document_processing_jobs?status=eq.completed&select=id`)).length;
    eq(docs.done, dbDone, "عدد المنجز في معالجة المستندات");
  }
  return `طوابير=${queues.length} بريد منتظر=${dbQueued} فاشل=${dbFailed}`;
});

await t("jobs", "موظف بلا صلاحية مراقبة يُرفض", async () => {
  const r = await call(consoleFns, "getJobsOverview", ctx.plainStaff.token);
  expect(!r.ok, "قرأ موظف بلا صلاحية عدّادات المهام.");
  assertSafeArabic(r.message, "رفض عدّادات المهام");
  return r.message.slice(0, 80);
});

await t("jobs", "إعادة تشغيل مهمة بريد بمعرّف غير موجود ترفض برسالة عربية", async () => {
  const r = await call(consoleFns, "retryEmailJob", SA, {
    outboxId: "00000000-0000-0000-0000-000000000000",
  });
  expect(!r.ok, "قبل الخادم معرّف مهمة غير موجود.");
  assertSafeArabic(r.message, "رسالة مهمة غير موجودة");
  return r.message.slice(0, 80);
});

/* ------------------------------------------------------- عزل الطابور بالمكاتب */

await t("notifications", "طابور مكتب لا يُقرأ بتوكن مكتب آخر", async () => {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/notification_queue?organization_id=eq.${ORG}&select=id`,
    {
      headers: { apikey: PUBLISHABLE, Authorization: `Bearer ${ctx.officeOwner.token}` },
    },
  );
  const body = (await res.text()).slice(0, 200);
  expect(res.status === 200 ? body === "[]" : true, `تسريب صفوف طابور مكتب آخر: ${body}`);
  return `الحالة=${res.status} الجسم=${body}`;
});

await t("notifications", "أحداث الإشعارات ليست مقروءة لمكتب آخر", async () => {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/notification_events?organization_id=eq.${ORG}&select=id`,
    { headers: { apikey: PUBLISHABLE, Authorization: `Bearer ${ctx.officeOwner.token}` } },
  );
  const body = (await res.text()).slice(0, 200);
  expect(res.status === 200 ? body === "[]" : true, `تسريب أحداث مكتب آخر: ${body}`);
  return `الحالة=${res.status}`;
});

/* ------------------------------------------------------------------- تنظيف QA */

await t("jobs", "تنظيف صفوف QA من الطابور", async () => {
  await rest(`notification_queue?idempotency_key=like.qa-plan4-*`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
  const left = await rest(`notification_queue?idempotency_key=like.qa-plan4-*&select=id`);
  eq(left.length, 0, "صفوف QA المتبقية");
  return "تم التنظيف";
});

await writeReport("/tmp/browser/plan4/jobs-notifications.json");
