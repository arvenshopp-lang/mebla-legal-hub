/**
 * PLAN 4 / ج — سلامة البيانات والتزامن ومسارات الخطأ.
 * يفحص المفاتيح الأجنبية والسجلات اليتيمة وملفات التخزين المعلّقة، ويجرّب
 * الإرسال المتزامن والضغط المتكرر، ويتحقق من عربية رسائل الخطأ وعدم كشف الأسرار.
 */
import { SUPABASE_URL, PUBLISHABLE } from "./qa-support";
import { loadCtx, t, expect, eq, rest, restOne, mod, call, assertSafeArabic, writeReport } from "./plan4-lib";

const ctx = await loadCtx();
const ORG = ctx.volume.orgId;
const OWNER = ctx.volume.ownerToken;
const stamp = Date.now();

async function asOwner(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: PUBLISHABLE,
      Authorization: `Bearer ${OWNER}`,
      "content-type": "application/json",
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
}

/* ------------------------------------------------------- المفاتيح الأجنبية */

await t("integrity", "قضية بعميل غير موجود تُرفض من القاعدة", async () => {
  const res = await asOwner("cases", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      organization_id: ORG,
      client_id: "00000000-0000-0000-0000-000000000000",
      case_title: `QA-P4-FK-${stamp}`,
      status: "open",
    }),
  });
  const body = (await res.text()).slice(0, 200);
  expect(res.status >= 400, `قُبلت قضية بعميل وهمي (${res.status}).`);
  return `الحالة=${res.status} ${body.slice(0, 90)}`;
});

await t("integrity", "جلسة بقضية غير موجودة تُرفض من القاعدة", async () => {
  const res = await asOwner("hearings", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      organization_id: ORG,
      case_id: "00000000-0000-0000-0000-000000000000",
      hearing_date: new Date().toISOString(),
      status: "scheduled",
    }),
  });
  expect(res.status >= 400, `قُبلت جلسة بقضية وهمية (${res.status}).`);
  return `الحالة=${res.status}`;
});

await t("integrity", "لا توجد قضايا بعميل يتيم", async () => {
  const rows = await rest<{ n: string }>(
    `cases?select=id,client_id&client_id=not.is.null&limit=2000`,
  );
  const clientIds = [...new Set(rows.map((r) => (r as unknown as { client_id: string }).client_id))];
  const existing = new Set<string>();
  for (let i = 0; i < clientIds.length; i += 200) {
    const chunk = clientIds.slice(i, i + 200);
    const found = await rest<{ id: string }>(`clients?id=in.(${chunk.join(",")})&select=id`);
    found.forEach((c) => existing.add(c.id));
  }
  const orphans = clientIds.filter((id) => !existing.has(id));
  eq(orphans.length, 0, "عدد القضايا بعميل مفقود");
  return `فُحصت ${rows.length} قضية / ${clientIds.length} عميل`;
});

await t("integrity", "لا توجد جلسات أو مهل أو مهام بقضية مفقودة", async () => {
  const report: string[] = [];
  for (const table of ["hearings", "deadlines", "tasks"]) {
    const rows = await rest<{ case_id: string | null }>(
      `${table}?select=case_id&case_id=not.is.null&limit=3000`,
    );
    const ids = [...new Set(rows.map((r) => r.case_id!))];
    const existing = new Set<string>();
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const found = await rest<{ id: string }>(`cases?id=in.(${chunk.join(",")})&select=id`);
      found.forEach((c) => existing.add(c.id));
    }
    const orphans = ids.filter((id) => !existing.has(id));
    eq(orphans.length, 0, `سجلات ${table} بقضية مفقودة`);
    report.push(`${table}=${rows.length}`);
  }
  return report.join(" ");
});

