/**
 * FINAL CLOSURE — Bounded Load / Concurrency Acceptance (آمن ومحدود على بيانات QA فقط).
 *
 * يقيس فعلياً: القراءات المتزامنة، التحديثات المتزامنة (فقدان التحديثات)،
 * الإنشاء المتزامن (سجلات مكررة)، تكرار إصدار الفاتورة (Idempotency)،
 * وتذاكر الدعم المتزامنة، ثم يتحقق من اتساق القاعدة وينظّف كل ما أُنشئ.
 *
 * الحدود: تزامن 20 طلباً، مدة القراءات 60 ثانية، ولا مساس ببيانات عملاء حقيقيين.
 */
import { SUPABASE_URL, PUBLISHABLE } from "./qa-support";
import { loadCtx, t, expect, eq, rest, restOne, mod, call, writeReport } from "./plan4-lib";

const CONCURRENCY = 20;
const READ_DURATION_MS = 60_000;
const stamp = Date.now();

const ctx = await loadCtx();
const ORG = ctx.volume.orgId;
const OWNER = ctx.volume.ownerToken;

type Timing = { status: number; ms: number; body: string };

async function asOwner(path: string, init: RequestInit = {}): Promise<Timing> {
  const started = performance.now();
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...init,
      signal: AbortSignal.timeout(15_000),
      headers: {
        apikey: PUBLISHABLE,
        Authorization: `Bearer ${OWNER}`,
        "content-type": "application/json",
        ...(init.headers as Record<string, string> | undefined),
      },
    });
    const body = await res.text();
    return { status: res.status, ms: performance.now() - started, body: body.slice(0, 200) };
  } catch (error) {
    const msg = error instanceof Error ? error.name : String(error);
    return { status: msg === "TimeoutError" ? 408 : 599, ms: performance.now() - started, body: msg };
  }
}

function stats(list: Timing[]) {
  const ms = list.map((r) => r.ms).sort((a, b) => a - b);
  const p = (q: number) => Math.round(ms[Math.min(ms.length - 1, Math.floor(ms.length * q))] ?? 0);
  return {
    total: list.length,
    errors: list.filter((r) => r.status >= 400 && r.status !== 408).length,
    timeouts: list.filter((r) => r.status === 408).length,
    p50: p(0.5),
    p95: p(0.95),
    max: Math.round(ms[ms.length - 1] ?? 0),
  };
}

/* ------------------------------------------------------------------ القراءات */

const READ_PATHS = [
  `clients?organization_id=eq.${ORG}&select=id,full_name&order=created_at.desc&limit=25`,
  `cases?organization_id=eq.${ORG}&select=id,case_title,status&order=created_at.desc&limit=25`,
  `hearings?organization_id=eq.${ORG}&select=id,hearing_date,status&limit=25`,
  `deadlines?organization_id=eq.${ORG}&select=id,due_date,status&limit=25`,
  `tasks?organization_id=eq.${ORG}&select=id,title,status&limit=25`,
  `documents?organization_id=eq.${ORG}&select=id,file_path&limit=25`,
];

let readStats = { total: 0, errors: 0, timeouts: 0, p50: 0, p95: 0, max: 0 };

await t("load/reads", `قراءات متزامنة (${CONCURRENCY} عامل × ${READ_DURATION_MS / 1000}ث)`, async () => {
  const deadline = Date.now() + READ_DURATION_MS;
  const results: Timing[] = [];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async (_, worker) => {
      let i = worker;
      while (Date.now() < deadline) {
        results.push(await asOwner(READ_PATHS[i % READ_PATHS.length]!));
        i += 1;
      }
    }),
  );
  readStats = stats(results);
  eq(readStats.errors, 0, "أخطاء القراءة");
  eq(readStats.timeouts, 0, "مهل القراءة");
  const rps = Math.round((readStats.total / READ_DURATION_MS) * 1000);
  return `طلبات=${readStats.total} (~${rps}/ث) p50=${readStats.p50}ms p95=${readStats.p95}ms أقصى=${readStats.max}ms`;
});

/* --------------------------------------------------------------- الإنشاء المتزامن */

const createdClientIds: string[] = [];

await t("load/create", `إنشاء ${CONCURRENCY} عميلاً بالتوازي بلا سجلات مكررة أو شبحية`, async () => {
  const tag = `QA-LOAD-${stamp}`;
  const results = await Promise.all(
    Array.from({ length: CONCURRENCY }, (_, i) =>
      asOwner("clients", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          organization_id: ORG,
          full_name: `${tag}-${String(i).padStart(2, "0")}`,
          client_type: "individual",
        }),
      }),
    ),
  );
  const s = stats(results);
  eq(s.errors, 0, "أخطاء الإنشاء");
  eq(s.timeouts, 0, "مهل الإنشاء");
  const rows = await rest<{ id: string; full_name: string }>(
    `clients?organization_id=eq.${ORG}&full_name=like.${tag}*&select=id,full_name`,
  );
  rows.forEach((r) => createdClientIds.push(r.id));
  eq(rows.length, CONCURRENCY, "عدد الصفوف المُنشأة");
  eq(new Set(rows.map((r) => r.full_name)).size, CONCURRENCY, "الأسماء الفريدة");
  return `صفوف=${rows.length} p95=${s.p95}ms`;
});

