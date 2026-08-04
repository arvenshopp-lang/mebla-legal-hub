/**
 * اختبار E2E فعلي لمركز البريد — المسار الصادر والمرفقات وعزل الصناديق.
 * يعمل على قاعدة البيانات الحقيقية ببيانات اختبار معزولة (عناوين .invalid)،
 * ومزوّد إرسال محاكى محلياً حتى لا يُرسل بريد حقيقي أثناء الاختبار.
 *
 * التشغيل: bun run scripts/e2e/mail-outbound.e2e.ts
 */
import http from "node:http";

const PROVIDER_PORT = 8899;
process.env["LOVABLE_SEND_URL"] = `http://127.0.0.1:${PROVIDER_PORT}/send`;
process.env["LOVABLE_API_KEY"] ||= "test-key";

type ProviderCall = { idempotencyKey: string | null; body: Record<string, unknown> };
const calls: ProviderCall[] = [];
let providerMode: "ok" | "fail" = "ok";

const provider = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    calls.push({
      idempotencyKey: (req.headers["idempotency-key"] as string) ?? null,
      body: JSON.parse(raw || "{}"),
    });
    if (providerMode === "fail") {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "provider_unavailable" }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ success: true, workflow_id: `mock-${calls.length}` }));
  });
});
await new Promise<void>((r) => provider.listen(PROVIDER_PORT, "127.0.0.1", r));

const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
const e = await import("@/lib/email/workspace.server");
const att = await import("@/lib/email/attachments.server");
const db = supabaseAdmin as never as any; // eslint-disable-line

/* -------------------------------------------------- إطار الاختبار */
type Result = { id: string; name: string; ok: boolean; detail: string };
const results: Result[] = [];
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
async function expectThrows(fn: () => Promise<unknown>, contains: string) {
  try {
    await fn();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (!msg.includes(contains)) throw new Error(`رسالة غير متوقعة: ${msg}`);
    return msg;
  }
  throw new Error("لم يُرفض كما هو مطلوب");
}

/* -------------------------------------------------- بيانات الاختبار */
const RECIPIENT = "e2e.recipient@example.invalid";
const RECIPIENT2 = "e2e.second@example.invalid";
const ACTOR = { userId: null as unknown as string, email: "e2e.tester@mehlalex.com" };
const TAG = `E2E-${Date.now()}`;
const threadIds = new Set<string>();

const { data: boxRows } = await db
  .from("email_mailboxes")
  .select("id, address, type, department_id");
const boxes = new Map<string, { id: string; type: string; department_id: string | null }>(
  (boxRows as { id: string; address: string; type: string; department_id: string | null }[]).map(
    (b) => [b.address.split("@")[0]!, b],
  ),
);
const support = boxes.get("support")!;
const sales = boxes.get("sales")!;
const billing = boxes.get("billing")!;
const legal = boxes.get("legal")!;
const info = boxes.get("info")!;
const noreply = boxes.get("noreply")!;

const scope = (departmentId: string | null, extra?: Partial<{ isSuper: boolean; canManage: boolean }>) => ({
  isSuper: extra?.isSuper ?? false,
  canManage: extra?.canManage ?? false,
  departmentId,
});
const superScope = scope(null, { isSuper: true });
const supportScope = scope(support.department_id);
const salesScope = scope(sales.department_id);
const financeScope = scope(billing.department_id);
const legalScope = scope(legal.department_id);
const noDeptScope = scope(null);

const compose = (over: Partial<Parameters<typeof e.saveDraft>[2]> = {}) => ({
  mailboxId: support.id,
  to: [RECIPIENT],
  cc: [],
  bcc: [],
  subject: `${TAG} موضوع اختباري`,
  html: "<p>نص الرسالة الاختبارية</p>",
  ...over,
});

const bytes = {
  pdf: () => {
    const head = new TextEncoder().encode("%PDF-1.7\n% اختبار\n");
    const body = new Uint8Array(2048).fill(0x20);
    return new Uint8Array([...head, ...body]);
  },
  png: () => {
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return new Uint8Array([...sig, ...new Uint8Array(512).fill(1)]);
  },
  exe: () => new Uint8Array([0x4d, 0x5a, ...new Uint8Array(64).fill(0)]),
  oversize: () => new Uint8Array(11 * 1024 * 1024).fill(0x25),
};

