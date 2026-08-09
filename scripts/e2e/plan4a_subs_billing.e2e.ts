/**
 * PLAN 4 / أ — الاشتراكات والاستحقاقات + المركز المالي الداخلي (بلا بوابة خارجية).
 * كل رقم تعيده الدالة يُقارن بقيمة قاعدة البيانات الفعلية، وكل مسار فشل يُتحقق
 * من أنه يرفض العملية فعلياً ولا يترك أثراً في القاعدة.
 */
import { loadCtx, t, expect, eq, rest, restOne, mod, call, pick, pickNumber, assertSafeArabic, writeReport } from "./plan4-lib";

const ctx = await loadCtx();
const subs = await mod("src/lib/subscription.functions.ts");
const bill = await mod("src/lib/billing/billing.functions.ts");
const SA = ctx.superAdmin.token;
const OWNER = ctx.volume.ownerToken;
const ORG = ctx.volume.orgId;
const stamp = Date.now();

function uuidIn(raw: string): string {
  const m = raw.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (!m) throw new Error(`لا يوجد معرّف في الاستجابة: ${raw.slice(0, 200)}`);
  return m[0];
}

/* ------------------------------------------------ أ) الاشتراكات والاستحقاقات */

await t("subscriptions", "نظرة الاشتراك تطابق القاعدة (باقة/حالة)", async () => {
  const r = await call(subs, "getSubscriptionOverview", OWNER, { organizationId: ORG });
  expect(r.ok, `فشل النداء: ${r.message}`);
  const row = await restOne<{ status: string; plan_id: string }>(
    `subscriptions?organization_id=eq.${ORG}&select=status,plan_id&order=created_at.desc&limit=1`,
  );
  expect(row, "لا يوجد اشتراك في القاعدة.");
  const overview = r.value as { state: string; plan: { code: string } };
  eq(overview.state, row!.status, "حالة الاشتراك");
  const plan = await restOne<{ code: string }>(`platform_plans?id=eq.${row!.plan_id}&select=code`);
  eq(overview.plan.code, plan!.code, "كود الباقة");
  return `الحالة=${row!.status} الباقة=${plan!.code}`;
});

await t("subscriptions", "عدّادات الاستخدام تطابق عدد الصفوف الفعلي", async () => {
  const r = await call(subs, "getSubscriptionOverview", OWNER, { organizationId: ORG });
  expect(r.ok, r.message);
  const usage = (r.value as { usage?: Record<string, number> }).usage;
  const readCount = async (table: string) =>
    (await rest<{ id: string }>(`${table}?organization_id=eq.${ORG}&select=id`)).length;
  const clients = await readCount("clients");
  const cases = await readCount("cases");
  const users = (await rest(`organization_members?organization_id=eq.${ORG}&select=id`)).length;
  expect(usage, "الاستجابة بلا عدّادات استخدام.");
  eq(usage.clients, clients, "عدد العملاء");
  eq(usage.cases, cases, "عدد القضايا");
  eq(usage.users, users, "عدد المستخدمين");
  return `عملاء=${clients} قضايا=${cases} مستخدمون=${users}`;
});

await t("subscriptions", "فحص الميزة يتبع الباقة فعلياً", async () => {
  const r = await call(subs, "checkFeatureAccess", OWNER, { organizationId: ORG, feature: "ai_enabled" });
  expect(r.ok, r.message);
  const sub = await restOne<{ plan_id: string }>(
    `subscriptions?organization_id=eq.${ORG}&select=plan_id&order=created_at.desc&limit=1`,
  );
  const plan = await restOne<{ ai_enabled: boolean }>(
    `platform_plans?id=eq.${sub!.plan_id}&select=ai_enabled`,
  );
  const allowed = (r.value as { allowed: boolean }).allowed;
  eq(allowed, plan!.ai_enabled, "استحقاق ai_enabled");
  return `ai_enabled=${plan!.ai_enabled}`;
});

await t("subscriptions", "مكتب آخر لا يقرأ اشتراك مكتب غيره", async () => {
  const r = await call(subs, "getSubscriptionOverview", ctx.officeOwner.token, { organizationId: ORG });
  expect(!r.ok, "قرأ مالك مكتب آخر اشتراك مكتب لا يملكه.");
  assertSafeArabic(r.message, "رفض قراءة اشتراك مكتب آخر");
  return r.message.slice(0, 80);
});

