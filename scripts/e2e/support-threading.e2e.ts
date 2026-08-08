/**
 * اختبار حي لسيناريو: رسالة صادرة دخلت من مسار غير الدعم، ثم ردود من نفس
 * المحادثة — يجب أن تُلحق بتذكرة واحدة فقط بلا تكرار، مع تسجيل المصدر
 * وسبب الارتباط.
 *
 * التشغيل: bun run scripts/e2e/support-threading.e2e.ts
 */
const URL_ = "http://localhost:8080/api/public/hooks/email-inbound";
const SECRET = process.env["EMAIL_INBOUND_SECRET"] ?? "";
if (!SECRET) throw new Error("EMAIL_INBOUND_SECRET غير متاح في البيئة.");
const TAG = `QA-SUPPORT-THREAD-${Date.now()}`;
const SUPPORT_MAILBOX = "afc05949-24c2-49e6-bef3-c86a7965e5e4";
const CLIENT = "qa.threading@mehlaqa.test";

type Res = { status: number; body: Record<string, unknown> };
async function post(payload: unknown): Promise<Res> {
  const res = await fetch(URL_, {
    method: "POST",
    headers: { "content-type": "application/json", "x-mehla-inbound-secret": SECRET },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : {} };
}

const results: { id: string; name: string; ok: boolean; detail: string }[] = [];
async function test(id: string, name: string, fn: () => Promise<string | void>) {
  try {
    const detail = (await fn()) || "";
    results.push({ id, name, ok: true, detail });
    console.log(`✅ ${id} ${name} ${detail}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ id, name, ok: false, detail });
    console.log(`❌ ${id} ${name} → ${detail}`);
  }
}
function expect(cond: unknown, message: string) {
  if (!cond) throw new Error(message);
}

const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
const db = supabaseAdmin;

/* 1) محادثة صادرة أُنشئت من مسار لا يمرّ بمركز الدعم (بلا تذكرة). */
const outboundMessageId = `<${crypto.randomUUID()}@mehlalex.com>`;
let outboundThreadId = "";
await test("THR-01", "محادثة صادرة بلا تذكرة (مسار غير الدعم)", async () => {
  const { data: thread, error: threadError } = await db
    .from("email_threads")
    .insert({
      mailbox_id: SUPPORT_MAILBOX,
      subject: `${TAG} عرض سعر`,
      folder: "sent",
      participants: [CLIENT, "support@mehlalex.com"],
      message_count: 1,
    })
    .select("id")
    .single();
  if (threadError) throw new Error(threadError.message);
  outboundThreadId = thread.id;
  const { error: msgError } = await db.from("email_messages").insert({
    thread_id: outboundThreadId,
    mailbox_id: SUPPORT_MAILBOX,
    message_id: outboundMessageId,
    direction: "outbound",
    status: "sent",
    from_address: "support@mehlalex.com",
    to_addresses: [CLIENT],
    subject: `${TAG} عرض سعر`,
    body_text: "رسالة صادرة من مسار غير الدعم.",
    sent_at: new Date().toISOString(),
  });
  if (msgError) throw new Error(msgError.message);
  expect(!thread.ticket_id, "المحادثة أُنشئت مرتبطة بتذكرة");
  return `thread=${outboundThreadId.slice(0, 8)} بلا ticket_id`;
});

/* 2) الرد الأول من العميل على نفس المحادثة. */
const reply1 = `<${crypto.randomUUID()}@example.invalid>`;
let ticketId = "";
await test("THR-02", "رد العميل يُنشئ تذكرة واحدة على نفس المحادثة", async () => {
  const r = await post({
    to: "support@mehlalex.com",
    from: CLIENT,
    fromName: "عميل اختبار الترابط",
    subject: `Re: ${TAG} عرض سعر`,
    text: "سؤال متابعة على العرض.",
    messageId: reply1,
    inReplyTo: outboundMessageId,
    references: [outboundMessageId],
  });
  expect(r.status === 200 && r.body["success"], `HTTP ${r.status} ${JSON.stringify(r.body)}`);
  const { data: message } = await db
    .from("email_messages")
    .select("id, thread_id, ticket_id")
    .eq("message_id", reply1)
    .maybeSingle();
  expect(message, "لم تُحفظ الرسالة الواردة");
  expect(message!.thread_id === outboundThreadId, "أُنشئت محادثة جديدة بدل الربط بالصادرة");
  expect(message!.ticket_id, "لم تُربط الرسالة بتذكرة");
  ticketId = message!.ticket_id as string;
  const { data: ingest } = await db
    .from("support_ticket_ingest")
    .select("outcome, source, match_reason, provider_message_id")
    .eq("email_message_id", message!.id)
    .single();
  expect(ingest.source === "inbound_webhook", `المصدر ${ingest.source}`);
  expect(ingest.outcome === "created", `النتيجة ${ingest.outcome}`);
  return `تذكرة جديدة، المصدر=${ingest.source}، السبب=${ingest.match_reason ?? "—"}`;
});

/* 3) رد ثانٍ على نفس المحادثة يُلحق بالتذكرة نفسها. */
const reply2 = `<${crypto.randomUUID()}@example.invalid>`;
await test("THR-03", "رد ثانٍ يُلحق بنفس التذكرة بلا تذكرة جديدة", async () => {
  const r = await post({
    to: "support@mehlalex.com",
    from: CLIENT,
    fromName: "عميل اختبار الترابط",
    subject: `Re: ${TAG} عرض سعر`,
    text: "تفاصيل إضافية.",
    messageId: reply2,
    inReplyTo: reply1,
    references: [outboundMessageId, reply1],
  });
  expect(r.status === 200 && r.body["success"], `HTTP ${r.status} ${JSON.stringify(r.body)}`);
  const { data: message } = await db
    .from("email_messages")
    .select("id, thread_id, ticket_id")
    .eq("message_id", reply2)
    .maybeSingle();
  expect(message?.thread_id === outboundThreadId, "لم يُربط الرد بنفس المحادثة");
  expect(message?.ticket_id === ticketId, "أُنشئت تذكرة ثانية للرد");
  const { data: ingest } = await db
    .from("support_ticket_ingest")
    .select("outcome, source, match_reason")
    .eq("email_message_id", message!.id)
    .single();
  expect(ingest.outcome === "appended", `النتيجة ${ingest.outcome}`);
  return `appended، السبب=${ingest.match_reason ?? "—"}`;
});

/* 4) إعادة إرسال نفس الرد لا تُنشئ صفوفاً أو تذاكر مكررة. */
await test("THR-04", "إعادة إرسال نفس الرد تُعلَّم كمكررة بلا تكرار", async () => {
  const before = await db
    .from("support_ticket_messages")
    .select("id", { count: "exact", head: true })
    .eq("ticket_id", ticketId);
  const r = await post({
    to: "support@mehlalex.com",
    from: CLIENT,
    fromName: "عميل اختبار الترابط",
    subject: `Re: ${TAG} عرض سعر`,
    text: "تفاصيل إضافية.",
    messageId: reply2,
    inReplyTo: reply1,
    references: [outboundMessageId, reply1],
  });
  expect(r.body["duplicate"] === true, `لم تُعلَّم كمكررة: ${JSON.stringify(r.body)}`);
  const after = await db
    .from("support_ticket_messages")
    .select("id", { count: "exact", head: true })
    .eq("ticket_id", ticketId);
  expect(before.count === after.count, `رسائل التذكرة ${before.count}→${after.count}`);
  const { count: ticketCount } = await db
    .from("support_tickets")
    .select("id", { count: "exact", head: true })
    .eq("source_email_thread_id", outboundThreadId);
  return `duplicate=true، رسائل=${after.count}، تذاكر المحادثة=${ticketCount}`;
});

/* 5) عدد التذاكر على المحادثة يبقى واحداً وربط المحادثة صحيح. */
await test("THR-05", "تذكرة واحدة فقط مرتبطة بالمحادثة", async () => {
  const { data: thread } = await db
    .from("email_threads")
    .select("ticket_id, message_count")
    .eq("id", outboundThreadId)
    .single();
  expect(thread.ticket_id === ticketId, "ticket_id على المحادثة غير مطابق");
  const { data: linked } = await db
    .from("support_tickets")
    .select("id, ticket_number")
    .or(`source_email_thread_id.eq.${outboundThreadId},id.eq.${ticketId}`);
  expect(linked.length === 1, `عدد التذاكر ${linked.length}`);
  return `تذكرة ${linked[0].ticket_number}، رسائل المحادثة=${thread.message_count}`;
});

/* -------------------------------------------------- تنظيف بريد الاختبار فقط */
const { data: qaMessages } = await db
  .from("email_messages")
  .select("id")
  .eq("thread_id", outboundThreadId);
const qaIds = ((qaMessages ?? []) as { id: string }[]).map((m) => m.id);
if (qaIds.length) {
  await db.from("email_inbound_events").delete().eq("thread_id", outboundThreadId);
  await db
    .from("support_ticket_messages")
    .update({ email_message_id: null })
    .in("email_message_id", qaIds);
  await db
    .from("support_ticket_events")
    .update({ email_message_id: null })
    .in("email_message_id", qaIds);
  await db
    .from("support_ticket_ingest")
    .update({ email_message_id: null })
    .in("email_message_id", qaIds);
  await db.from("email_messages").delete().eq("thread_id", outboundThreadId);
}
await db.from("email_threads").update({ ticket_id: null }).eq("id", outboundThreadId);
await db.from("email_threads").delete().eq("id", outboundThreadId);

const passed = results.filter((r) => r.ok).length;
console.log(
  `\n=== النتيجة: ${passed}/${results.length} ناجح — التذكرة ${ticketId || "—"} تبقى كسجل تدقيق ===`,
);
for (const r of results.filter((r) => !r.ok)) console.log(`FAIL ${r.id} ${r.name}: ${r.detail}`);
process.exit(results.some((r) => !r.ok) ? 1 : 0);
