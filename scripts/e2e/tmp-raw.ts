import { APP, loadQaOrg } from "./qa-support";
import { callServerFn, resolveServerFns } from "./serverfn-rpc";
const qa = await loadQaOrg();
const intake = await resolveServerFns(APP, "src/lib/documents/intake.functions.ts");
const r = await callServerFn({ appOrigin: APP, ref: intake["prepareDocumentUpload"]!, token: qa.accounts.find(a=>a.role==="lawyer")!.token, data: { organizationId: qa.organizationId, fileName: "qa-valid.pdf", fileSize: 200 } });
console.log(r.raw);
