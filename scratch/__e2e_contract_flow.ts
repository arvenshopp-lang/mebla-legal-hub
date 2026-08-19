import "dotenv/config";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { issueSignLink, getContractBySignToken, signContractByClient, getContractById, generateContractPdf } from "@/lib/contracts/contracts.server";
import { verifyContractByPublicId } from "@/lib/contracts/contract-lifecycle.server";

const ORG = "81c72d18-cebc-4d20-9ccb-4a891adb4350";
const number = `QA-CT-${Date.now()}`;
const { data: created, error } = await supabaseAdmin.from("contracts").insert({
  organization_id: ORG, contract_number: number, title: "عقد أتعاب — اختبار QA", contract_type: "fee_agreement",
  status: "draft",
  first_party: { role: "first_party", name: "مكتب اختبار مِهلة", identifierType: "cr", identifierNumber: "1010", phone: "0500000000" },
  second_party: { role: "second_party", name: "موكل اختبار QA", identifierType: "national_id", identifierNumber: "1000000000", phone: "0555555555" },
  clauses: [{ id: "1", title: "نطاق الأعمال", content: "بند اختبار." }],
  total_amount: 1000, advance_amount: 250,
}).select("id").single();
if (error) throw error;
const id = created.id;
console.log("contract", id);

const link = await issueSignLink(supabaseAdmin, ORG, id, { userId: null });
console.log("sign link", link.signUrl.slice(0, 20) + "…");
const token = link.signToken;
const publicContract = await getContractBySignToken(token);
console.log("public fetch ok:", !!publicContract, "verificationId:", publicContract?.verificationId);
const signers1 = await supabaseAdmin.from("contract_signers").select("status,viewed_at,version_id").eq("contract_id", id);
console.log("signers after view:", signers1.data);
const versions = await supabaseAdmin.from("contract_versions").select("version_number,content_hash,state").eq("contract_id", id);
console.log("versions:", versions.data);

const res = await signContractByClient(token, "data:image/png;base64,iVBORw0KGgo=", "موكل اختبار QA", "1.2.3.4", "QA-Agent");
console.log("sign result ok:", res.ok, "ticket:", !!res.downloadTicket);
const signers2 = await supabaseAdmin.from("contract_signers").select("status,signed_at,ip_address,signature_hash,sign_token_hash").eq("contract_id", id);
console.log("signers after sign:", signers2.data);

const verified = await verifyContractByPublicId(publicContract!.verificationId!);
console.log("verify:", verified);
console.log("verify normalized input:", (await verifyContractByPublicId(publicContract!.verificationId!.replace(/-/g, "").toLowerCase())).found);
console.log("verify bogus:", (await verifyContractByPublicId("MHL-ZZZZZ-ZZZZZ")).found);

// immutability: attempt to tamper with a signed signer
const up = await supabaseAdmin.from("contract_signers").update({ full_name: "مخترق", status: "pending" }).eq("contract_id", id);
console.log("tamper signer blocked:", up.error?.message ?? "NOT BLOCKED");
const vup = await supabaseAdmin.from("contract_versions").update({ content_hash: "deadbeef" }).eq("contract_id", id);
const vafter = await supabaseAdmin.from("contract_versions").select("content_hash").eq("contract_id", id).single();
console.log("version hash unchanged:", vafter.data?.content_hash === versions.data?.[0]?.content_hash, vup.error?.message ?? "");
const del = await supabaseAdmin.from("contract_versions").delete().eq("contract_id", id);
console.log("version delete blocked:", del.error?.message ?? "NOT BLOCKED");

const full = await getContractById(supabaseAdmin, ORG, id);
const pdf = await generateContractPdf(full!);
await Bun.write("/tmp/ct/qa-signed.pdf", pdf);
console.log("pdf bytes", pdf.byteLength);
