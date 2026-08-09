import { SUPABASE_URL, adminFetch } from "../qa-support";
const p = "3f91d7ce-4298-472e-9e60-95ae9834ff5a/v1";
for (const b of ["office-public-media","office-media-draft"]) {
  const r = await adminFetch(`${SUPABASE_URL}/storage/v1/object/list/${b}`, { method: "POST", body: JSON.stringify({ prefix: "3f91d7ce-4298-472e-9e60-95ae9834ff5a", limit: 20 }), headers: { "content-type": "application/json" } });
  console.log(b, r.status, (await r.text()).slice(0,400));
}
const r2 = await adminFetch(`${SUPABASE_URL}/storage/v1/object/office-public-media/${p}`);
console.log("get dir", r2.status);
