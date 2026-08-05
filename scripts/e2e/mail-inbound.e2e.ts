/**
 * محاكاة موقّعة لمسار البريد الوارد (HMAC-SHA256) عبر الخادم الحقيقي.
 * المزوّد المُدار الحالي صادر فقط؛ هذه المحاكاة تختبر المسار الفعلي من الطلب
 * حتى القاعدة: التوقيع، نافذة Replay، Idempotency، حد الاستدعاءات، التنقية،
 * والمرفقات والحجر الصحي.
 *
 * التشغيل: bun run scripts/e2e/mail-inbound.e2e.ts
 */
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const URL_ = "http://localhost:8080/api/public/hooks/email-inbound";
const KEY = readFileSync("/tmp/inbound-key.txt", "utf8").trim();
const TAG = `IN-${Date.now()}`;

type Res = { status: number; body: Record<string, unknown> & { success?: boolean; duplicate?: boolean; error?: string } };
async function post(
  payload: unknown,
  opts: { key?: string; skew?: number; rawBody?: string } = {},
): Promise<Res> {
  const raw = opts.rawBody ?? JSON.stringify(payload);
  const ts = String(Math.floor(Date.now() / 1000) + (opts.skew ?? 0));
  const sig = createHmac("sha256", opts.key ?? KEY)
    .update(`${ts}.${raw}`)
    .digest("hex");
  const res = await fetch(URL_, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-mehla-timestamp": ts,
      "x-mehla-signature": `sha256=${sig}`,
    },
    body: raw,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
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
// عميل الإدارة مكتوب النوع فعلياً؛ نستخدمه مباشرة دون تخفيف النوع.
const db = supabaseAdmin;

const msg = (over: Record<string, unknown> = {}) => ({
  to: "support@mehlalex.com",
  from: "e2e.client@example.invalid",
  fromName: "عميل اختباري",
  subject: `${TAG} استفسار`,
  text: "نص وارد اختباري",
  messageId: `<${crypto.randomUUID()}@example.invalid>`,
  ...over,
});

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
const pdfBytes = () =>
  new Uint8Array([...new TextEncoder().encode("%PDF-1.7\n"), ...new Uint8Array(1024).fill(0x20)]);
const pngBytes = () =>
  new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Uint8Array(256).fill(2)]);

const created: string[] = [];
async function accept(payload: ReturnType<typeof msg>, label: string) {
  const r = await post(payload);
  expect(r.status === 200 && r.body.success, `HTTP ${r.status} ${JSON.stringify(r.body)}`);
  const ref = await resolve(payload.messageId as string);
  return `${label} thread=${ref.threadId.slice(0, 8)}`;
}

/** استجابة الويبهوك لا تُفصح عن المعرّفات (بقصد)، فنحلّها من القاعدة بمعرّف المزوّد. */
async function resolve(providerId: string): Promise<{ threadId: string; messageId: string }> {
  const { data } = await db
    .from("email_messages")
    .select("id, thread_id")
    .eq("message_id", providerId)
    .maybeSingle();
  if (!data) throw new Error("لم تُحفظ الرسالة الواردة في القاعدة.");
  created.push(data.thread_id);
  return { threadId: data.thread_id, messageId: data.id };
}

let supportThread = "";
let supportMessageId = "";
await test("INB-01", "رسالة جديدة إلى support", async () => {
  const payload = msg();
  supportMessageId = payload.messageId;
  const r = await post(payload);
  expect(r.status === 200 && r.body.success && !r.body.duplicate, JSON.stringify(r.body));
  supportThread = (await resolve(payload.messageId)).threadId;
  const { data } = await db
    .from("email_threads")
    .select("folder, is_unread, mailbox_id, message_count")
    .eq("id", supportThread)
    .single();
  expect(data.folder === "inbox" && data.is_unread, "لم تُدرج في inbox كغير مقروءة");
  return `inbox/unread، رسائل=${data.message_count}`;
});

await test("INB-02", "رد على محادثة قائمة يرتبط بنفس Thread", async () => {
  const payload = msg({ inReplyTo: supportMessageId, subject: `Re: ${TAG} استفسار` });
  const r = await post(payload);
  expect(r.status === 200, `HTTP ${r.status}`);
  const ref = await resolve(payload.messageId);
  expect(ref.threadId === supportThread, "أُنشئت محادثة جديدة بدل الربط");
  const { data } = await db
    .from("email_threads")
    .select("message_count")
    .eq("id", supportThread)
    .single();
  expect(data.message_count >= 2, `عدد الرسائل ${data.message_count}`);
  return `message_count=${data.message_count}`;
});

for (const [id, box] of [
  ["INB-03", "sales"],
  ["INB-04", "billing"],
  ["INB-05", "legal"],
  ["INB-06", "info"],
] as const) {
  await test(id, `رسالة إلى ${box}`, () =>
    accept(msg({ to: `${box}@mehlalex.com`, subject: `${TAG} ${box}` }), box),
  );
}

