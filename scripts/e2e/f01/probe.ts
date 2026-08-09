import { office } from "./lib";
import { setupEnv } from "./setup";
const env = await setupEnv();
for (const [fn, data] of [["getOfficePageState", { organizationId: env.orgA }], ["listOfficeLeads", { organizationId: env.orgA }], ["previewOfficePage", { organizationId: env.orgA }]] as const) {
  const r = await office(fn, env.ownerB.token, data);
  console.log(fn, r.status, r.ok, r.denied, r.message, r.raw.slice(0, 300));
}