/* ------------------------------------------------------- التحديثات وفقدان التحديث */

await t("load/update", `${CONCURRENCY} تحديثاً متزامناً على سجلات مختلفة بلا فقدان تحديث`, async () => {
  expect(createdClientIds.length === CONCURRENCY, "لم تُنشأ صفوف الاختبار.");
  const targets = createdClientIds.map((id, i) => ({ id, notes: `LOAD-NOTE-${stamp}-${i}` }));
  const results = await Promise.all(
    targets.map((t2) =>
      asOwner(`clients?id=eq.${t2.id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ notes: t2.notes }),
      }),
    ),
  );
  const s = stats(results);
  eq(s.errors, 0, "أخطاء التحديث");
  eq(s.timeouts, 0, "مهل التحديث");
  const rows = await rest<{ id: string; notes: string | null }>(
    `clients?id=in.(${createdClientIds.join(",")})&select=id,notes`,
  );
  const byId = new Map(rows.map((r) => [r.id, r.notes]));
  const lost = targets.filter((t2) => byId.get(t2.id) !== t2.notes);
  eq(lost.length, 0, "تحديثات مفقودة");
  return `محدّثة=${rows.length} p95=${s.p95}ms`;
});

await t("load/update", "10 تحديثات متزامنة على سجل واحد تنتهي بحالة واحدة متسقة", async () => {
  const target = createdClientIds[0]!;
  const results = await Promise.all(
    Array.from({ length: 10 }, () =>
      asOwner(`clients?id=eq.${target}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ notes: `LOAD-SINGLE-${stamp}` }),
      }),
    ),
  );
  eq(stats(results).errors, 0, "أخطاء التحديث المتزامن");
  const rows = await rest<{ notes: string | null }>(`clients?id=eq.${target}&select=notes`);
  eq(rows.length, 1, "عدد صفوف السجل");
  eq(rows[0]!.notes, `LOAD-SINGLE-${stamp}`, "القيمة النهائية");
  return "حالة نهائية واحدة متسقة";
});

/* ------------------------------------------------------ Idempotency: إصدار الفواتير */

await t("load/idempotency", "5 فواتير × إصدار متزامن مزدوج = رقم واحد لكل فاتورة", async () => {
  const billing = await mod("src/lib/billing/billing.functions.ts");
  const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
  const numbers: string[] = [];
  for (let i = 0; i < 5; i += 1) {
    const draft = await call(billing, "billingSaveDraft", ctx.superAdmin.token, {
      organizationId: ORG,
      customerName: `QA-LOAD-INV-${stamp}-${i}`,
      currency: "SAR",
      taxRate: 15,
      taxExempt: false,
      items: [{ description: "اختبار حِمل محدود", quantity: 1, unitPrice: 100, discountAmount: 0 }],
    });
    expect(draft.ok, `فشل إنشاء المسودة ${i}: ${draft.message}`);
    const id = uuid.exec(draft.raw)?.[0];
    expect(!!id, `لم يُستخرج معرّف الفاتورة ${i}.`);
    const attempts = await Promise.all(
      Array.from({ length: 3 }, () =>
        call(billing, "billingIssueInvoice", ctx.superAdmin.token, { id, notify: false }),
      ),
    );
    const okCount = attempts.filter((a) => a.ok).length;
    expect(okCount <= 1, `الفاتورة ${i}: نجح الإصدار ${okCount} مرات.`);
    const row = await restOne<{ number: string }>(
      `platform_invoices?id=eq.${id}&select=number`,
    );
    expect(!!row?.number, `الفاتورة ${i}: لا رقم مُسجَّل.`);
    numbers.push(row!.number);
  }
  const dupes = await rest<{ number: string }>(
    `platform_invoices?number=in.(${numbers.join(",")})&select=number`,
  );
  eq(dupes.length, numbers.length, "أرقام فواتير مكررة");
  eq(new Set(numbers).size, numbers.length, "تفرّد الأرقام");
  return `أرقام=${numbers.join(", ")}`;
});

/* ------------------------------------------------------------ تذاكر الدعم المتزامنة */