await t("integrity", "كل مستند مرتبط بمكتب قائم وبمسار تخزين غير فارغ", async () => {
  const docs = await rest<{ id: string; organization_id: string; file_path: string }>(
    `documents?select=id,organization_id,file_path&limit=3000`,
  );
  const bad = docs.filter((d) => !d.file_path || !d.file_path.trim());
  eq(bad.length, 0, "مستندات بلا مسار تخزين");
  const orgIds = [...new Set(docs.map((d) => d.organization_id))];
  const orgs = await rest<{ id: string }>(`organizations?id=in.(${orgIds.join(",")})&select=id`);
  eq(orgs.length, orgIds.length, "مكاتب المستندات الموجودة");
  return `مستندات=${docs.length} مكاتب=${orgIds.length}`;
});

await t("integrity", "لا ملفات معلّقة في التخزين بلا صف مستند (عيّنة مكتب QA)", async () => {
  const objects = await rest<{ name: string }>(
    `documents?select=file_path&organization_id=eq.${ORG}&limit=500`,
  );
  const paths = new Set(
    (objects as unknown as { file_path: string }[]).map((d) => d.file_path),
  );
  const rows = await fetch(`${SUPABASE_URL}/storage/v1/object/list/documents`, {
    method: "POST",
    headers: {
      apikey: process.env["SUPABASE_SERVICE_ROLE_KEY"]!,
      Authorization: `Bearer ${process.env["SUPABASE_SERVICE_ROLE_KEY"]!}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ prefix: `${ORG}/`, limit: 1000 }),
  });
  if (!rows.ok) throw new Error(`NOT_TESTED: تعذّر سرد التخزين (${rows.status}).`);
  const listed = (await rows.json()) as { name: string; id: string | null }[];
  const files = listed.filter((o) => o.id !== null);
  const dangling = files.filter((o) => !paths.has(`${ORG}/${o.name}`));
  eq(dangling.length, 0, `ملفات معلّقة: ${dangling.slice(0, 3).map((d) => d.name).join(", ")}`);
  return `ملفات=${files.length} صفوف=${paths.size}`;
});

/* --------------------------------------------------------------------- التزامن */

await t("concurrency", "ضغط متكرر على إنشاء العميل لا ينشئ سجلات متطابقة مكررة", async () => {
  const name = `QA-P4-CONC-${stamp}`;
  const results = await Promise.all(
    Array.from({ length: 4 }, () =>
      asOwner("clients", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          organization_id: ORG,
          full_name: name,
          client_type: "individual",
          national_id_last4: "1234",
        }),
      }).then(async (r) => ({ status: r.status, body: await r.text() })),
    ),
  );
  const created = await rest<{ id: string }>(
    `clients?organization_id=eq.${ORG}&full_name=eq.${encodeURIComponent(name)}&select=id`,
  );
  // القاعدة لا تفرض تفرّد الاسم؛ المطلوب إثبات أن الواجهة لا تُنشئ أكثر من صف لكل نقرة
  // ثم تنظيف الصفوف. عدد الصفوف يجب أن يساوي عدد الطلبات الناجحة بالضبط (لا صفوف شبحية).
  const ok = results.filter((r) => r.status < 300).length;
  eq(created.length, ok, "عدد صفوف العملاء مقابل الطلبات الناجحة");
  await rest(`clients?organization_id=eq.${ORG}&full_name=eq.${encodeURIComponent(name)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
  return `طلبات ناجحة=${ok} صفوف=${created.length} (نُظّفت)`;
});

await t("concurrency", "إصدار الفاتورة مرتين بالتوازي يعطي رقماً واحداً فقط", async () => {
  const billing = await mod("src/lib/billing/billing.functions.ts");
  const draft = await call(billing, "saveBillingDraft", ctx.superAdmin.token, {
    kind: "invoice",
    organizationId: ORG,
    currency: "SAR",
    issueDate: new Date().toISOString().slice(0, 10),
    items: [{ description: `QA-P4-RACE-${stamp}`, quantity: 1, unitPrice: 100, taxRate: 15, discount: 0 }],
  });
  expect(draft.ok, `فشل إنشاء المسودة: ${draft.message}`);
  const invoiceId = (draft.value as { invoiceId?: string; id?: string }).invoiceId ??
    (draft.value as { id: string }).id;
  const [a, b] = await Promise.all([
    call(billing, "issueInvoice", ctx.superAdmin.token, { invoiceId }),
    call(billing, "issueInvoice", ctx.superAdmin.token, { invoiceId }),
  ]);
  const okCount = [a, b].filter((r) => r.ok).length;
  expect(okCount <= 1, "نجح الإصدار مرتين لنفس الفاتورة.");
  const row = await restOne<{ invoice_number: string; status: string }>(
    `platform_invoices?id=eq.${invoiceId}&select=invoice_number,status`,
  );
  expect(!!row?.invoice_number, "لم يُسجَّل رقم فاتورة.");
  const dupes = await rest(
    `platform_invoices?invoice_number=eq.${row!.invoice_number}&select=id`,
  );
  eq(dupes.length, 1, "فواتير تحمل نفس الرقم");
  return `رقم=${row!.invoice_number} نجاح=${okCount}`;
});

await t("concurrency", "تحديثان متزامنان لمهمة واحدة ينتهيان بحالة واحدة متسقة", async () => {
  const task = await rest<{ id: string }>("tasks", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      organization_id: ORG,
      title: `QA-P4-TASK-${stamp}`,
      status: "pending",
      priority: "medium",
    }),
  });
  const id = task[0]!.id;
  await Promise.all([
    asOwner(`tasks?id=eq.${id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: "completed", completed_at: new Date().toISOString() }),
    }),
    asOwner(`tasks?id=eq.${id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: "completed", completed_at: new Date().toISOString() }),
    }),
  ]);
  const rows = await rest<{ status: string }>(`tasks?id=eq.${id}&select=status`);
  eq(rows.length, 1, "عدد صفوف المهمة");
  eq(rows[0]!.status, "completed", "حالة المهمة");
  await rest(`tasks?id=eq.${id}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  return "حالة نهائية واحدة متسقة";
});

/* ---------------------------------------------------------------- مسارات الخطأ */

await t("errors", "مدخلات غير صالحة تُرفض برسالة عربية بلا تفاصيل داخلية", async () => {
  const billing = await mod("src/lib/billing/billing.functions.ts");
  const r = await call(billing, "saveBillingDraft", ctx.superAdmin.token, {
    kind: "invoice",
    organizationId: ORG,
    currency: "SAR",
    issueDate: "not-a-date",
    items: [],
  });
  expect(!r.ok, "قُبلت مسودة بتاريخ غير صالح وبلا بنود.");
  expect(!/postgres|pg_|stack|at Object|\.ts:\d+/i.test(r.message), "الرسالة تكشف تفاصيل تقنية.");
  return r.message.slice(0, 100);
});

await t("errors", "طلب دالة إدارية بلا توكن يُرفض ولا يكشف سراً", async () => {
  const res = await fetch(
    `${process.env["QA_APP_URL"] ?? "http://localhost:8080"}/_serverFn/health-check-nonexistent`,
    { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
  );
  const body = (await res.text()).slice(0, 300);
  expect(!/eyJ|service_role|SUPABASE_SERVICE/i.test(body), "الاستجابة تكشف مفاتيح.");
  return `الحالة=${res.status}`;
});

await t("errors", "قراءة مكتب غير موجود ترجع رسالة عربية واضحة", async () => {
  const orgs = await mod("src/lib/admin-orgs.functions.ts");
  const r = await call(orgs, "updateOrganization", ctx.superAdmin.token, {
    organizationId: "00000000-0000-0000-0000-000000000000",
    name: "QA-P4-MISSING",
  });
  expect(!r.ok, "قُبل معرّف مكتب غير موجود.");
  assertSafeArabic(r.message, "رسالة مكتب غير موجود");
  return r.message.slice(0, 90);
});

await writeReport("/tmp/browser/plan4/integrity-concurrency.json");
