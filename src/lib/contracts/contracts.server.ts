/**
 * محرك إدارة وتوليد وتوقيع العقود الرقمية — خادمي فقط.
 */
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { watermarkFontBytes } from "@/lib/secure-view/watermark-font";
import { renderBillingPdf, type PdfDocumentModel, type PdfBrand } from "@/lib/billing/pdf/engine.server";
import { buildQrMatrix, buildVerificationUrl } from "@/lib/pdf/verification-qr.server";
import { fmtDate } from "@/lib/enums";
import {
  sealContractVersion,
  upsertSecondPartySigner,
  markSignerViewed,
  recordSignerSignature,
} from "./contract-lifecycle.server";
import type {
  ContractModel,
  ContractType,
  ContractStatus,
  ContractClause,
  ContractParty,
  ContractSignature,
} from "./contracts.shared";

/** عميل Supabase مُصادَق (يُمرَّر من دوال الخادم ويطبّق RLS بهوية المستخدم) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AuthedClient = any;

/** الأدوار المسموح لها بإنشاء وتعديل العقود */
const CONTRACT_WRITE_ROLES = ["owner", "admin", "lawyer", "legal_assistant"] as const;

/** تجزئة آمنة (SHA-256) للنصوص والرموز */
async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** بصمة رمز التوقيع — تُخزَّن في قاعدة البيانات بدل الرمز الصريح */
function signTokenHash(token: string): Promise<string> {
  return sha256Hex(`mehla-contract-sign-token:v1:${token}`);
}

/** توليد رمز توقيع عشوائي قوي (256 بت) */
function generateSignToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/* ------------------------------------------------------------------ *
 * تذكرة تحميل النسخة الموقعة للطرف الخارجي
 *
 * الطرف الثاني الخارجي لا يملك جلسة داخل المنصة، لذلك لا يجوز أن يستدعي
 * دالة المكتب المحمية لتحميل الـ PDF (كانت هذه سبب رسالة «تعذّر التنزيل»).
 * بدلاً من ذلك تُصدر له بعد التوقيع تذكرة موقّعة (HMAC) قصيرة الصلاحية
 * تحمل معرّف العقد فقط، ولا تُخزَّن ولا تكشف أي بيانات.
 * ------------------------------------------------------------------ */