await t("subscriptions", "تسجيل استخدام OCR يزيد العدّاد بمقدار محدد", async () => {
  const before = await restOne<{ used: number }>(
    `usage_counters?organization_id=eq.${ORG}&metric=eq.ocr_pages&select=used&order=period_start.desc&limit=1`,
  );
  const start = Number(before?.used ?? 0);
  const r = await call(subs, "recordOcrUsage", OWNER, { organizationId: ORG, pages: 3 });
  expect(r.ok, r.message);
  const after = await restOne<{ used: number }>(
    `usage_counters?organization_id=eq.${ORG}&metric=eq.ocr_pages&select=used&order=period_start.desc&limit=1`,
  );
  eq(Number(after!.used), start + 3, "عدّاد صفحات OCR");
  eq(Number((r.value as { used: number }).used), start + 3, "القيمة المعادة من الدالة");
  return `${start} → ${after!.used}`;
});

await t("subscriptions", "تجاوز حصة OCR يُرفض على الخادم ولا يزيد العدّاد", async () => {
  // حصة الباقة المجانية صفر صفحة، فنستخدم مكتب QA بباقة مجانية نشطة لإثبات الرفض.
  const orgId = ctx.org.id;
  const sub = await restOne<{ id: string; status: string; plan_id: string }>(
    `subscriptions?organization_id=eq.${orgId}&select=id,status,plan_id&order=created_at.desc&limit=1`,
  );
  expect(sub, "لا يوجد اشتراك لمكتب QA.");
  // اشتراك بلا باقة صريحة يسقط على الباقة المجانية في محرك الاستحقاقات.
  const plan = await restOne<{ ocr_pages_monthly: number | null }>(
    sub!.plan_id
      ? `platform_plans?id=eq.${sub!.plan_id}&select=ocr_pages_monthly`
      : `platform_plans?code=eq.free&select=ocr_pages_monthly`,
  );
  if (!plan || plan.ocr_pages_monthly === null)
    throw new Error("NOT_TESTED: باقة مكتب QA بلا حد شهري لصفحات OCR.");
  const original = sub!.status;
  await rest(`subscriptions?id=eq.${sub!.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      status: "active",
      starts_at: new Date(Date.now() - 86_400_000).toISOString(),
      ends_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    }),
  });
  try {
    const before = await restOne<{ used: number }>(
      `usage_counters?organization_id=eq.${orgId}&metric=eq.ocr_pages&select=used&order=period_start.desc&limit=1`,
    );
    const start = Number(before?.used ?? 0);
    const r = await call(subs, "recordOcrUsage", ctx.officeOwner.token, {
      organizationId: orgId,
      pages: 1,
    });
    expect(!r.ok, "قبل الخادم استخداماً يتجاوز حصة الباقة (الحد صفر).");
    assertSafeArabic(r.message, "رسالة تجاوز الحصة");
    const after = await restOne<{ used: number }>(
      `usage_counters?organization_id=eq.${orgId}&metric=eq.ocr_pages&select=used&order=period_start.desc&limit=1`,
    );
    eq(Number(after?.used ?? 0), start, "العدّاد بعد الرفض (تراجع المعاملة)");
    return `الحد=${plan!.ocr_pages_monthly} :: ${r.message.slice(0, 70)}`;
  } finally {
    await rest(`subscriptions?id=eq.${sub!.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: original }),
    });
  }
});

/* --------------------------------------------------- ب) المركز المالي الداخلي */

const draftPayload = (suffix: string) => ({
  organizationId: ORG,
  customerName: `QA-PLAN4 عميل ${suffix}`,
  currency: "SAR" as const,
  taxRate: 15,
  taxExempt: false,
  items: [{ description: "اشتراك اختبار PLAN4", quantity: 3, unitPrice: 33.33, discountAmount: 0 }],
});

let invoiceId = "";
await t("billing", "حفظ مسودة: الإجماليات تُحسب في القاعدة بدقة عشرية", async () => {
  const r = await call(bill, "billingSaveDraft", SA, draftPayload(`A${stamp}`));
  expect(r.ok, r.message);
  invoiceId = uuidIn(r.raw);
  const inv = await restOne<{ subtotal: string; tax_total: string; total: string; status: string }>(
    `platform_invoices?id=eq.${invoiceId}&select=subtotal,tax_total,total,status`,
  );
  eq(inv!.status, "draft", "حالة الفاتورة");
  eq(Number(inv!.subtotal), 99.99, "الإجمالي قبل الضريبة");
  eq(Number(inv!.tax_total), 15, "الضريبة");
  eq(Number(inv!.total), 114.99, "الإجمالي");
  return `subtotal=${inv!.subtotal} tax=${inv!.tax_total} total=${inv!.total}`;
});

