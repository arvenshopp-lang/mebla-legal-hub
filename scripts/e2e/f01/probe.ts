import { rest } from "./lib";
const rows = await rest(`office_public_pages?select=organization_id,slug,version,status`);
console.log(rows);
