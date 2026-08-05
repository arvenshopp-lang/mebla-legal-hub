import { listRestOperations, restInvoke, restSupportedOperations } from "@/lib/email/agentic/rest-adapter.server";
const cid = "live-att";
const sup = restSupportedOperations(await listRestOperations(cid));
const MB = "ACd0c2339e9c0bdcbf036bf061a889";
const a = await restInvoke("listAttachments", { mailbox: MB, folder: "INBOX", messageId: "2" }, cid, sup);
const list = (a.json as { attachments?: unknown[] })?.attachments ?? (a.json as Record<string, unknown>)?.["data"];
console.log("ATT LIST:", JSON.stringify(list));
const first = Array.isArray(list) ? (list[0] as Record<string, unknown>) : null;
if (first) {
  const id = String(first["attachmentId"] ?? first["id"] ?? first["partId"] ?? "");
  const d = await restInvoke("downloadAttachment", { mailbox: MB, folder: "INBOX", messageId: "2", attachmentId: id }, cid, sup);
  const s = JSON.stringify(d.json) ?? "";
  console.log("DOWNLOAD id:", id, "chars:", s.length, "sample:", s.slice(0, 160));
}
const mr = await restInvoke("markRead", { mailbox: MB, folder: "INBOX", messageId: "2" }, cid, sup);
console.log("MARK READ:", JSON.stringify(mr.json).slice(0, 120));
const q = await restInvoke("searchMessages", { mailbox: MB, folder: "INBOX", query: "MEHLA", limit: 5 }, cid, sup);
console.log("SEARCH rows:", Array.isArray((q.json as {messages?:unknown[]})?.messages) ? (q.json as {messages:unknown[]}).messages.length : JSON.stringify(q.json).slice(0,120));