const DOWNLOAD_TICKET_TTL_MS = 60 * 60 * 1000; // ساعة واحدة

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function ticketKey(): Promise<CryptoKey> {
  const secret = process.env["SUPABASE_SERVICE_ROLE_KEY"] || process.env["SUPABASE_URL"] || "";
  if (!secret) throw new ContractAccessError("تعذّر تجهيز رابط التحميل الآمن.");
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`mehla-contract-download:v1:${secret}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function ticketSignature(payload: string): Promise<string> {
  const key = await ticketKey();
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return base64Url(new Uint8Array(sig));
}

/** إصدار تذكرة تحميل قصيرة الصلاحية لعقد موقّع (للطرف الخارجي). */
export async function issueContractDownloadTicket(contract: {
  id: string;
  organizationId: string;
}): Promise<string> {
  const payload = `${contract.id}.${contract.organizationId}.${Date.now() + DOWNLOAD_TICKET_TTL_MS}`;
  return `${payload}.${await ticketSignature(payload)}`;
}

/** التحقق من تذكرة التحميل وإرجاع معرّفات العقد — بدون أي وصول لقاعدة البيانات. */
export async function resolveContractDownloadTicket(
  ticket: string,
): Promise<{ contractId: string; organizationId: string }> {
  const parts = (ticket || "").split(".");
  if (parts.length !== 4) throw new ContractAccessError("رابط التحميل غير صالح.");
  const [contractId, organizationId, expiresAt, signature] = parts as [string, string, string, string];
  const payload = `${contractId}.${organizationId}.${expiresAt}`;
  const expected = await ticketSignature(payload);
  if (signature.length !== expected.length) throw new ContractAccessError("رابط التحميل غير صالح.");
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) mismatch |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  if (mismatch !== 0) throw new ContractAccessError("رابط التحميل غير صالح.");
  if (!Number(expiresAt) || Number(expiresAt) < Date.now()) {
    throw new ContractAccessError("انتهت صلاحية رابط التحميل، يرجى طلب رابط جديد من المكتب.");
  }
  return { contractId, organizationId };
}

/**
 * جلب العقد بمعرّفه بعد التحقق من تذكرة التحميل — يُستخدم للمسار العام فقط،
 * ويُشترط تطابق المكتب المحقون في التذكرة مع مكتب العقد (عزل تام).
 */
export async function getContractForTicket(
  contractId: string,
  organizationId: string,
): Promise<ContractModel | null> {
  const { data, error } = await supabaseAdmin
    .from("contracts")
    .select(CONTRACT_COLUMNS)
    .eq("id", contractId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !data) return null;
  return mapRow(data as unknown as ContractRow);
}

export class ContractAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContractAccessError";
  }
}

/**
 * التحقق من عضوية المستخدم النشطة في المكتب المطلوب.
 * عند عدم تمرير معرّف مكتب يُستخدم أول مكتب نشط للمستخدم.
 */
export async function resolveContractOrg(
  client: AuthedClient,
  requestedOrganizationId?: string | null,
  requireWrite = false,
): Promise<{ organizationId: string; role: string }> {
  const { data, error } = await client
    .from("organization_members")
    .select("organization_id, role")
    .eq("status", "active");

  if (error) throw new ContractAccessError("تعذّر التحقق من عضويتك في المكتب.");

  const rows = (data ?? []) as Array<{ organization_id: string; role: string }>;
  if (rows.length === 0) throw new ContractAccessError("لا توجد لديك عضوية نشطة في أي مكتب.");

  const membership = requestedOrganizationId
    ? rows.find((r) => r.organization_id === requestedOrganizationId)
    : rows[0];

  if (!membership) throw new ContractAccessError("لا تملك صلاحية الوصول إلى عقود هذا المكتب.");

  if (requireWrite && !CONTRACT_WRITE_ROLES.includes(membership.role as (typeof CONTRACT_WRITE_ROLES)[number])) {
    throw new ContractAccessError("دورك الحالي لا يسمح بإنشاء أو تعديل العقود.");
  }

  return { organizationId: membership.organization_id, role: membership.role };
}

type ContractRow = {
  id: string;
  organization_id: string;
  client_id: string | null;
  case_id: string | null;
  contract_number: string;
  title: string;
  contract_type: string;
  status: string;
  first_party: unknown;
  second_party: unknown;
  clauses: unknown;
  total_amount: number | string | null;
  advance_amount: number | string | null;
  final_amount: number | string | null;
  lawyer_signature: unknown;
  client_signature: unknown;
  expires_at: string | null;
  signed_at: string | null;
  created_at: string;
  updated_at: string;
};

type ContractRowExtras = { verification_id?: string | null };

const FALLBACK_SECOND_PARTY: ContractParty = {
  role: "second_party",
  name: "اسم الموكل / المنشأة",
  identifierType: "national_id",
  identifierNumber: "—",
  phone: "—",
};

function num(value: number | string | null): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** تحويل صف قاعدة البيانات إلى نموذج العقد المستخدم في الواجهة */
function mapRow(row: ContractRow): ContractModel {
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    caseId: row.case_id,
    contractNumber: row.contract_number,
    title: row.title,
    contractType: row.contract_type as ContractType,
    status: row.status as ContractStatus,
    firstParty: (row.first_party as ContractParty) ?? { ...FALLBACK_SECOND_PARTY, role: "first_party" },
    secondParty: (row.second_party as ContractParty) ?? FALLBACK_SECOND_PARTY,
    totalAmount: num(row.total_amount),
    advanceAmount: num(row.advance_amount),
    finalAmount: num(row.final_amount),
    clauses: Array.isArray(row.clauses) ? (row.clauses as ContractClause[]) : [],
    lawyerSignature: (row.lawyer_signature as ContractSignature | null) ?? null,
    clientSignature: (row.client_signature as ContractSignature | null) ?? null,
    signToken: null,
    signUrl: null,
    verificationId: (row as ContractRow & ContractRowExtras).verification_id ?? null,
    expiresAt: row.expires_at,
    signedAt: row.signed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const CONTRACT_COLUMNS =
  "id, organization_id, client_id, case_id, contract_number, title, contract_type, status, first_party, second_party, clauses, total_amount, advance_amount, final_amount, lawyer_signature, client_signature, verification_id, expires_at, signed_at, created_at, updated_at";

/** كتابة حدث في سجل تدقيق العقود (غير قابل للتعديل أو الحذف) */
export async function logContractEvent(entry: {
  organizationId: string;
  contractId: string;
  eventType:
    | "created"
    | "updated"
    | "sent_for_signature"
    | "viewed_by_client"
    | "signed_by_client"
    | "signed_by_lawyer"
    | "cancelled"
    | "exported_pdf"
    | "converted_to_case";
  actorUserId?: string | null;
  actorLabel?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  traceRef?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await supabaseAdmin.from("contract_events").insert({
      organization_id: entry.organizationId,
      contract_id: entry.contractId,
      event_type: entry.eventType,
      actor_user_id: entry.actorUserId ?? null,
      actor_label: entry.actorLabel ?? null,
      ip_address: entry.ipAddress ?? null,
      user_agent: entry.userAgent ? entry.userAgent.slice(0, 300) : null,
      trace_ref: entry.traceRef ?? null,
      metadata: (entry.metadata ?? {}) as never,
    });
  } catch {
    // سجل التدقيق لا يجب أن يُفشل العملية الأساسية
  }
}

/** جلب بيانات المكتب لإدراجها كطرف أول في العقد */
export async function getOfficePartyInfo(organizationId: string): Promise<ContractParty> {
  try {
    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("name, legal_name, commercial_registration, tax_number, phone, email, city, address")
      .eq("id", organizationId)
      .single();

    if (org) {
      return {
        role: "first_party",
        name: org.legal_name || org.name || "المكتب القانوني",
        identifierType: "cr",
        identifierNumber: org.commercial_registration || "—",
        phone: org.phone || "—",
        email: org.email || undefined,
        city: org.city || "الرياض",
        address: org.address || undefined,
        representedBy: "المحامي المعتمد",
      };
    }
  } catch {
    // تجاهل أخطاء الاتصال واستخدام القيم الافتراضية
  }

  return {
    role: "first_party",
    name: "مكتب مِهلة للمحاماة والاستشارات القانونية",
    identifierType: "cr",
    identifierNumber: "1010789456",
    phone: "0550000000",
    city: "الرياض",
    representedBy: "المحامي المعتمد",
  };
}

/** جلب بيانات العميل لإدراجها كطرف ثاني في العقد */
export async function getClientPartyInfo(clientId: string): Promise<ContractParty | null> {
  try {
    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("id, full_name, company_name, national_id, commercial_registration, phone, email, city, address")
      .eq("id", clientId)
      .single();

    if (client) {
      const isCompany = Boolean(client.company_name);
      return {
        role: "second_party",
        name: client.company_name || client.full_name,
        identifierType: isCompany ? "cr" : "national_id",
        identifierNumber: client.commercial_registration || client.national_id || "—",
        phone: client.phone || "—",
        email: client.email || undefined,
        city: client.city || "—",
        address: client.address || undefined,
        representedBy: isCompany ? client.full_name : undefined,
      };
    }
  } catch {
    // تجاهل أخطاء الاتصال
  }
  return null;
}

/** إنشاء أو تحديث عقد في قاعدة البيانات (بهوية المستخدم — RLS مطبّق) */
export async function saveContract(
  client: AuthedClient,
  organizationId: string,
  contractData: Partial<ContractModel> & { title: string; contractType: ContractType },
  actor?: { userId?: string | null; label?: string | null },
): Promise<ContractModel> {
  const existing = contractData.id ? await getContractById(client, organizationId, contractData.id) : null;
  if (contractData.id && !existing) throw new ContractAccessError("العقد غير موجود أو لا تملك صلاحية الوصول إليه.");
  if (existing && (existing.status === "signed" || existing.status === "cancelled")) {
    throw new ContractAccessError("لا يمكن تعديل عقد موقّع أو ملغى.");
  }

  const firstParty =
    contractData.firstParty || existing?.firstParty || (await getOfficePartyInfo(organizationId));
  const secondParty = contractData.secondParty || existing?.secondParty || FALLBACK_SECOND_PARTY;
  const status = contractData.status ?? existing?.status ?? "draft";

  const payload = {
    organization_id: organizationId,
    client_id: contractData.clientId ?? existing?.clientId ?? null,
    case_id: contractData.caseId ?? existing?.caseId ?? null,
    title: contractData.title,
    contract_type: contractData.contractType,
    status,
    first_party: firstParty as never,
    second_party: secondParty as never,
    clauses: (contractData.clauses ?? existing?.clauses ?? []) as never,
    total_amount: contractData.totalAmount ?? existing?.totalAmount ?? null,
    advance_amount: contractData.advanceAmount ?? existing?.advanceAmount ?? null,
    final_amount: contractData.finalAmount ?? existing?.finalAmount ?? null,
    lawyer_signature: (contractData.lawyerSignature ?? existing?.lawyerSignature ?? null) as never,
    expires_at:
      contractData.expiresAt ?? existing?.expiresAt ?? new Date(Date.now() + 14 * 86400000).toISOString(),
  };

  let row: ContractRow | null = null;

  if (existing) {
    const { data, error } = await client
      .from("contracts")
      .update(payload)
      .eq("id", existing.id)
      .eq("organization_id", organizationId)
      .select(CONTRACT_COLUMNS)
      .single();
    if (error || !data) throw new ContractAccessError("تعذّر حفظ تعديلات العقد.");
    row = data as ContractRow;
  } else {
    const { data: numberData, error: numberError } = await supabaseAdmin.rpc("next_contract_number", {
      _organization_id: organizationId,
    });
    if (numberError || !numberData) throw new ContractAccessError("تعذّر توليد رقم العقد.");

    const { data, error } = await client
      .from("contracts")
      .insert({ ...payload, contract_number: numberData as string, created_by: actor?.userId ?? null })
      .select(CONTRACT_COLUMNS)
      .single();
    if (error || !data) throw new ContractAccessError("تعذّر إنشاء العقد.");
    row = data as ContractRow;
  }

  const contract = mapRow(row);

  await logContractEvent({
    organizationId,
    contractId: contract.id,
    eventType: existing ? "updated" : "created",
    actorUserId: actor?.userId ?? null,
    actorLabel: actor?.label ?? null,
    metadata: { status: contract.status, contractNumber: contract.contractNumber },
  });

  // إذا تم توقيع العقد ننشئ له سجلاً في تحديثات القضية
  if (contract.status === "signed" && contract.caseId) {
    try {
      await supabaseAdmin.from("case_updates").insert({
        organization_id: organizationId,
        case_id: contract.caseId,
        update_type: "note",
        title: `تم اعتماد وتوقيع العقد: ${contract.title}`,
        description: `تم توقيع العقد رقم (${contract.contractNumber}) إلكترونياً بنجاح.`,
        event_date: new Date().toISOString(),
        is_client_visible: true,
      });
    } catch {
      // تجاهل أخطاء التحديث
    }
  }

  return contract;
}

/** جلب قائمة عقود المكتب */
export async function getContractsByOrg(
  client: AuthedClient,
  organizationId: string,
): Promise<ContractModel[]> {
  const { data, error } = await client
    .from("contracts")
    .select(CONTRACT_COLUMNS)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error) throw new ContractAccessError("تعذّر جلب قائمة العقود.");
  return ((data ?? []) as ContractRow[]).map(mapRow);
}

/** جلب تفاصيل عقد بواسطة المعرّف داخل نفس المكتب */
export async function getContractById(
  client: AuthedClient,
  organizationId: string,
  contractId: string,
): Promise<ContractModel | null> {
  const { data, error } = await client
    .from("contracts")
    .select(CONTRACT_COLUMNS)
    .eq("id", contractId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw new ContractAccessError("تعذّر جلب بيانات العقد.");
  return data ? mapRow(data as ContractRow) : null;
}

/**
 * إصدار رابط توقيع جديد للموكل — يُبطل أي رابط سابق،
 * ويُخزَّن في قاعدة البيانات كبصمة SHA-256 فقط.
 */
export async function issueSignLink(
  client: AuthedClient,
  organizationId: string,
  contractId: string,
  actor?: { userId?: string | null; label?: string | null },
): Promise<{ signToken: string; signUrl: string; expiresAt: string }> {
  const contract = await getContractById(client, organizationId, contractId);
  if (!contract) throw new ContractAccessError("العقد غير موجود أو لا تملك صلاحية الوصول إليه.");
  if (contract.status === "signed") throw new ContractAccessError("تم توقيع هذا العقد مسبقاً.");
  if (contract.status === "cancelled") throw new ContractAccessError("العقد ملغى ولا يمكن إصدار رابط توقيع له.");

  const token = generateSignToken();
  const expiresAt = new Date(Date.now() + 14 * 86400000).toISOString();
  const tokenHash = await signTokenHash(token);

  // اعتماد النسخة النهائية قبل الإرسال: بصمة المحتوى ورقم التحقق العام.
  const sealed = await sealContractVersion(contract, actor?.userId ?? null);

  const { error } = await client
    .from("contracts")
    .update({
      sign_token_hash: tokenHash,
      expires_at: expiresAt,
      status: contract.status === "draft" ? "pending_signature" : contract.status,
    })
    .eq("id", contractId)
    .eq("organization_id", organizationId);

  if (error) throw new ContractAccessError("تعذّر إصدار رابط التوقيع.");

  await upsertSecondPartySigner({
    contract,
    versionId: sealed.versionId,
    signTokenHash: tokenHash,
    expiresAt,
  });

  await logContractEvent({
    organizationId,
    contractId,
    eventType: "sent_for_signature",
    actorUserId: actor?.userId ?? null,
    actorLabel: actor?.label ?? null,
    metadata: {
      expiresAt,
      versionNumber: sealed.versionNumber,
      contentHash: sealed.contentHash,
      verificationId: sealed.verificationId,
    },
  });

  return { signToken: token, signUrl: `/sign/${token}`, expiresAt };
}

/** جلب العقد بواسطة رمز التوقيع العام (مسار عام — بصمة الرمز فقط) */
/**
 * مدة إتاحة الرابط بعد اكتمال التوقيع: الطرف الثاني يحتاج الرجوع للرابط نفسه
 * لتحميل النسخة النهائية بعد إعادة تحميل الصفحة أو لاحقاً من رسالته، لذلك
 * يبقى الرمز صالحاً للقراءة والتحميل فقط (لا يسمح بتوقيع ثانٍ) خلال هذه المدة.
 */
const SIGNED_LINK_RETENTION_MS = 30 * 86400000; // 30 يوماً

export async function getContractBySignToken(signToken: string): Promise<ContractModel | null> {
  const token = (signToken || "").trim();
  if (!/^[a-f0-9]{64}$/i.test(token)) return null;

  const { data, error } = await supabaseAdmin
    .from("contracts")
    .select(CONTRACT_COLUMNS)
    .eq("sign_token_hash", await signTokenHash(token))
    .maybeSingle();

  if (error || !data) return null;

  const contract = mapRow(data as unknown as ContractRow);
  if (contract.status === "cancelled") return null;
  if (contract.status !== "signed" && contract.expiresAt && new Date(contract.expiresAt).getTime() < Date.now()) {
    return null;
  }
  // بعد انتهاء نافذة الإتاحة يتوقف الرابط عن العمل نهائياً.
  if (contract.status === "signed" && contract.signedAt) {
    if (new Date(contract.signedAt).getTime() + SIGNED_LINK_RETENTION_MS < Date.now()) return null;
  }
  // تسجيل اطلاع الموقّع كدليل في سجل الموقّعين (مرة واحدة فقط).
  if (contract.status !== "signed") {
    try {
      await markSignerViewed(contract.id, await signTokenHash(token));
    } catch {
      // الاطلاع دليل مساند ولا يجوز أن يمنع فتح العقد
    }
  }
  return contract;
}

/** تسجيل توقيع الموكل الإلكتروني عبر الرابط العام */
export async function signContractByClient(
  signToken: string,
  signatureImageBase64: string,
  signerName: string,
  ipAddress?: string,
  userAgent?: string,
): Promise<{ ok: boolean; error?: string; downloadTicket?: string }> {
  const contract = await getContractBySignToken(signToken);
  if (!contract) return { ok: false, error: "الرابط غير صالح أو منتهي الصلاحية." };
  if (contract.status === "signed") {
    return { ok: true, downloadTicket: await issueContractDownloadTicket(contract) };
  }
  if (!signatureImageBase64.startsWith("data:image/")) {
    return { ok: false, error: "صورة التوقيع غير صالحة." };
  }

  const signedAt = new Date().toISOString();
  const clientSignature: ContractSignature = {
    signedBy: (signerName || contract.secondParty.name).slice(0, 120),
    signedAt,
    signatureImageBase64,
    ipAddress,
    verificationHash: await sha256Hex(
      `${contract.id}:${contract.contractNumber}:${signerName}:${signedAt}:${signatureImageBase64.length}`,
    ),
  };

  const { error } = await supabaseAdmin
    .from("contracts")
    .update({
      client_signature: clientSignature as never,
      status: "signed",
      signed_at: signedAt,
    })
    .eq("id", contract.id)
    .neq("status", "signed");

  if (error) return { ok: false, error: "تعذّر تسجيل التوقيع، يرجى المحاولة مرة أخرى." };

  try {
    await recordSignerSignature({
      contractId: contract.id,
      signTokenHash: await signTokenHash((signToken || "").trim()),
      fullName: clientSignature.signedBy,
      signatureHash: clientSignature.verificationHash ?? "",
      signedAt,
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
    });
  } catch {
    // التوقيع مسجَّل في العقد وسجل التدقيق؛ تعذّر تحديث سجل الموقّعين لا يُبطله
  }

  const downloadTicket = await issueContractDownloadTicket(contract);

  await logContractEvent({
    organizationId: contract.organizationId,
    contractId: contract.id,
    eventType: "signed_by_client",
    actorLabel: clientSignature.signedBy,
    ipAddress: ipAddress ?? null,
    userAgent: userAgent ?? null,
    metadata: { verificationHash: clientSignature.verificationHash },
  });

  if (contract.caseId) {
    try {
      await supabaseAdmin.from("case_updates").insert({
        organization_id: contract.organizationId,
        case_id: contract.caseId,
        update_type: "note",
        title: `تم اعتماد وتوقيع العقد: ${contract.title}`,
        description: `تم توقيع العقد رقم (${contract.contractNumber}) إلكترونياً بنجاح.`,
        event_date: signedAt,
        is_client_visible: true,
      });
    } catch {
      // تجاهل أخطاء التحديث
    }
  }

  return { ok: true, downloadTicket };
}

/** توليد ملف الـ PDF الرسمي للعقد بهوية المكتب والتواقيع والأختام */
export async function generateContractPdf(contract: ContractModel): Promise<Uint8Array> {
  let org: {
    name?: string;
    legal_name?: string | null;
    commercial_registration?: string | null;
    tax_number?: string | null;
    phone?: string | null;
    email?: string | null;
    city?: string | null;
    address?: string | null;
  } | null = null;

  try {
    const { data } = await supabaseAdmin
      .from("organizations")
      .select("name, legal_name, commercial_registration, tax_number, phone, email, city, address")
      .eq("id", contract.organizationId)
      .single();
    org = data;
  } catch {
    // تجاهل أخطاء الاتصال
  }

  const brand: PdfBrand = {
    sellerName: org?.legal_name || org?.name || contract.firstParty.name || "المكتب القانوني",
    sellerAddress:
      [org?.address || contract.firstParty.address, org?.city || contract.firstParty.city].filter(Boolean).join(" — ") ||
      "المملكة العربية السعودية",
    commercialRegistration: org?.commercial_registration || contract.firstParty.identifierNumber || undefined,
    taxNumber: org?.tax_number || undefined,
    contactPhone: org?.phone || contract.firstParty.phone || undefined,
    contactEmail: org?.email || contract.firstParty.email || undefined,
    signatoryName: contract.lawyerSignature?.signedBy || "المحامي المعتمد",
    signatoryTitle: "الطرف الأول / المحامي",
    // التذييل يُطبع في سطر واحد ضيق، لذا يبقى مختصراً والنص الكامل في متن المستند.
    documentFooterNote: "مستند موقّع إلكترونياً عبر منصة مِهلة — ليس توثيقاً رسمياً حكومياً.",
  };

  const docModel: PdfDocumentModel = {
    kind: "quote",
    title: contract.title,
    reference: contract.contractNumber,
    fileName: `عقد_${contract.contractNumber}.pdf`,
    subtitle: `عقد واتفاقية قانونية`,
    statusLine:
      contract.status === "signed" ? "موقّع إلكترونياً عبر منصة مِهلة" : "بانتظار توقيع الطرف الثاني",
    notice: "حرر هذا العقد ووُقّع إلكترونياً عبر منصة مِهلة بين أطرافه المذكورين أدناه.",
    meta: [
      { label: "رقم العقد", value: contract.contractNumber },
      { label: "تاريخ الإنشاء", value: fmtDate(contract.createdAt) },
      { label: "حالة العقد", value: contract.status === "signed" ? "موقّع إلكترونياً" : "قيد الإجراء" },
      { label: "تاريخ التوقيع", value: contract.signedAt ? fmtDate(contract.signedAt) : "—" },
    ],
    recipient: {
      title: "الطرف الثاني (الموكل / المنشأة):",
      lines: [
        contract.secondParty.name,
        `السجل / الهوية: ${contract.secondParty.identifierNumber}`,
        `الجوال: ${contract.secondParty.phone}`,
        `المدينة: ${contract.secondParty.city || "المملكة العربية السعودية"}`,
      ],
    },
    tables: [
      {
        title: "بنود وشروط الاتفاقية والالتزامات المتبادلة:",
        columns: [
          { label: "البند والشروط النظامية", width: 0.82, align: "right" },
          { label: "الحالة", width: 0.18, align: "left" },
        ],
        rows: contract.clauses.map((cl) => [
          `${cl.title}: ${cl.content}`,
          "موافق عليه",
        ]),
        emptyLabel: "لا توجد بنود مضافة لهذا العقد.",
      },
    ],
    totals: contract.totalAmount
      ? [
          {
            label: "إجمالي قيمة العقد والأتعاب",
            // «SAR» يُستبدل داخل محرك الطباعة برمز الريال الرسمي المتجهي.
            value: `${contract.totalAmount.toLocaleString("en-US")} SAR`,
            emphasis: true,
          },
          {
            label: "الدفعة المقدمة غير المستردة",
            value: `${(contract.advanceAmount || 0).toLocaleString("en-US")} SAR`,
          },
        ]
      : [],
    blocks: [
      {
        title: "إقرار التوقيع الإلكتروني:",
        lines: [
          `الطرف الأول: ${contract.firstParty.name} (${contract.lawyerSignature?.signedBy || "المحامي المسؤول"}) — ${
            contract.lawyerSignature ? "تم التوقيع إلكترونياً" : "بانتظار التوقيع"
          }`,
          `الطرف الثاني: ${contract.secondParty.name} (${contract.clientSignature?.signedBy || "بانتظار التوقيع"}) ${
            contract.clientSignature ? `— تم التوقيع إلكترونياً بتاريخ ${fmtDate(contract.clientSignature.signedAt)}` : ""
          }`,
          `الرقم المرجعي للتحقق: ${contract.contractNumber}`,
          contract.verificationId
            ? `رقم التحقق العام: ${contract.verificationId} — التحقق عبر: https://mehlalex.com/verify?id=${contract.verificationId}`
            : "رقم التحقق العام يُصدر عند اعتماد النسخة النهائية وإرسال العقد للتوقيع.",
          contract.clientSignature?.verificationHash
            ? `بصمة المستند SHA-256: ${contract.clientSignature.verificationHash.slice(0, 32)}`
            : "بصمة المستند تُصدر عند اكتمال التوقيع.",
          "تم إنشاء وتوقيع هذا المستند إلكترونياً عبر منصة مِهلة، ولا يمثل توثيقاً رسمياً لدى وزارة العدل أو أي جهة حكومية ما لم يرد ما يثبت خلاف ذلك.",
        ],
      },
    ],
    signatureSlots: [
      { label: "توقيع الطرف الأول (المكتب)", caption: contract.lawyerSignature?.signedBy || "المحامي المعتمد" },
      { label: "توقيع الطرف الثاني (الموكل)", caption: contract.clientSignature?.signedBy || contract.secondParty.name },
    ],
    // رمز التحقق يُطبع فقط بعد اعتماد النسخة النهائية (عند صدور رقم التحقق).
    verificationQr: buildContractVerificationQr(contract.verificationId ?? null),
  };

  return await renderBillingPdf(docModel, brand);
}