/* ================================================== 1) البريد الصادر */
let draftId = "";
let draftThread = "";
await test("OUT-01", "إنشاء مسودة جديدة", async () => {
  const r = await e.saveDraft(db, ACTOR, compose());
  draftId = r.messageId;
  draftThread = r.threadId;
  threadIds.add(r.threadId);
  const { data } = await db.from("email_messages").select("status, message_id, thread_id").eq("id", draftId).single();
  expect(data.status === "draft", `الحالة ${data.status}`);
  expect(/^<[0-9a-f-]{36}@mehlalex\.com>$/.test(data.message_id), "Message-ID غير مطابق للصيغة");
  const { data: th } = await db.from("email_threads").select("folder").eq("id", draftThread).single();
  expect(th.folder === "drafts", `المجلد ${th.folder}`);
  await e.writeEmailAudit(db, ACTOR, { action: "email.draft.save", threadId: draftThread, messageId: draftId, description: TAG });
  return "مسودة + Message-ID صحيح";
});

await test("OUT-02", "تعديل المسودة", async () => {
  await e.saveDraft(db, ACTOR, compose({ draftId, threadId: draftThread, subject: `${TAG} موضوع معدّل`, html: "<p>نص محدّث</p>" }));
  const { data } = await db.from("email_messages").select("subject, body_text").eq("id", draftId).single();
  expect(data.subject.endsWith("معدّل"), "لم يُحدَّث الموضوع");
  expect(data.body_text.includes("محدّث"), "لم يُحدَّث النص");
  await e.writeEmailAudit(db, ACTOR, { action: "email.draft.save", messageId: draftId, description: TAG });
  return "تحديث الموضوع والنص";
});

let sentTextId = "";
await test("OUT-03", "إرسال رسالة نصية", async () => {
  providerMode = "ok";
  const before = calls.length;
  const r = await e.queueMessage(db, ACTOR, compose({ subject: `${TAG} نصية`, html: "نص عادي بدون وسوم" }));
  threadIds.add(r.threadId);
  sentTextId = r.messageId;
  expect(r.sent, "لم تُرسل");
  expect(calls.length === before + 1, "عدد نداءات المزوّد غير صحيح");
  const { data } = await db.from("email_messages").select("status, sent_at, provider_ref").eq("id", r.messageId).single();
  expect(data.status === "sent" && data.sent_at && data.provider_ref, "حالة الرسالة غير مكتملة");
  await e.writeEmailAudit(db, ACTOR, { action: "email.message.sent", threadId: r.threadId, messageId: r.messageId, description: TAG });
  return "status=sent + provider_ref";
});

let htmlThread = "";
await test("OUT-04", "إرسال رسالة HTML", async () => {
  const r = await e.queueMessage(db, ACTOR, compose({ subject: `${TAG} HTML`, html: "<h2>عنوان</h2><p>فقرة <b>غامقة</b></p>" }));
  threadIds.add(r.threadId);
  htmlThread = r.threadId;
  expect(r.sent, "لم تُرسل");
  const body = calls.at(-1)!.body as { html: string; text: string };
  expect(body.html.includes("<h2>"), "HTML لم يصل للمزوّد");
  expect(!body.text.includes("<h2>"), "النسخة النصية تحتوي وسوماً");
  await e.writeEmailAudit(db, ACTOR, { action: "email.message.sent", threadId: r.threadId, messageId: r.messageId, description: TAG });
  return "HTML + نسخة نصية مجرّدة";
});

let attachedMessageId = "";
let attachmentId = "";
await test("OUT-05", "إرسال رسالة بمرفق آمن", async () => {
  const d = await e.saveDraft(db, ACTOR, compose({ subject: `${TAG} بمرفق` }));
  threadIds.add(d.threadId);
  attachedMessageId = d.messageId;
  const stored = await att.storeAttachment(db, {
    messageId: d.messageId, direction: "outbound", fileName: "عقد اختباري.pdf", bytes: bytes.pdf(),
    uploadedByEmail: ACTOR.email,
  });
  attachmentId = stored.id;
  const r = await e.queueMessage(db, ACTOR, compose({ subject: `${TAG} بمرفق`, draftId: d.messageId, threadId: d.threadId }));
  expect(r.sent, "لم تُرسل");
  const body = calls.at(-1)!.body as { html: string };
  expect(body.html.includes("المرفقات (1)") && body.html.includes("/storage/v1/object/sign/"), "رابط المرفق الموقّع غير موجود");
  return "مرفق مُسلَّم كرابط موقّع";
});

