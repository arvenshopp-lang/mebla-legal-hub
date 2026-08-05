import { linkMailboxes, agenticTargets, syncAgenticMailbox, newCorrelationId } from "@/lib/email/agentic/provider.server";
const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
const db = supabaseAdmin as never;
const cid = newCorrelationId("link");
const out = await linkMailboxes(db, cid);
console.log("LINK:", JSON.stringify(out));
const targets = await agenticTargets(db);
console.log("TARGETS:", targets.map((t) => `${t.address}->${t.providerMailboxId}`).join(", "));
if (targets[0]) {
  const dry = await syncAgenticMailbox(db, targets[0].mailboxId, newCorrelationId("dry"), { dryRun: true });
  console.log("DRY SYNC:", JSON.stringify(dry));
}