/** بطاقة QR للتحقق العام من العقد — تُهمل بصمت إذا لم يصدر رقم تحقق بعد. */
function buildContractVerificationQr(
  verificationId: string | null,
): PdfDocumentModel["verificationQr"] {
  if (!verificationId) return null;
  const url = buildVerificationUrl(verificationId);
  const matrix = buildQrMatrix(url);
  if (!matrix) return null;
  return {
    size: matrix.size,
    modules: matrix.modules,
    verificationId,
    url,
    caption: "امسح الرمز للتحقق من رقم العقد وحالته ومطابقته للنسخة النهائية عبر منصة مِهلة.",
  };
}

/** تحويل العقد إلى قضية جديدة */
export async function createCaseFromContract(
  client: AuthedClient,
  organizationId: string,
  contractId: string,
  lawyerId?: string,
) {
  const contract = await getContractById(client, organizationId, contractId);
  if (!contract) throw new ContractAccessError("العقد غير موجود أو لا تملك صلاحية الوصول إليه.");
  if (contract.caseId) return { caseId: contract.caseId };

  let clientId = contract.clientId;

  // إذا لم يكن هناك عميل مرتبط، ننشئ سجلاً في جدول العملاء
  if (!clientId) {
    const { data: newClient, error: cErr } = await client
      .from("clients")
      .insert({
        organization_id: organizationId,
        full_name: contract.secondParty.name,
        company_name: contract.secondParty.identifierType === "cr" ? contract.secondParty.name : null,
        phone: contract.secondParty.phone,
        email: contract.secondParty.email || null,
        city: contract.secondParty.city || "الرياض",
        client_type: contract.secondParty.identifierType === "cr" ? "company" : "individual",
      })
      .select("id")
      .single();

    if (cErr || !newClient) throw new ContractAccessError("تعذّر إنشاء سجل الموكل من بيانات العقد.");
    clientId = newClient.id as string;
  }

  const { data: newCase, error } = await client
    .from("cases")
    .insert({
      organization_id: organizationId,
      client_id: clientId,
      case_title: contract.title,
      case_type: contract.contractType === "fee_agreement" ? "commercial" : "general",
      court_name: "المحكمة العامة / التجارية",
      status: "open",
      description: contract.totalAmount
        ? `قضية تم إنشاؤها تلقائياً من العقد رقم: ${contract.contractNumber} — قيمة العقد: ${contract.totalAmount} ريال سعودي`
        : `قضية تم إنشاؤها تلقائياً من العقد رقم: ${contract.contractNumber}`,
      assigned_lawyer_id: lawyerId || null,
    })
    .select("id")
    .single();

  if (error || !newCase) throw new ContractAccessError("تعذّر إنشاء القضية من العقد.");

  const caseId = newCase.id as string;
  await client
    .from("contracts")
    .update({ case_id: caseId, client_id: clientId })
    .eq("id", contract.id)
    .eq("organization_id", organizationId);

  await logContractEvent({
    organizationId,
    contractId: contract.id,
    eventType: "converted_to_case",
    metadata: { caseId },
  });

  return { caseId };
}

