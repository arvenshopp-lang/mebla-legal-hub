import "dotenv/config";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { issueSignLink } from "@/lib/contracts/contracts.server";
const ORG = "81c72d18-cebc-4d20-9ccb-4a891adb4350";
const { data, error } = await supabaseAdmin.from("contracts").insert({
  organization_id: ORG, contract_number: `QA-DL-${Date.now()}`, title: "عقد اختبار تنزيل PDF", contract_type: "fee_agreement", status: "draft",
  first_party: { role: "first_party", name: "مكتب اختبار مِهلة", identifierType: "cr", identifierNumber: "1010", phone: "0500000000" },
  second_party: { role: "second_party", name: "موكل اختبار التنزيل", identifierType: "national_id", identifierNumber: "1000000001", phone: "0555555556" },
  clauses: [{ id: "1", title: "نطاق الأعمال", content: "بند اختبار للتنزيل." }],
  total_amount: 5000, advance_amount: 1000,
}).select("id").single();
if (error) throw error;
const link = await issueSignLink(supabaseAdmin, ORG, data.id, { userId: null });
console.log(link.signToken);
