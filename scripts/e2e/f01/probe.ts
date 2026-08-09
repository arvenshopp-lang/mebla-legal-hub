import { one, rest } from "./lib";
const row = (await rest(`office_public_pages?select=organization_id,slug,version,published,draft&slug=eq.qa-f01-alpha`))[0];
const pub = row?.["published"] as Record<string, unknown> | null;
console.log(row?.["version"], pub?.["logo_path"], pub?.["cover_path"], (pub?.["team"] as any[])?.map(t=>t.photo_path));
const d = row?.["draft"] as Record<string, unknown>;
console.log("draft:", d?.["logo_path"], d?.["cover_path"], (d?.["team"] as any[])?.map(t=>t.photo_path));
