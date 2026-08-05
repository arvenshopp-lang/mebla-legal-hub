import { listTools } from "@/lib/email/agentic/mcp-client.server";
import { listRestOperations, restInvoke, restSupportedOperations } from "@/lib/email/agentic/rest-adapter.server";
import { extractList, normalizeMessage } from "@/lib/email/agentic/provider.server";
const cid = "live-send";
const sup = restSupportedOperations(await listRestOperations(cid));
void (await listTools(cid));
const MB = "ACd0c2339e9c0bdcbf036bf061a889";
const stamp = Date.now();
const subject = `MEHLA فحص تكامل ${stamp}`;
const sent = await restInvoke("sendMessage", {
  mailbox: MB,
  to: ["noreply@mehlalex.com"],
  subject,
  text: "اختبار إرسال حقيقي من محرك مِهلة عبر Hostinger Agentic Mail.",
  html: "<p dir=\"rtl\">اختبار إرسال حقيقي من محرك مِهلة.</p>",
  attachments: [{ fileName: "mehla-test.txt", contentBase64: Buffer.from("مِهلة").toString("base64"), contentType: "text/plain" }],
}, cid, sup);
console.log("SEND ok, requestId set:", Boolean(sent.requestId), "payload:", JSON.stringify(sent.json).slice(0, 200));
for (let i = 0; i < 12; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  const listed = await restInvoke("listMessages", { mailbox: MB, folder: "INBOX", limit: 10 }, cid, sup);
  const hit = extractList(listed.json).map(normalizeMessage).find((m) => m.subject === subject);
  if (hit) {
    console.log("INBOUND received uid:", hit.providerId, "att:", hit.attachments.length, "mid:", hit.messageId?.slice(0, 30));
    const atts = await restInvoke("listAttachments", { mailbox: MB, folder: "INBOX", messageId: hit.providerId }, cid, sup);
    console.log("ATTACHMENTS:", JSON.stringify(atts.json).slice(0, 250));
    break;
  }
  console.log("waiting...", i);
}
