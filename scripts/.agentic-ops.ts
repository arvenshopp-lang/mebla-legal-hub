import { listRestOperations } from "@/lib/email/agentic/rest-adapter.server";
const ops = await listRestOperations("ops");
for (const o of ops) console.log(o.method, o.operationId, o.path);
