import { runDocumentRepair } from "@/lib/documents/repair.server";
const orgs = ["8ab47a4e-6a9c-4154-8c0d-98b9d3ba0b83","af6eae95-a0b4-4919-aadb-6aaf1cf09062","aaf479a1-53d9-4e36-8d9f-8796fb96393c","951fa4af-9c36-4d8a-bf8b-18abdd391159","55bce812-f0d7-4ea5-9099-a83e5687fb26"];
for (const o of orgs) {
  const r = await runDocumentRepair({ organizationId: o, scope: "broken" });
  console.log(o, JSON.stringify({ scanned: r.scanned, verified: r.verified, relinked: r.relinked, missing: r.missing, invalid: r.invalid, requeued: r.requeued, results: r.results.map(x => [x.fileName, x.outcome, x.viewable, x.downloadable, x.errorCode]) }, null, 1));
}