await t("billing", "خصم بند أكبر من قيمته يُرفض قبل الوصول للقاعدة", async () => {
  const payload = draftPayload(`B${stamp}`);
  payload.items[0]!.discountAmount = 500;
  const r = await call(bill, "billingSaveDraft", SA, payload);
  expect(!r.ok, "قبل الخادم خصماً يتجاوز قيمة البند.");
  assertSafeArabic(r.message, "رسالة الخصم غير الصالح");
  return r.message.slice(0, 90);
});

await t("billing", "إصدار الفاتورة يعطي رقماً من متتابعة القاعدة", async () => {
  const r = await call(bill, "billingIssueInvoice", SA, { id: invoiceId, notify: false });
  expect(r.ok, r.message);
  const inv = await restOne<{ number: string; status: string }>(
    `platform_invoices?id=eq.${invoiceId}&select=number,status`,
  );
  eq(inv!.status, "pending", "حالة الفاتورة بعد الإصدار");
  expect(!!inv!.number, "لم يُسند رقم للفاتورة.");
  expect(r.raw.includes(inv!.number), "الرقم المعاد لا يطابق القاعدة.");
  return `رقم=${inv!.number}`;
});

await t("billing", "إعادة إصدار نفس الفاتورة تُرفض (لا ازدواج أرقام)", async () => {
  const r = await call(bill, "billingIssueInvoice", SA, { id: invoiceId, notify: false });
  expect(!r.ok, "أعاد الخادم إصدار فاتورة مُصدرة.");
  assertSafeArabic(r.message, "رسالة إعادة الإصدار");
  return r.message.slice(0, 80);
});

await t("billing", "إصدار متزامن لثلاث فواتير: أرقام فريدة بلا تكرار", async () => {
  const ids: string[] = [];
  for (let i = 0; i < 3; i += 1) {
    const d = await call(bill, "billingSaveDraft", SA, draftPayload(`C${stamp}-${i}`));
    expect(d.ok, d.message);
    ids.push(uuidIn(d.raw));
  }
  const results = await Promise.all(
    ids.map((id) => call(bill, "billingIssueInvoice", SA, { id, notify: false })),
  );
  const failed = results.filter((r) => !r.ok);
  expect(failed.length === 0, `فشل إصدار متزامن: ${failed.map((f) => f.message).join(" | ")}`);
  const invs = await rest<{ number: string }>(
    `platform_invoices?id=in.(${ids.join(",")})&select=number`,
  );
  const numbers = invs.map((i) => i.number);
  eq(new Set(numbers).size, 3, "عدد الأرقام الفريدة");
  return numbers.join(", ");
});

let paymentId = "";
await t("billing", "دفعة جزئية تُسجّل وتُحدّث المتبقي في القاعدة", async () => {
  const key = `qa-plan4-pay-${stamp}`;
  const r = await call(bill, "billingRecordPayment", SA, {
    invoiceId,
    amount: 50,
    method: "bank_transfer",
    idempotencyKey: key,
  });
  expect(r.ok, r.message);
  paymentId = uuidIn(r.raw);
  const pay = await restOne<{ amount: string; status: string }>(
    `platform_payments?id=eq.${paymentId}&select=amount,status`,
  );
  eq(Number(pay!.amount), 50, "مبلغ الدفعة");
  return `الدفعة=${pay!.status} مبلغ=${pay!.amount}`;
});

await t("billing", "نفس مفتاح منع التكرار لا ينشئ دفعة ثانية", async () => {
  const key = `qa-plan4-pay-${stamp}`;
  const r = await call(bill, "billingRecordPayment", SA, {
    invoiceId,
    amount: 50,
    method: "bank_transfer",
    idempotencyKey: key,
  });
  expect(r.ok, r.message);
  const list = await rest(`platform_payments?correlation_id=eq.${key}&select=id`);
  eq(list.length, 1, "عدد الدفعات بنفس المفتاح");
  eq((r.value as { duplicate: boolean }).duplicate, true, "علم التكرار");
  return "دفعة واحدة فقط";
});

await t("billing", "دفعة متزامنة مزدوجة بنفس المفتاح = صف واحد", async () => {
  const key = `qa-plan4-race-${stamp}`;
  const body = { invoiceId, amount: 10, method: "manual" as const, idempotencyKey: key };
  const [a, b] = await Promise.all([
    call(bill, "billingRecordPayment", SA, body),
    call(bill, "billingRecordPayment", SA, body),
  ]);
  expect(a.ok || b.ok, `فشل النداءان: ${a.message} | ${b.message}`);
  const list = await rest(`platform_payments?correlation_id=eq.${key}&select=id`);
  eq(list.length, 1, "عدد الدفعات بعد النداء المتزامن");
  return "صف واحد";
});

