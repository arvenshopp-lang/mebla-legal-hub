import { admin } from "./src/lib/admin-guard.server";
import { inboundAliasAddresses, routeInboundAddress } from "./src/lib/email/routing.server";
import { probeConnection } from "./src/lib/email/agentic/mcp-client.server";
import { discoverProviderMailboxes, newCorrelationId, agenticTargets, syncAgenticMailbox } from "./src/lib/email/agentic/provider.server";

const db = await admin();
const aliases = await inboundAliasAddresses(db);
console.log("ALIASES:", [...aliases]);
for (const [label, headers] of [
  ["delivered-to→support", { deliveredTo: ["support@mehlalex.com"], to: ["noreply@mehlalex.com"] }],
  ["to→billing", { to: ["billing@mehlalex.com"] }],
  ["cc→legal", { to: ["x@else.com"], cc: ["legal@mehlalex.com"] }],
  ["unrouted", { to: ["random@else.com"] }],
] as const) {
  console.log("ROUTE", label, JSON.stringify(routeInboundAddress(aliases, headers as never, "noreply@mehlalex.com")));
}
const cid = newCorrelationId("qa");
console.log("PROBE:", JSON.stringify(await probeConnection(cid)).slice(0, 300));
console.log("PROVIDER MAILBOXES:", JSON.stringify(await discoverProviderMailboxes(cid)).slice(0, 400));
console.log("TARGETS:", JSON.stringify(await agenticTargets(db)));
