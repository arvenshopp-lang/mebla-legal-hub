import { ImapConnection } from "../../src/lib/email/transport/imap.server";
const c = await ImapConnection.open(null);
const st = await c.select("INBOX", true);
const msgs = await c.fetchSince(Math.max(st.uidNext - 25, 0), 25);
for (const m of msgs) {
  const head = new TextDecoder().decode(m.raw).split(/\r?\n\r?\n/)[0] ?? "";
  const g = (n: string) => (new RegExp(`^${n}:\\s*(.*)$`, "im").exec(head)?.[1] ?? "").slice(0, 90);
  console.log(m.uid, "|", m.internalDate, "|", g("Delivered-To") || g("X-Original-To") || g("To"), "|", g("Subject"));
}
await c.close();