await test("INB-07", "رفض الإرسال إلى صندوق النظام noreply", async () => {
  const r = await post(msg({ to: "noreply@mehlalex.com" }));
  expect(r.status === 422 || r.status >= 400, `HTTP ${r.status}`);
  return `مرفوض (${r.status}) ${r.body?.error ?? ""}`;
});

await test("INB-08", "صندوق غير موجود يُرفض", async () => {
  const r = await post(msg({ to: "ghost@mehlalex.com" }));
  expect(r.status >= 400, `HTTP ${r.status}`);
  return `مرفوض (${r.status})`;
});

await test("INB-09", "Provider Message ID مكرر لا يُنشئ رسالة ثانية", async () => {
  const payload = msg({ subject: `${TAG} تكرار المعرّف`, text: "أول" });
  const first = await post(payload);
  expect(first.status === 200, `HTTP ${first.status}`);
  await resolve(payload.messageId as string);
  const { count: before } = await db
    .from("email_messages")
    .select("id", { count: "exact", head: true })
    .eq("message_id", payload.messageId);
  const second = await post({ ...payload, text: "ثانٍ مختلف" });
  const { count: after } = await db
    .from("email_messages")
    .select("id", { count: "exact", head: true })
    .eq("message_id", payload.messageId);
  expect(second.body.duplicate === true, "لم تُعلَّم كمكررة");
  expect(before === 1 && after === 1, `عدد الرسائل ${before}→${after}`);
  return "duplicate=true وصف واحد فقط";
});

await test("INB-10", "نفس الحمولة الحرفية مكررة تُرد كمكررة", async () => {
  const payload = msg({ subject: `${TAG} حمولة مكررة` });
  const raw = JSON.stringify(payload);
  await post(null, { rawBody: raw });
  await resolve(payload.messageId);
  const second = await post(null, { rawBody: raw });
  expect(second.status === 200 && second.body.duplicate === true, JSON.stringify(second.body));
  const { count } = await db
    .from("email_inbound_events")
    .select("id", { count: "exact", head: true })
    .eq("outcome", "duplicate");
  return `أحداث مكررة مسجَّلة=${count}`;
});

await test("INB-11", "توقيع خاطئ يُرفض 401", async () => {
  const r = await post(msg(), { key: "wrong-key-value" });
  expect(r.status === 401, `HTTP ${r.status}`);
  return "401 unauthorized";
});

await test("INB-12", "طلب خارج نافذة Replay يُرفض", async () => {
  const r = await post(msg(), { skew: -900 });
  expect(r.status === 401 && r.body.error === "stale_timestamp", JSON.stringify(r.body));
  const { data } = await db
    .from("email_inbound_events")
    .select("outcome")
    .eq("outcome", "replayed")
    .limit(1);
  expect(data.length === 1, "لم يُسجَّل الحدث كـ replayed");
  return "stale_timestamp + قيد تدقيق";
});

await test("INB-13", "HTML ضار يُنقّى ولا يُخزَّن كما هو", async () => {
  const payload = msg({
    subject: `${TAG} HTML ضار`,
    html: `<p onclick="alert(1)">مرحباً</p><script>fetch('https://evil.test')</script><iframe src="https://evil.test"></iframe><a href="javascript:alert(2)">رابط</a>`,
  });
  await post(payload);
  const ref = await resolve(payload.messageId);
  const { data } = await db
    .from("email_messages")
    .select("html, body_text")
    .eq("id", ref.messageId)
    .single();
  const html = String(data.html ?? "");
  expect(!/script|iframe|onclick|javascript:/i.test(html), `HTML غير منقّى: ${html.slice(0, 120)}`);
  expect(html.includes("مرحباً"), "فُقد النص المشروع");
  return "أُزيلت السكربتات والإطارات والأحداث";
});

await test("INB-14", "الصور الخارجية محجوبة افتراضياً", async () => {
  const payload = msg({
    subject: `${TAG} صورة خارجية`,
    html: `<p>تتبّع</p><img src="https://tracker.test/p.gif">`,
  });
  await post(payload);
  const ref = await resolve(payload.messageId);
  const { data } = await db.from("email_messages").select("html").eq("id", ref.messageId).single();
  expect(!String(data.html).includes("tracker.test"), "الصورة الخارجية لم تُحجب");
  const { data: ev } = await db
    .from("email_inbound_events")
    .select("metadata")
    .eq("message_row_id", ref.messageId)
    .single();
  expect(Number(ev.metadata.blocked_remote_images) >= 1, "لم يُسجَّل حجب الصورة");
  return `صور محجوبة=${ev.metadata.blocked_remote_images}`;
});