await test("OUT-06", "الرد Reply داخل نفس المحادثة", async () => {
  const { data: first } = await db.from("email_messages").select("message_id").eq("thread_id", htmlThread).limit(1).single();
  const r = await e.queueMessage(db, ACTOR, compose({ subject: `${TAG} HTML`, threadId: htmlThread, inReplyTo: first.message_id, html: "<p>رد</p>" }));
  expect(r.threadId === htmlThread, "أُنشئت محادثة جديدة بدل الرد");
  const { count } = await db.from("email_messages").select("id", { count: "exact", head: true }).eq("thread_id", htmlThread);
  expect((count ?? 0) >= 2, "لم تُضف رسالة الرد");
  return `رسائل المحادثة: ${count}`;
});

await test("OUT-07", "الرد على الجميع Reply All (To + CC)", async () => {
  const r = await e.queueMessage(db, ACTOR, compose({ subject: `${TAG} HTML`, threadId: htmlThread, to: [RECIPIENT, RECIPIENT2], cc: ["e2e.cc@example.invalid"], html: "<p>رد على الجميع</p>" }));
  const body = calls.at(-1)!.body as { to: string; cc: string };
  expect(body.to.includes(RECIPIENT2), "المستلم الثاني مفقود");
  expect(body.cc?.includes("e2e.cc@example.invalid"), "CC مفقود");
  const { data: th } = await db.from("email_threads").select("participants").eq("id", r.threadId).single();
  expect(th.participants.includes("e2e.cc@example.invalid"), "CC لم يُضف للمشاركين");
  return "To وCC صحيحان";
});

await test("OUT-08", "التحويل Forward مع المرفق", async () => {
  const d = await e.saveDraft(db, ACTOR, compose({ subject: `إعادة توجيه: ${TAG} بمرفق`, to: [RECIPIENT2] }));
  threadIds.add(d.threadId);
  await att.storeAttachment(db, { messageId: d.messageId, direction: "outbound", fileName: "عقد اختباري.pdf", bytes: bytes.pdf() });
  const r = await e.queueMessage(db, ACTOR, compose({ subject: `إعادة توجيه: ${TAG} بمرفق`, to: [RECIPIENT2], draftId: d.messageId, threadId: d.threadId }));
  expect(r.sent, "لم تُرسل");
  const body = calls.at(-1)!.body as { html: string };
  expect(body.html.includes("المرفقات (1)"), "المرفق لم يُنقل مع التحويل");
  return "التحويل يحمل المرفق";
});

let scheduledId = "";
await test("OUT-09", "جدولة رسالة", async () => {
  const before = calls.length;
  const when = new Date(Date.now() + 3600_000).toISOString();
  const r = await e.queueMessage(db, ACTOR, compose({ subject: `${TAG} مجدولة`, scheduledAt: when }));
  threadIds.add(r.threadId);
  scheduledId = r.messageId;
  expect(!r.sent, "أُرسلت رغم الجدولة");
  expect(calls.length === before, "استُدعي المزوّد رغم الجدولة");
  const { data } = await db.from("email_outbox").select("status, scheduled_at").eq("message_id", scheduledId).single();
  expect(data.status === "scheduled", `حالة القائمة ${data.status}`);
  return "scheduled بلا استدعاء للمزوّد";
});

await test("OUT-10", "إلغاء رسالة مجدولة قبل الإرسال", async () => {
  await e.discardDraft(db, scheduledId);
  const { data: msg } = await db.from("email_messages").select("id").eq("id", scheduledId).maybeSingle();
  const { data: job } = await db.from("email_outbox").select("id").eq("message_id", scheduledId).maybeSingle();
  expect(!msg && !job, "بقيت آثار للرسالة الملغاة");
  await e.writeEmailAudit(db, ACTOR, { action: "email.draft.discard", messageId: scheduledId, description: TAG });
  return "حُذفت من الرسائل وقائمة الإرسال";
});

