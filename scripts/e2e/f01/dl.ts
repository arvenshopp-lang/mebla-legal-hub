import { SUPABASE_URL, adminFetch } from "../qa-support";
const org = "3f91d7ce-4298-472e-9e60-95ae9834ff5a";
const r = await adminFetch(`${SUPABASE_URL}/storage/v1/object/list/office-public-media`, { method: "POST", body: JSON.stringify({ prefix: `${org}/v1`, limit: 20 }), headers: { "content-type": "application/json" } });
const files = JSON.parse(await r.text()) as any[];
console.log(files.map(f=>f.name));
for (const f of files) {
  const g = await adminFetch(`${SUPABASE_URL}/storage/v1/object/office-public-media/${org}/v1/${f.name}`);
  console.log(f.name, g.status, g.headers.get("content-type"), (await g.arrayBuffer()).byteLength);
}
