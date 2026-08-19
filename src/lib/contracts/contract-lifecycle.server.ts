/**
 * طبقة دورة حياة العقد الإلكتروني — خادمية فقط.
 *
 * تفصل «النسخة النهائية» (contract_versions) عن «الموقّعين» (contract_signers):
 * - النسخة تُختم ببصمة SHA-256 لمحتواها لحظة الاعتماد ولا تُعدّل بعدها.
 * - كل موقّع يملك رابطاً خاصاً محدود الصلاحية وسجل إثبات مستقل.
 * - رقم التحقق العام (Verification ID) يسمح بالتحقق من رقم العقد وحالته
 *   ومطابقة النسخة دون كشف أي من محتوياته.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { ContractModel } from "./contracts.shared";

/** بصمة SHA-256 نصية */
export async function sha256Hex(text: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * تمثيل قانوني ثابت لمحتوى العقد يُستخدم لحساب البصمة.
 * أي تغيير في البنود أو الأطراف أو المبالغ يُنتج بصمة مختلفة.
 */
export function canonicalContractContent(contract: ContractModel): string {
  return JSON.stringify({
    contractNumber: contract.contractNumber,
    title: contract.title,
    contractType: contract.contractType,
    firstParty: contract.firstParty,
    secondParty: contract.secondParty,
    totalAmount: contract.totalAmount ?? null,
    advanceAmount: contract.advanceAmount ?? null,
    finalAmount: contract.finalAmount ?? null,
    clauses: contract.clauses.map((c) => ({ title: c.title, content: c.content })),
  });
}

/** حروف رقم التحقق: بدون أحرف متشابهة (0/O و1/I) لتفادي الخطأ عند الإدخال اليدوي. */
const VERIFICATION_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomVerificationId(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  const body = Array.from(bytes)
    .map((b) => VERIFICATION_ALPHABET[b % VERIFICATION_ALPHABET.length])
    .join("");
  return `MHL-${body.slice(0, 5)}-${body.slice(5)}`;
}

export const VERIFICATION_ID_PATTERN = /^MHL-[A-Z2-9]{5}-[A-Z2-9]{5}$/;

/** تطبيع ما يكتبه المستخدم في صفحة التحقق (مسافات، أحرف صغيرة، شرطات ناقصة). */
export function normalizeVerificationId(raw: string): string {
  const cleaned = (raw || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/^MHL/, "");
  if (cleaned.length !== 10) return (raw || "").trim().toUpperCase();
  return `MHL-${cleaned.slice(0, 5)}-${cleaned.slice(5)}`;
}

/**
 * ختم النسخة النهائية للعقد قبل إرساله للتوقيع.
 * تُعاد النسخة القائمة كما هي إن لم يتغيّر المحتوى، فلا تتكرر النسخ بلا داعٍ.
 */
export async function sealContractVersion(
  contract: ContractModel,
  actorUserId?: string | null,
): Promise<{ versionId: string; versionNumber: number; contentHash: string; verificationId: string }> {
  const contentHash = await sha256Hex(`mehla-contract-content:v1:${canonicalContractContent(contract)}`);

  const { data: existing } = await supabaseAdmin
    .from("contract_versions")
    .select("id, version_number, content_hash, state")
    .eq("contract_id", contract.id)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: contractRow } = await supabaseAdmin
    .from("contracts")
    .select("verification_id, current_version_id")
    .eq("id", contract.id)
    .maybeSingle();

  let verificationId = contractRow?.verification_id ?? null;
  if (!verificationId) {
    // احتمال التكرار مهمل عملياً، ومع ذلك نعيد المحاولة عند تعارض الفهرس الفريد.
    for (let attempt = 0; attempt < 5 && !verificationId; attempt++) {
      const candidate = randomVerificationId();
      const { error } = await supabaseAdmin
        .from("contracts")
        .update({ verification_id: candidate })
        .eq("id", contract.id);
      if (!error) verificationId = candidate;
    }
    if (!verificationId) throw new Error("تعذّر توليد رقم التحقق للعقد.");
  }

  if (existing && existing.content_hash === contentHash && existing.state === "active") {
    if (contractRow?.current_version_id !== existing.id) {
      await supabaseAdmin
        .from("contracts")
        .update({ current_version_id: existing.id })
        .eq("id", contract.id);
    }
    return {
      versionId: existing.id,
      versionNumber: existing.version_number,
      contentHash,
      verificationId,
    };
  }

  const versionNumber = (existing?.version_number ?? 0) + 1;
  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("contract_versions")
    .insert({
      organization_id: contract.organizationId,
      contract_id: contract.id,
      version_number: versionNumber,
      content_hash: contentHash,
      snapshot: {
        title: contract.title,
        contractType: contract.contractType,
        firstParty: contract.firstParty,
        secondParty: contract.secondParty,
        clauses: contract.clauses,
        totalAmount: contract.totalAmount ?? null,
        advanceAmount: contract.advanceAmount ?? null,
        finalAmount: contract.finalAmount ?? null,
      } as never,
      created_by: actorUserId ?? null,
    })
    .select("id, version_number")
    .single();

  if (insertError || !inserted) throw new Error("تعذّر اعتماد النسخة النهائية للعقد.");

  if (existing && existing.state === "active") {
    await supabaseAdmin
      .from("contract_versions")
      .update({ state: "superseded" })
      .eq("id", existing.id);
  }

  await supabaseAdmin
    .from("contracts")
    .update({ current_version_id: inserted.id })
    .eq("id", contract.id);

  return { versionId: inserted.id, versionNumber: inserted.version_number, contentHash, verificationId };
}