let failedId = "";
await test("OUT-11", "فشل المزوّد ثم Retry ناجح", async () => {
  providerMode = "fail";
  const r = await e.queueMessage(db, ACTOR, compose({ subject: `${TAG} فشل ثم إعادة` }));
  threadIds.add(r.threadId);
  failedId = r.messageId;
  expect(!r.sent && r.failureRef, "لم يُسجَّل مرجع عطل");
  const { data: job } = await db.from("email_outbox").select("status, attempts, last_error_code, next_attempt_at").eq("message_id", failedId).single();
  expect(job.attempts === 1 && job.status === "queued", `القائمة ${job.status}/${job.attempts}`);
  expect(new Date(job.next_attempt_at).getTime() > Date.now(), "لم يُطبَّق التراجع الزمني");
  providerMode = "ok";
  await db.from("email_outbox").update({ status: "queued", next_attempt_at: new Date().toISOString() }).eq("message_id", failedId);
  const retry = await e.dispatchOne(db, failedId);
  expect(retry.sent, "فشلت إعادة المحاولة");
  const { data: msg } = await db.from("email_messages").select("status, failure_ref").eq("id", failedId).single();
  expect(msg.status === "sent" && msg.failure_ref === null, "لم تُنظَّف حالة العطل");
  await e.writeEmailAudit(db, ACTOR, { action: "email.message.retry", messageId: failedId, description: TAG });
  return `مرجع العطل ${r.failureRef} ثم نجاح`;
});

await test("OUT-12", "منع الإرسال المكرر لنفس الرسالة", async () => {
  const msg = await expectThrows(() => e.queueMessage(db, ACTOR, compose({ subject: `${TAG} نصية`, draftId: sentTextId })), "أُرسلت");
  const again = await e.dispatchOne(db, sentTextId);
  expect(!again.sent, "أُعيد إرسال رسالة مُرسلة");
  return msg;
});

await test("OUT-13", "ثبات Message-ID وThread-ID", async () => {
  const { data } = await db.from("email_messages").select("id, message_id, thread_id").eq("id", sentTextId).single();
  const { data: dupe } = await db.from("email_messages").select("id").eq("message_id", data.message_id);
  expect(dupe.length === 1, "Message-ID مكرر");
  expect(data.thread_id, "Thread-ID مفقود");
  return "معرّفات فريدة ومرتبطة";
});

await test("OUT-14", "ظهور الرسائل في Sent وOutbox بالحالة الصحيحة", async () => {
  const { data: th } = await db.from("email_threads").select("folder").eq("id", htmlThread).single();
  expect(th.folder === "sent", `مجلد المحادثة ${th.folder}`);
  const sentList = await e.listThreads(db, { mailboxId: support.id, folder: "sent" });
  expect(sentList.threads.some((t) => t.id === htmlThread), "المحادثة غير ظاهرة في المُرسل");
  const { data: outboxRows } = await db.from("email_outbox").select("status").eq("message_id", sentTextId).single();
  expect(outboxRows.status === "sent", `حالة القائمة ${outboxRows.status}`);
  return `Sent=${sentList.total}`;
});

await test("OUT-15", "سجل التدقيق يغطي كل خطوة", async () => {
  const { data } = await db.from("email_audit_logs").select("action").ilike("description", `%${TAG}%`);
  const actions = new Set((data as { action: string }[]).map((r) => r.action));
  for (const a of ["email.draft.save", "email.message.sent", "email.draft.discard", "email.message.retry"]) {
    expect(actions.has(a), `إجراء مفقود: ${a}`);
  }
  return `${data.length} قيد تدقيق`;
});

/* ================================================== 2) المرفقات */
let draft2 = { messageId: "", threadId: "" };
await test("ATT-01", "قبول ملف PDF سليم", async () => {
  draft2 = await e.saveDraft(db, ACTOR, compose({ subject: `${TAG} مرفقات` }));
  threadIds.add(draft2.threadId);
  const s = await att.storeAttachment(db, { messageId: draft2.messageId, direction: "outbound", fileName: "مذكرة.pdf", bytes: bytes.pdf() });
  expect(s.mime_type === "application/pdf", "نوع خاطئ");
  return s.file_name;
});
await test("ATT-02", "قبول صورة PNG", async () => {
  const s = await att.storeAttachment(db, { messageId: draft2.messageId, direction: "outbound", fileName: "صورة.png", bytes: bytes.png() });
  expect(s.is_inline_safe, "الصورة لم تُعلَّم كآمنة للعرض");
  return s.mime_type;
});
await test("ATT-03", "رفض ملف تنفيذي", () =>
  expectThrows(() => att.storeAttachment(db, { messageId: draft2.messageId, direction: "outbound", fileName: "virus.exe", bytes: bytes.exe() }), ""));
