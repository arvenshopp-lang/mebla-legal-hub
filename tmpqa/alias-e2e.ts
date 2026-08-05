import { admin } from "../src/lib/admin-guard.server";
import { newCorrelationId, agenticTargets, invoke, syncAgenticMailbox } from "../src/lib/email/agentic/provider.server";

const db = await admin();
const real = (await agenticTargets(db)).find((t) => t.linkStatus === "linked")!;
const stamp = Date.now();
const res = await invoke(
  "sendMessage",
  {
    mailboxId: real.providerMailboxId,
    from: real.address,
    to: ["support@mehlalex.com"],
    subject: `اختبار توجيه الأسماء المستعارة ${stamp}`,
    text: `رسالة اختبار حقيقية للتحقق من إنشاء تذكرة دعم. ${stamp}`,
  },
  newCorrelationId("qa-send"),
);
console.log("SEND:", res.text.slice(0, 200));
await new Promise((r) => setTimeout(r, 30000));
const sync = await syncAgenticMailbox(db, real.id, { dryRun: false, correlationId: newCorrelationId("qa-sync") });
console.log("SYNC:", JSON.stringify(sync));
const { data: msgs } = await db.from("email_messages").select("id, mailbox_id, subject, direction").ilike("subject", `%${stamp}%`);
console.log("MESSAGES:", JSON.stringify(msgs));
const { data: tix } = await db.from("support_tickets").select("ticket_number, subject, status").ilike("subject", `%${stamp}%`);
console.log("TICKETS:", JSON.stringify(tix));
