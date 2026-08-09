import { office, rest } from "./lib";
import { setupEnv } from "./setup";
const env = await setupEnv();
console.log("orgA", env.orgA, "orgB", env.orgB);
console.log(await rest(`organization_members?select=organization_id,user_id,role,status&user_id=eq.${env.ownerB.id}`));
const r = await office("getOfficePageState", env.ownerB.token, { organizationId: env.orgA });
console.log(r.status, r.ok, r.denied, r.message, r.raw.slice(0,200));