await t("load/tickets", "10 تذاكر دعم بالتوازي: أرقام فريدة وSLA محسوب", async () => {
  const support = await mod("src/lib/support/support.functions.ts");
  const results = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      call(support, "createSupportTicket", ctx.superAdmin.token, {
        subject: `QA-LOAD-TICKET-${stamp}-${i}`,
        description: "تذكرة اختبار حِمل محدود — تُحذف بعد الاختبار.",
        category: "technical",
        priority: "medium",
        channel: "internal",
        organizationId: ORG,
      }),
    ),
  );
  const failed = results.filter((r) => !r.ok);
  eq(failed.length, 0, `تذاكر فاشلة: ${failed[0]?.message.slice(0, 120) ?? ""}`);
  const rows = await rest<{
    id: string;
    ticket_number: string;
    description: string;
    due_first_response_at: string | null;
    due_resolution_at: string | null;
  }>(
    `support_tickets?subject=like.QA-LOAD-TICKET-${stamp}*` +
      `&select=id,ticket_number,description,due_first_response_at,due_resolution_at`,
  );
  eq(rows.length, 10, "عدد التذاكر المُنشأة");
  eq(new Set(rows.map((r) => r.ticket_number)).size, 10, "أرقام التذاكر الفريدة");
  // الرسالة الأولى تُحفظ في وصف التذكرة، ويُسجَّل حدث «created» وحساب SLA لكل تذكرة.
  eq(rows.filter((r) => (r.description ?? "").includes("حِمل محدود")).length, 10, "وصف التذاكر");
  eq(
    rows.filter((r) => r.due_first_response_at && r.due_resolution_at).length,
    10,
    "تذاكر لها مواعيد SLA محسوبة",
  );
  const ids = rows.map((r) => r.id);
  // نقرأ حدث الإنشاء لكل تذكرة على حدة: أدق في التشخيص وأخف على Data API بعد موجة الحِمل.
  const events: { ticket_id: string }[] = [];
  for (const id of ids) {
    const found = await rest<{ ticket_id: string }>(
      `support_ticket_events?ticket_id=eq.${id}&event_type=eq.created&select=ticket_id`,
    );
    events.push(...found);
  }
  eq(events.length, 10, "أحداث الإنشاء");
  // سجلات أحداث التذاكر وSLA محفوظة كسجل تدقيق ولا تُحذف — نُغلق تذاكر الاختبار فقط.
  for (const id of ids) {
    await rest(`support_tickets?id=eq.${id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: "closed", closed_at: new Date().toISOString() }),
    });
  }
  const closed = await rest<{ id: string }>(
    `support_tickets?id=in.(${ids.join(",")})&status=eq.closed&select=id`,
  );
  eq(closed.length, 10, "تذاكر الاختبار المُغلقة");
  return `تذاكر=${rows.length} أحداث إنشاء=${events.length} SLA محسوب — أُغلقت وسجل التدقيق محفوظ`;
});

/* ------------------------------------------------------------------- الاتساق والتنظيف */

await t("load/consistency", "اتساق القاعدة بعد الحِمل: لا سجلات يتيمة في مكتب QA", async () => {
  const cases = await rest<{ client_id: string | null }>(
    `cases?organization_id=eq.${ORG}&select=client_id&client_id=not.is.null&limit=2000`,
  );
  const ids = [...new Set(cases.map((c) => c.client_id!))];
  const existing = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const found = await rest<{ id: string }>(
      `clients?id=in.(${ids.slice(i, i + 200).join(",")})&select=id`,
    );
    found.forEach((c) => existing.add(c.id));
  }
  eq(ids.filter((id) => !existing.has(id)).length, 0, "قضايا بعميل مفقود");
  const counts: string[] = [];
  for (const table of ["hearings", "deadlines", "tasks"]) {
    const rows = await rest<{ id: string }>(
      `${table}?organization_id=eq.${ORG}&select=id&limit=5000`,
    );
    counts.push(`${table}=${rows.length}`);
  }
  return `قضايا=${cases.length} ${counts.join(" ")}`;
});

await t("load/cleanup", "حذف كل صفوف الحِمل المُنشأة", async () => {
  await rest(`clients?organization_id=eq.${ORG}&full_name=like.QA-LOAD-${stamp}*`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
  const left = await rest<{ id: string }>(
    `clients?organization_id=eq.${ORG}&full_name=like.QA-LOAD-${stamp}*&select=id`,
  );
  eq(left.length, 0, "صفوف متبقية");
  return "لا صفوف متبقية من الاختبار";
});

console.log(
  `\nحدود الاختبار: تزامن=${CONCURRENCY} مدة القراءات=${READ_DURATION_MS / 1000}ث ` +
    `قراءات=${readStats.total} أخطاء=${readStats.errors} مهل=${readStats.timeouts}`,
);

await writeReport("/tmp/browser/plan6/bounded-load.json");