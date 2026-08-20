import { supabaseAdmin } from "../src/integrations/supabase/client.server.ts";

async function inspectMoyasarConfig() {
  const { data, error } = await supabaseAdmin
    .from("platform_payment_provider_configs")
    .select("*")
    .eq("code", "moyasar");

  console.log("Moyasar Config in DB:", JSON.stringify(data, null, 2));
  if (error) console.error("Error:", error);
}

inspectMoyasarConfig();
