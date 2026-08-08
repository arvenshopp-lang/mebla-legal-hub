const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
const e = await import("@/lib/email/workspace.server");
const db = supabaseAdmin as never as any; // eslint-disable-line
const TO = "ziad.emb@gmail.com";
const STAMP = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15);
const ACTOR = { userId: null as unknown as string, email: "noreply@mehlalex.com" };

// رفع أي حجب قائم على عنوان الاختبار قبل البدء
try {
  const s = await import("@/lib/email/suppression.server");
  const fn = (s as Record<string, unknown>)["liftMailRecipientBlock"];
  if (typeof fn === "function") { await (fn as (a: unknown, b: string) => Promise<unknown>)(db, TO); console.log("suppression lifted for", TO); }
} catch (err) { console.log("suppression module:", (err as Error).message.slice(0, 80)); }

const { data: boxes } = await db.from("email_mailboxes").select("id, address, type").order("address");
for (const box of boxes as { id: string; address: string; type: string }[]) {
  const label = (box.address.split("@")[0] ?? "").toUpperCase();
  try {
    const r = await e.queueMessage(db, ACTOR, {
      mailboxId: box.id, to: [TO], cc: [], bcc: [],
      subject: `MEHLA EMAIL E2E — ${label} — ${STAMP}`,
      html: `<p>اختبار نقل حقيقي من هوية <b>${box.address}</b> عبر حساب النقل الرئيسي.</p><p>الطابع: ${STAMP}</p>`,
    });
    const { data: msg } = await db.from("email_messages")
      .select("id, message_id, from_address, reply_to, status, provider, provider_ref, failure_ref, metadata")
      .eq("id", r.messageId).single();
    const { data: job } = await db.from("email_outbox").select("status, attempts, last_error_code").eq("message_id", r.messageId).maybeSingle();
    console.log(JSON.stringify({ identity: box.address, sent: r.sent, status: msg.status, provider: msg.provider,
      from: msg.from_address, reply_to: msg.reply_to, message_id: msg.message_id,
      provider_ref: msg.provider_ref, failure_ref: msg.failure_ref, metadata: msg.metadata,
      outbox: job }, null, 0));
  } catch (err) { console.log(JSON.stringify({ identity: box.address, error: (err as Error).message.slice(0, 200) })); }
}