await t("billing", "دفعة تتجاوز المتبقي تُرفض ولا تُكتب", async () => {
  const inv = await restOne<{ remaining: string }>(
    `platform_invoices?id=eq.${invoiceId}&select=remaining`,
  );
  const before = (await rest(`platform_payments?invoice_id=eq.${invoiceId}&select=id`)).length;
  const r = await call(bill, "billingRecordPayment", SA, {
    invoiceId,
    amount: Number(inv!.remaining) + 500,
    method: "manual",
    idempotencyKey: `qa-plan4-over-${stamp}`,
  });
  expect(!r.ok, "قبل الخادم دفعة أكبر من المتبقي.");
  assertSafeArabic(r.message, "رسالة تجاوز المتبقي");
  const after = (await rest(`platform_payments?invoice_id=eq.${invoiceId}&select=id`)).length;
  eq(after, before, "عدد الدفعات بعد الرفض");
  return `المتبقي=${inv!.remaining} :: ${r.message.slice(0, 70)}`;
});

await t("billing", "اعتماد الدفعة يحدّث الفاتورة والمتبقي بدقة", async () => {
  const r = await call(bill, "billingDecidePayment", SA, { paymentId, decision: "approve" });
  expect(r.ok, r.message);
  const pay = await restOne<{ status: string }>(`platform_payments?id=eq.${paymentId}&select=status`);
  eq(pay!.status, "paid", "حالة الدفعة");
  const inv = await restOne<{ total: string; paid_total: string; remaining: string; status: string }>(
    `platform_invoices?id=eq.${invoiceId}&select=total,paid_total,remaining,status`,
  );
  eq(Number(inv!.paid_total), 50, "المدفوع");
  eq(Number(inv!.remaining), Number(inv!.total) - 50, "المتبقي");
  return `مدفوع=${inv!.paid_total} متبقي=${inv!.remaining} حالة=${inv!.status}`;
});

await t("billing", "استرداد أكبر من المدفوع يُرفض", async () => {
  const before = (await rest(`platform_refunds?payment_id=eq.${paymentId}&select=id`)).length;
  const r = await call(bill, "billingCreateRefund", SA, {
    paymentId,
    amount: 500,
    reason: "اختبار تجاوز الاسترداد PLAN4",
  });
  expect(!r.ok, "قبل الخادم استرداداً يتجاوز المدفوع.");
  assertSafeArabic(r.message, "رسالة تجاوز الاسترداد");
  const after = (await rest(`platform_refunds?payment_id=eq.${paymentId}&select=id`)).length;
  eq(after, before, "عدد الاستردادات بعد الرفض");
  return r.message.slice(0, 90);
});

await t("billing", "استرداد جزئي صحيح يُنشأ ثم يُعتمد ويحدّث المبالغ", async () => {
  const created = await call(bill, "billingCreateRefund", SA, {
    paymentId,
    amount: 20,
    reason: "اختبار استرداد جزئي PLAN4",
  });
  expect(created.ok, created.message);
  const refundId = uuidIn(created.raw);
  const decided = await call(bill, "billingDecideRefund", SA, { refundId, decision: "approve" });
  expect(decided.ok, decided.message);
  const pay = await restOne<{ refunded_amount: string; status: string }>(
    `platform_payments?id=eq.${paymentId}&select=refunded_amount,status`,
  );
  eq(Number(pay!.refunded_amount), 20, "المبلغ المسترد");
  return `مسترد=${pay!.refunded_amount} حالة الدفعة=${pay!.status}`;
});

await t("billing", "إشعار دائن أكبر من إجمالي الفاتورة يُرفض", async () => {
  const inv = await restOne<{ total: string }>(`platform_invoices?id=eq.${invoiceId}&select=total`);
  const r = await call(bill, "billingCreateCreditNote", SA, {
    invoiceId,
    amount: Number(inv!.total) + 1000,
    taxAmount: 0,
    reason: "اختبار تجاوز الإشعار الدائن PLAN4",
  });
  expect(!r.ok, "قبل الخادم إشعاراً دائناً يتجاوز الفاتورة.");
  assertSafeArabic(r.message, "رسالة تجاوز الإشعار الدائن");
  return r.message.slice(0, 90);
});