/** تسجيل/تحديث موقّع الطرف الثاني مع رابط توقيعه المحدود الصلاحية. */
export async function upsertSecondPartySigner(input: {
  contract: ContractModel;
  versionId: string;
  signTokenHash: string;
  expiresAt: string;
}): Promise<string> {
  const { contract } = input;
  const { data: existing } = await supabaseAdmin
    .from("contract_signers")
    .select("id, status")
    .eq("contract_id", contract.id)
    .eq("party_role", "second_party")
    .order("sign_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  const payload = {
    organization_id: contract.organizationId,
    contract_id: contract.id,
    version_id: input.versionId,
    party_role: "second_party" as const,
    full_name: contract.secondParty.name,
    capacity: contract.secondParty.representedBy ?? null,
    phone: contract.secondParty.phone ?? null,
    email: contract.secondParty.email ?? null,
    sign_order: 1,
    status: "sent" as const,
    verification_method: "none" as const,
    sign_token_hash: input.signTokenHash,
    token_expires_at: input.expiresAt,
  };

  if (existing && existing.status !== "signed") {
    const { error } = await supabaseAdmin
      .from("contract_signers")
      .update(payload)
      .eq("id", existing.id);
    if (error) throw new Error("تعذّر تجهيز بيانات الموقّع.");
    return existing.id;
  }
  if (existing) return existing.id;

  const { data: inserted, error } = await supabaseAdmin
    .from("contract_signers")
    .insert(payload)
    .select("id")
    .single();
  if (error || !inserted) throw new Error("تعذّر تجهيز بيانات الموقّع.");
  return inserted.id;
}

/** تسجيل اطلاع الموقّع على العقد (يُكتب مرة واحدة فقط). */
export async function markSignerViewed(contractId: string, signTokenHash: string): Promise<void> {
  await supabaseAdmin
    .from("contract_signers")
    .update({ status: "viewed", viewed_at: new Date().toISOString() })
    .eq("contract_id", contractId)
    .eq("sign_token_hash", signTokenHash)
    .in("status", ["pending", "sent"]);
}