await test("ATT-04", "رفض امتداد مزيّف لا يطابق التوقيع الفعلي", () =>
  expectThrows(() => att.storeAttachment(db, { messageId: draft2.messageId, direction: "outbound", fileName: "تقرير.pdf", bytes: bytes.png() }), "توقيع"));
await test("ATT-05", "رفض ملف يتجاوز الحجم", () =>
  expectThrows(() => att.storeAttachment(db, { messageId: draft2.messageId, direction: "outbound", fileName: "كبير.pdf", bytes: bytes.oversize() }), "10"));
await test("ATT-06", "تعدد المرفقات في رسالة واحدة", async () => {
  const { count } = await db.from("email_attachments").select("id", { count: "exact", head: true }).eq("message_id", draft2.messageId);
  expect((count ?? 0) === 2, `عدد المرفقات ${count}`);
  return "مرفقان مقبولان";
});
await test("ATT-07", "رفض تكرار نفس الملف في الرسالة", () =>
  expectThrows(() => att.storeAttachment(db, { messageId: draft2.messageId, direction: "outbound", fileName: "مذكرة.pdf", bytes: bytes.pdf() }), "مسبقاً"));

let signedUrl = "";
await test("ATT-08", "الرابط الموقّع يعمل ومدته قصيرة (5 دقائق)", async () => {
  const link = await att.signedAttachmentUrl(db, attachmentId, { download: true });
  signedUrl = link.url;
  const token = new URL(link.url, "http://x").searchParams.get("token")!;
  const claims = JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString());
  expect(claims.exp - claims.iat === 300, `TTL=${claims.exp - claims.iat}`);
  const res = await fetch(link.url);
  expect(res.status === 200, `تنزيل فاشل ${res.status}`);
  await e.writeEmailAudit(db, ACTOR, { action: "email.attachment.download", messageId: attachedMessageId, description: TAG });
  await att.bumpDownloadCount(db, attachmentId);
  const { data } = await db.from("email_attachments").select("download_count").eq("id", attachmentId).single();
  expect(data.download_count >= 1, "لم يُسجَّل التنزيل");
  return "200 + TTL=300ث + عدّاد تنزيل";
});

await test("ATT-09", "رابط بتوقيع مُتلاعب به يُرفض", async () => {
  const url = new URL(signedUrl);
  const token = url.searchParams.get("token")!;
  const parts = token.split(".");
  parts[2] = parts[2]!.slice(0, -6) + "abcdef";
  url.searchParams.set("token", parts.join("."));
  const res = await fetch(url.toString());
  expect(res.status >= 400, `قبل رمزاً غير صالح (${res.status})`);
  return `رفض التوقيع المُتلاعب به (${res.status})`;
});

await test("ATT-10", "منع الوصول للمرفق من صندوق غير مصرّح", async () => {
  const { data } = await db.from("email_messages").select("mailbox_id").eq("id", attachedMessageId).single();
  return await expectThrows(() => e.assertMailboxAccess(db, data.mailbox_id, salesScope), "لا تملك وصولاً");
});

await test("ATT-11", "عدم تكرار المرفق عند إعادة المحاولة", async () => {
  const before = await att.listAttachments(db, attachedMessageId);
  await e.dispatchOne(db, attachedMessageId);
  const after = await att.listAttachments(db, attachedMessageId);
  expect(before.length === after.length, "تضاعفت المرفقات");
  return `${after.length} مرفق`;
});

await test("ATT-12", "الحذف مسموح للمسودة وممنوع بعد الإرسال", async () => {
  const list = await att.listAttachments(db, draft2.messageId);
  await att.deleteAttachment(db, list[0]!.id);
  await e.writeEmailAudit(db, ACTOR, { action: "email.attachment.delete", messageId: draft2.messageId, description: TAG });
  const after = await att.listAttachments(db, draft2.messageId);
  expect(after.length === 1, "لم يُحذف المرفق");
  await expectThrows(() => att.deleteAttachment(db, attachmentId), "أُرسلت");
  return "حذف مسودة ✓ / منع بعد الإرسال ✓";
});