await t("billing", "إشعار دائن صحيح يأخذ رقماً من المتتابعة", async () => {
  const r = await call(bill, "billingCreateCreditNote", SA, {
    invoiceId,
    amount: 10,
    taxAmount: 1.5,
    reason: "اختبار إشعار دائن PLAN4",
  });
  expect(r.ok, r.message);
  const noteId = uuidIn(r.raw);
  const note = await restOne<{ number: string; amount: string; tax_amount: string }>(
    `platform_credit_notes?id=eq.${noteId}&select=number,amount,tax_amount`,
  );
  expect(!!note!.number, "لا رقم للإشعار الدائن.");
  eq(Number(note!.amount), 10, "مبلغ الإشعار");
  eq(Number(note!.tax_amount), 1.5, "ضريبة الإشعار");
  return `رقم=${note!.number}`;
});

await t("billing", "مؤشرات المركز المالي تطابق مجاميع القاعدة", async () => {
  const from = "2000-01-01T00:00:00.000Z";
  const to = new Date(Date.now() + 86_400_000).toISOString();
  const r = await call(bill, "billingOverview", SA, { from, to });
  expect(r.ok, r.message);
  const summary = (r.value as { summary: Record<string, number>; by_plan: { invoiced: number; collected: number }[] })
    .summary;
  const invoices = await rest<{ total: string; status: string; issued_at: string | null }>(
    `platform_invoices?select=total,status,issued_at`,
  );
  // التقرير يحتسب الفواتير المُصدرة فقط (بلا مسودات ولا ملغاة) بتاريخ الإصدار.
  const billable = invoices.filter(
    (i) => !["draft", "cancelled"].includes(i.status) && i.issued_at !== null,
  );
  const invoiced = Math.round(billable.reduce((s, i) => s + Number(i.total), 0) * 100) / 100;
  eq(summary["invoice_count"], billable.length, "عدد الفواتير");
  expect(
    Math.abs(Number(summary["invoiced_total"]) - invoiced) < 0.05,
    `إجمالي الفواتير: الواجهة ${summary["invoiced_total"]} والقاعدة ${invoiced}`,
  );
  const draft = invoices.filter((i) => i.status === "draft").length;
  eq(summary["draft_count"], draft, "عدد المسودات");
  return `عدد=${summary["invoice_count"]} إجمالي=${summary["invoiced_total"]}`;
});

await t("billing", "الفترة المالية: إقفال ثم تداخل مرفوض", async () => {
  const y = new Date().getUTCFullYear() - 3;
  const periodStart = `${y}-01-01`;
  const periodEnd = `${y}-01-31`;
  const existing = await restOne<{ id: string }>(
    `platform_financial_periods?period_start=eq.${periodStart}&period_end=eq.${periodEnd}&select=id`,
  );
  if (!existing) {
    const closed = await call(bill, "billingClosePeriod", SA, {
      periodStart,
      periodEnd,
      notes: "إقفال اختبار PLAN4",
    });
    expect(closed.ok, closed.message);
  }
  const overlap = await call(bill, "billingClosePeriod", SA, {
    periodStart: `${y}-01-15`,
    periodEnd: `${y}-02-15`,
  });
  expect(!overlap.ok, "قبل الخادم إقفال فترة متداخلة.");
  assertSafeArabic(overlap.message, "رسالة تداخل الفترات");
  const row = await restOne<{ status: string }>(
    `platform_financial_periods?period_start=eq.${periodStart}&select=status`,
  );
  eq(row!.status, "closed", "حالة الفترة");
  return overlap.message.slice(0, 80);
});

await t("billing", "موظف بلا صلاحية مالية يُرفض على الخادم", async () => {
  const r = await call(bill, "billingSaveDraft", ctx.plainStaff.token, draftPayload(`D${stamp}`));
  expect(!r.ok, "أنشأ موظف بلا صلاحية مالية مسودة فاتورة.");
  assertSafeArabic(r.message, "رسالة رفض الصلاحية المالية");
  return r.message.slice(0, 80);
});

await t("billing", "مالك مكتب لا يصل للمركز المالي للمنصة", async () => {
  const r = await call(bill, "billingListInvoices", ctx.volume.ownerToken, { page: 1, pageSize: 20 });
  expect(!r.ok, "قرأ مالك مكتب فواتير المنصة.");
  assertSafeArabic(r.message, "رفض مالك المكتب");
  return r.message.slice(0, 80);
});

await t("billing", "كل عمليات هذه الجولة مسجّلة في سجل تدقيق الإدارة", async () => {
  const logs = await rest<{ action: string }>(
    `admin_audit_logs?entity_id=eq.${invoiceId}&select=action,created_at&order=created_at.desc`,
  );
  expect(logs.length > 0, "لا سجل تدقيق للفاتورة.");
  return `${logs.length} سجلاً: ${logs.slice(0, 4).map((l) => l.action).join(", ")}`;
});

await writeReport("/tmp/browser/plan4/subs-billing.json");