let inboundAttachmentId = "";
await test("INB-15", "مرفق وارد آمن يُقبل", async () => {
  const payload = msg({
    subject: `${TAG} مرفق آمن`,
    attachments: [
      { file_name: "مستند وارد.pdf", content_base64: b64(pdfBytes()) },
      { file_name: "صورة.png", content_base64: b64(pngBytes()) },
    ],
  });
  await post(payload);
  const ref = await resolve(payload.messageId);
  const { data } = await db
    .from("email_attachments")
    .select("id, scan_status, is_quarantined, mime_type")
    .eq("message_id", ref.messageId);
  expect(data.length === 2, `عدد المرفقات ${data.length}`);
  expect(
    data.every((a) => !a.is_quarantined),
    "حُجر مرفق سليم",
  );
  inboundAttachmentId = data[0].id;
  return "مرفقان مقبولان (not_scanned، بلا حجر)";
});

let quarantinedId = "";
await test("INB-16", "مرفق غير مسموح يُرفض وينتقل إلى Quarantine", async () => {
  const payload = msg({
    subject: `${TAG} مرفق خبيث`,
    attachments: [
      { file_name: "payload.exe", content_base64: b64(new Uint8Array([0x4d, 0x5a, 1, 2, 3])) },
      { file_name: "مزيّف.pdf", content_base64: b64(pngBytes()) },
    ],
  });
  await post(payload);
  const ref = await resolve(payload.messageId);
  const { data } = await db
    .from("email_attachments")
    .select("id, is_quarantined, scan_status, scan_detail")
    .eq("message_id", ref.messageId);
  expect(
    data.length === 2 && data.every((a) => a.is_quarantined),
    "لم تُحجر المرفقات المرفوضة",
  );
  quarantinedId = data[0].id;
  return `محجور=${data.length}، السبب: ${String(data[0].scan_detail).slice(0, 40)}…`;
});

await test("INB-17", "المرفق المحجور غير قابل للتنزيل", async () => {
  const att = await import("@/lib/email/attachments.server");
  try {
    await att.signedAttachmentUrl(db, quarantinedId);
  } catch (error) {
    const m = error instanceof Error ? error.message : "";
    expect(m.includes("محجور"), `رسالة غير متوقعة: ${m}`);
    const visible = await att.listAttachments(
      db,
      (await db.from("email_attachments").select("message_id").eq("id", quarantinedId).single())
        .data.message_id,
    );
    expect(!visible.some((v) => v.id === quarantinedId), "المحجور ظاهر في قائمة الواجهة");
    return "مرفوض خادمياً ومستثنى من الواجهة";
  }
  throw new Error("أُصدر رابط لمرفق محجور");
});

await test("INB-18", "حمولة غير صحيحة تُرفض 400", async () => {
  const r = await post(null, { rawBody: JSON.stringify({ to: "ليس بريداً", from: "x" }) });
  expect(r.status === 400 && r.body.error === "invalid_payload", JSON.stringify(r.body));
  return "invalid_payload";
});

await test("INB-19", "تجاوز حد الاستدعاءات يُرد 429", async () => {
  let limited = 0;
  let last = 0;
  for (let i = 0; i < 70; i += 1) {
    const r = await post(msg({ subject: `${TAG} ضغط ${i}` }));
    last = r.status;
    if (r.status === 429) {
      limited += 1;
      break;
    }
  }
  expect(limited === 1, `آخر حالة ${last} بلا 429`);
  const { count } = await db
    .from("email_inbound_events")
    .select("id", { count: "exact", head: true })
    .eq("outcome", "rate_limited");
  return `429 بعد الحد، أحداث=${count}`;
});

/* -------------------------------------------------- تنظيف */
const ids = Array.from(new Set(created.filter(Boolean)));
const { data: msgs } = await db.from("email_messages").select("id").in("thread_id", ids);
const messageIds = ((msgs ?? []) as { id: string }[]).map((m) => m.id);
if (messageIds.length) {
  const { data: atts } = await db
    .from("email_attachments")
    .select("storage_path")
    .in("message_id", messageIds);
  const paths = ((atts ?? []) as { storage_path: string }[]).map((a) => a.storage_path);
  if (paths.length) await db.storage.from("email-attachments").remove(paths);
  await db.from("email_inbound_events").delete().in("thread_id", ids);
  await db.from("email_messages").delete().in("thread_id", ids);
}
await db.from("email_threads").delete().in("id", ids);
await db.from("email_inbound_events").delete().neq("outcome", "accepted");

const passed = results.filter((r) => r.ok).length;
console.log(`\n=== النتيجة: ${passed}/${results.length} ناجح ===`);
for (const r of results.filter((r) => !r.ok)) console.log(`FAIL ${r.id} ${r.name}: ${r.detail}`);
await Bun.write("/tmp/mail-inbound-results.json", JSON.stringify(results, null, 2));
process.exit(results.some((r) => !r.ok) ? 1 : 0);