/* ================================================== 4) عزل الصناديق والصلاحيات */
await test("PERM-01", "موظف الدعم يرى support (والعام) فقط", async () => {
  const ids = await e.allowedMailboxIds(db, supportScope);
  expect(ids!.includes(support.id) && ids!.includes(info.id), "صندوق مفقود");
  expect(!ids!.includes(sales.id) && !ids!.includes(billing.id) && !ids!.includes(legal.id), "تسريب صناديق أقسام أخرى");
  return `${ids!.length} صندوق`;
});
await test("PERM-02", "موظف المبيعات يرى sales فقط", async () => {
  const ids = await e.allowedMailboxIds(db, salesScope);
  expect(ids!.includes(sales.id) && !ids!.includes(support.id), "عزل غير صحيح");
  return "معزول";
});
await test("PERM-03", "موظف المالية يرى billing فقط", async () => {
  const ids = await e.allowedMailboxIds(db, financeScope);
  expect(ids!.includes(billing.id) && !ids!.includes(legal.id), "عزل غير صحيح");
  return "معزول";
});
await test("PERM-04", "الموظف القانوني يرى legal فقط", async () => {
  const ids = await e.allowedMailboxIds(db, legalScope);
  expect(ids!.includes(legal.id) && !ids!.includes(support.id), "عزل غير صحيح");
  return "معزول";
});
await test("PERM-05", "موظف بلا قسم يرى الصندوق العام info فقط", async () => {
  const ids = await e.allowedMailboxIds(db, noDeptScope);
  expect(ids!.length === 1 && ids![0] === info.id, `صناديق: ${ids!.length}`);
  const boxesVisible = await e.listMailboxes(db, noDeptScope);
  expect(!boxesVisible.some((b) => b.type === "system"), "صندوق النظام ظاهر لموظف عادي");
  return "info فقط";
});
await test("PERM-06", "قراءة صندوق غير مصرّح مرفوضة خادمياً", () =>
  expectThrows(() => e.assertMailboxAccess(db, billing.id, supportScope), "لا تملك وصولاً"));
await test("PERM-07", "منع الإرسال من صندوق النظام noreply", () =>
  expectThrows(() => e.saveDraft(db, ACTOR, compose({ mailboxId: noreply.id })), "صندوق النظام"));
await test("PERM-08", "منع الإسناد على محادثة خارج نطاق الموظف", () =>
  expectThrows(() => e.assertThreadAccess(db, htmlThread, salesScope), "لا تملك وصولاً"));
await test("PERM-09", "منع إضافة ملاحظة على محادثة خارج النطاق", () =>
  expectThrows(() => e.assertThreadAccess(db, htmlThread, financeScope), "لا تملك وصولاً"));
await test("PERM-10", "مدير المنصة يرى كل الصناديق", async () => {
  const ids = await e.allowedMailboxIds(db, superScope);
  expect(ids === null, "قُيّد مدير المنصة");
  return "بلا تقييد";
});