/** تسجيل توقيع الموقّع وأدلته — لا تُعدّل بعد ذلك (يحرسها Trigger في قاعدة البيانات). */
export async function recordSignerSignature(input: {
  contractId: string;
  signTokenHash: string;
  fullName: string;
  signatureHash: string;
  signedAt: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  await supabaseAdmin
    .from("contract_signers")
    .update({
      status: "signed",
      full_name: input.fullName,
      signature_hash: input.signatureHash,
      signed_at: input.signedAt,
      consent_at: input.signedAt,
      consumed_at: input.signedAt,
      ip_address: input.ipAddress ?? null,
      user_agent: input.userAgent ? input.userAgent.slice(0, 300) : null,
      sign_token_hash: null,
      token_expires_at: null,
    })
    .eq("contract_id", input.contractId)
    .eq("sign_token_hash", input.signTokenHash)
    .neq("status", "signed");
}

export type ContractVerificationResult =
  | { found: false }
  | {
      found: true;
      verificationId: string;
      contractNumber: string;
      status: string;
      statusLabel: string;
      officeName: string;
      contentHashPrefix: string;
      versionNumber: number | null;
      signedAt: string | null;
      createdAt: string;
      signersCount: number;
      signedCount: number;
      officeEndorsed: boolean;
    };

const PUBLIC_STATUS_LABELS: Record<string, string> = {
  draft: "مسودة لم تُعتمد بعد",
  ready_for_signature: "نسخة نهائية معتمدة بانتظار الإرسال",
  sent: "أُرسل للتوقيع",
  viewed: "تم الاطلاع عليه",
  pending_signature: "بانتظار التوقيع الإلكتروني",
  partially_signed: "موقّع جزئياً",
  signed: "موقّع إلكترونياً عبر منصة مِهلة",
  rejected: "مرفوض من أحد الأطراف",
  cancelled: "ملغى",
  expired: "منتهي الصلاحية",
};

/**
 * تحقق عام: لا يُعاد أي بند أو مبلغ أو بيانات تعريف للأطراف — فقط ما يثبت
 * وجود العقد وحالته ومطابقة نسخته النهائية.
 */
export async function verifyContractByPublicId(rawId: string): Promise<ContractVerificationResult> {
  const verificationId = normalizeVerificationId(rawId);
  if (!VERIFICATION_ID_PATTERN.test(verificationId)) return { found: false };

  const { data, error } = await supabaseAdmin
    .from("contracts")
    .select("id, organization_id, contract_number, status, signed_at, created_at, current_version_id, office_endorsement")
    .eq("verification_id", verificationId)
    .maybeSingle();

  if (error || !data) return { found: false };
  // المسودة لا تُعرض للعامة حتى لا يُستدل على عقود لم تُعتمد نسختها النهائية.
  if (data.status === "draft") return { found: false };

  const [{ data: org }, { data: version }, { count: signersCount }, { count: signedCount }] = await Promise.all([
    supabaseAdmin.from("organizations").select("name, legal_name").eq("id", data.organization_id).maybeSingle(),
    data.current_version_id
      ? supabaseAdmin
          .from("contract_versions")
          .select("version_number, content_hash")
          .eq("id", data.current_version_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabaseAdmin
      .from("contract_signers")
      .select("id", { count: "exact", head: true })
      .eq("contract_id", data.id),
    supabaseAdmin
      .from("contract_signers")
      .select("id", { count: "exact", head: true })
      .eq("contract_id", data.id)
      .eq("status", "signed"),
  ]);

  const endorsement = (data.office_endorsement ?? null) as { endorsedAt?: string } | null;

  return {
    found: true,
    verificationId,
    contractNumber: data.contract_number,
    status: data.status,
    statusLabel: PUBLIC_STATUS_LABELS[data.status] ?? data.status,
    officeName: org?.legal_name || org?.name || "مكتب محاماة مشترك في مِهلة",
    contentHashPrefix: version?.content_hash ? version.content_hash.slice(0, 16) : "—",
    versionNumber: version?.version_number ?? null,
    signedAt: data.signed_at,
    createdAt: data.created_at,
    signersCount: signersCount ?? 0,
    signedCount: signedCount ?? 0,
    officeEndorsed: Boolean(endorsement?.endorsedAt),
  };
}
