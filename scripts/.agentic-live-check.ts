import { listTools } from "@/lib/email/agentic/mcp-client.server";
import { isRestProxy, listRestOperations, restInvoke, restSupportedOperations } from "@/lib/email/agentic/rest-adapter.server";
import { normalizeMessage, extractList, extractCursor } from "@/lib/email/agentic/provider.server";

const cid = "live-check";
const tools = await listTools(cid);
console.log("tools:", tools.length, "restProxy:", isRestProxy(tools));
const ops = await listRestOperations(cid);
const sup = restSupportedOperations(ops);
console.log("operations:", ops.length);
console.log("supported:", [...sup].join(", "));
const mb = await restInvoke("listMailboxes", {}, cid, sup);
const boxes = extractList(mb.json);
console.log("mailboxes:", boxes.map((b) => `${b["address"]}|${b["resourceId"]}`).join(", "));
const id = String(boxes[0]?.["resourceId"] ?? "");
const listed = await restInvoke("listMessages", { mailbox: id, folder: "INBOX", limit: 5 }, cid, sup);
const rows = extractList(listed.json);
console.log("listMessages rows:", rows.length, "cursor:", extractCursor(listed.json));
for (const r of rows) {
  const n = normalizeMessage(r);
  console.log(" msg uid=", n.providerId, "mid=", n.messageId?.slice(0, 40), "from=", n.fromAddress, "unread=", n.unread, "att=", n.attachments.length);
}
if (rows.length > 0) {
  const full = await restInvoke("getMessage", { mailbox: id, folder: "INBOX", messageId: normalizeMessage(rows[0]!).providerId }, cid, sup);
  const detail = normalizeMessage(extractList(full.json)[0] ?? (full.json as Record<string, unknown>));
  console.log("getMessage body chars:", (detail.text ?? "").length, "html:", (detail.html ?? "").length);
}
const cur = extractCursor(listed.json);
const page2 = await restInvoke("listMessages", { mailbox: id, folder: "INBOX", limit: 5, cursor: cur }, cid, sup);
console.log("incremental after cursor", cur, "->", extractList(page2.json).length, "rows (expect 0)");
