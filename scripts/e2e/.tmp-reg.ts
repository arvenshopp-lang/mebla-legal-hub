import { validateCustomCssServer } from "@/lib/design/css-guard.server";
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!);
void sb;
const css = await Bun.file("/tmp/login.css").text();
const r = validateCustomCssServer(css, "login");
console.log("valid:", r.valid, "| blocked:", r.blocked_rules, "| warnings:", r.warnings, "| normalized_len:", r.normalized_css.length);