/* ================================================== 5) المحادثات والإسناد */
await test("THR-01", "إسناد المحادثة لموظف ثم تغييره", async () => {
  const { data: staff } = await db.from("platform_staff").select("user_id, email").limit(1).single();
  await e.assignThread(db, { threadId: htmlThread, staffUserId: staff.user_id, staffEmail: staff.email });
  let { data } = await db.from("email_threads").select("assigned_to_email").eq("id", htmlThread).single();
  expect(data.assigned_to_email === staff.email, "لم يُسند");
  await e.assignThread(db, { threadId: htmlThread, staffUserId: null, staffEmail: null });
  ({ data } = await db.from("email_threads").select("assigned_to_email").eq("id", htmlThread).single());
  expect(data.assigned_to_email === null, "لم يُلغَ الإسناد");
  return "إسناد ثم إلغاء";
});
await test("THR-02", "إضافة وإزالة تسمية", async () => {
  const labels = await e.listLabels(db);
  await e.setThreadLabels(db, { threadId: htmlThread, labelIds: [labels[0]!.id] });
  let { count } = await db.from("email_thread_labels").select("thread_id", { count: "exact", head: true }).eq("thread_id", htmlThread);
  expect(count === 1, "لم تُضف التسمية");
  await e.setThreadLabels(db, { threadId: htmlThread, labelIds: [] });
  ({ count } = await db.from("email_thread_labels").select("thread_id", { count: "exact", head: true }).eq("thread_id", htmlThread));
  expect(count === 0, "لم تُزل التسمية");
  return "إضافة/إزالة";
});
await test("THR-03", "ملاحظة داخلية لا تُرسل للعميل", async () => {
  const before = calls.length;
  await e.addNote(db, { threadId: htmlThread, authorId: null as unknown as string, authorEmail: ACTOR.email, body: `${TAG} ملاحظة داخلية` });
  expect(calls.length === before, "استُدعي المزوّد عند إضافة ملاحظة");
  const detail = await e.getThread(db, htmlThread);
  expect(detail.notes.length === 1, "لم تُحفظ الملاحظة");
  expect(!detail.messages.some((m) => (m.html ?? "").includes("ملاحظة داخلية")), "الملاحظة تسربت لنص الرسائل");
  return "محفوظة داخلياً فقط";
});
await test("THR-04", "تعليم مقروء/غير مقروء ونجمة", async () => {
  await e.setThreadFlags(db, { threadId: htmlThread, is_unread: true, is_starred: true });
  let { data } = await db.from("email_threads").select("is_unread, is_starred").eq("id", htmlThread).single();
  expect(data.is_unread && data.is_starred, "لم تُطبَّق العلامات");
  await e.setThreadFlags(db, { threadId: htmlThread, is_unread: false, is_starred: false });
  ({ data } = await db.from("email_threads").select("is_unread, is_starred").eq("id", htmlThread).single());
  expect(!data.is_unread && !data.is_starred, "لم تُلغَ العلامات");
  return "مقروء/نجمة";
});
await test("THR-05", "أرشفة ثم استرجاع ثم مهملات", async () => {
  await e.moveThread(db, { threadId: htmlThread, folder: "archive" });
  let { data } = await db.from("email_threads").select("folder").eq("id", htmlThread).single();
  expect(data.folder === "archive", `المجلد ${data.folder}`);
  await e.restoreThread(db, htmlThread);
  ({ data } = await db.from("email_threads").select("folder").eq("id", htmlThread).single());
  expect(data.folder === "sent", `الاسترجاع أعاد إلى ${data.folder}`);
  await e.moveThread(db, { threadId: htmlThread, folder: "trash" });
  ({ data } = await db.from("email_threads").select("folder").eq("id", htmlThread).single());
  expect(data.folder === "trash", "لم تُنقل للمهملات");
  await e.restoreThread(db, htmlThread);
  return "archive → restore → trash → restore";
});

/* -------------------------------------------------- تنظيف */
const ids = [...threadIds, draft2.threadId].filter(Boolean);
const { data: msgs } = await db.from("email_messages").select("id").in("thread_id", ids);
for (const m of (msgs ?? []) as { id: string }[]) {
  const { data: atts } = await db.from("email_attachments").select("storage_path").eq("message_id", m.id);
  const paths = ((atts ?? []) as { storage_path: string }[]).map((a) => a.storage_path);
  if (paths.length) await db.storage.from("email-attachments").remove(paths);
}
await db.from("email_outbox").delete().in("message_id", (msgs ?? []).map((m: { id: string }) => m.id));
await db.from("email_notes").delete().in("thread_id", ids);
await db.from("email_thread_labels").delete().in("thread_id", ids);
await db.from("email_messages").delete().in("thread_id", ids);
await db.from("email_threads").delete().in("id", ids);

provider.close();
const passed = results.filter((r) => r.ok).length;
console.log(`\n=== النتيجة: ${passed}/${results.length} ناجح ===`);
for (const r of results.filter((r) => !r.ok)) console.log(`FAIL ${r.id} ${r.name}: ${r.detail}`);
await Bun.write("/tmp/mail-outbound-results.json", JSON.stringify(results, null, 2));
process.exit(results.some((r) => !r.ok) ? 1 : 0);
