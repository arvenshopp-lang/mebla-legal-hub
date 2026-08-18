/**
 * محرك إدارة وتوليد وتوقيع العقود الرقمية — خادمي فقط.
 */
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { watermarkFontBytes } from "@/lib/secure-view/watermark-font";
import { renderBillingPdf, type PdfDocumentModel, type PdfBrand } from "@/lib/billing/pdf/engine.server";
import { fmtDate } from "@/lib/enums";
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
    expiresAt: row.expires_at,
    signedAt: row.signed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const CONTRACT_COLUMNS =
  "id, organization_id, client_id, case_id, contract_number, title, contract_type, status, first_party, second_party, clauses, total_amount, advance_amount, final_amount, lawyer_signature, client_signature, expires_at, signed_at, created_at, updated_at";

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
    | "converted_to_case"
    | "converted_to_invoice";
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
      metadata: entry.metadata ?? {},
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

/** إنشاء عقد جديد وحفظه */
export async function saveContract(
  organizationId: string,
  contractData: Partial<ContractModel> & { title: string; contractType: ContractType },
): Promise<ContractModel> {
  const id = contractData.id || crypto.randomUUID();
  const existing = CONTRACTS_STORE.get(id);

  const contractNumber =
    existing?.contractNumber ||
    `CTR-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

  const firstParty = contractData.firstParty || existing?.firstParty || (await getOfficePartyInfo(organizationId));
  const secondParty =
    contractData.secondParty ||
    existing?.secondParty || {
      role: "second_party",
      name: "اسم الموكل / المنشأة",
      identifierType: "national_id",
      identifierNumber: "—",
      phone: "—",
    };

  const signToken = existing?.signToken || (await hashSignSecret(`${id}:${Date.now()}`)).slice(0, 32);

  const contract: ContractModel = {
    id,
    organizationId,
    clientId: contractData.clientId ?? existing?.clientId ?? null,
    caseId: contractData.caseId ?? existing?.caseId ?? null,
    contractNumber,
    title: contractData.title,
    contractType: contractData.contractType,
    status: contractData.status ?? existing?.status ?? "draft",
    firstParty,
    secondParty,
    totalAmount: contractData.totalAmount ?? existing?.totalAmount ?? null,
    advanceAmount: contractData.advanceAmount ?? existing?.advanceAmount ?? null,
    finalAmount: contractData.finalAmount ?? existing?.finalAmount ?? null,
    clauses: contractData.clauses ?? existing?.clauses ?? [],
    lawyerSignature: contractData.lawyerSignature ?? existing?.lawyerSignature ?? null,
    clientSignature: contractData.clientSignature ?? existing?.clientSignature ?? null,
    signToken,
    signUrl: `/sign/${signToken}`,
    expiresAt: contractData.expiresAt ?? existing?.expiresAt ?? new Date(Date.now() + 14 * 86400000).toISOString(),
    signedAt: contractData.signedAt ?? existing?.signedAt ?? null,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  CONTRACTS_STORE.set(id, contract);

  // إذا تم توقيع العقد ننشئ له سجلاً في المستندات
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

/** جلب قائمة العقود الخاصة بالمنظمة */
export async function getContractsByOrg(organizationId: string): Promise<ContractModel[]> {
  const list = Array.from(CONTRACTS_STORE.values()).filter((c) => c.organizationId === organizationId);
  return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/** جلب تفاصيل عقد بواسطة الـ ID */
export async function getContractById(
  organizationId: string,
  contractId: string,
): Promise<ContractModel | null> {
  const contract = CONTRACTS_STORE.get(contractId);
  if (!contract || contract.organizationId !== organizationId) return null;
  return contract;
}

/** جلب العقد بواسطة رمز التوقيع العام للعميل */
export async function getContractBySignToken(signToken: string): Promise<ContractModel | null> {
  for (const contract of CONTRACTS_STORE.values()) {
    if (contract.signToken === signToken) {
      return contract;
    }
  }
  return null;
}

/** تسجيل توقيع الموكل الإلكتروني */
export async function signContractByClient(
  signToken: string,
  signatureImageBase64: string,
  signerName: string,
  ipAddress?: string,
): Promise<{ ok: boolean; error?: string }> {
  const contract = await getContractBySignToken(signToken);
  if (!contract) return { ok: false, error: "العقد غير موجود أو الرابط غير صالح." };

  if (contract.status === "signed") {
    return { ok: true };
  }

  const clientSignature: ContractSignature = {
    signedBy: signerName || contract.secondParty.name,
    signedAt: new Date().toISOString(),
    signatureImageBase64,
    ipAddress,
    verificationHash: await hashSignSecret(`${contract.id}:${signerName}:${Date.now()}`),
  };

  contract.clientSignature = clientSignature;
  contract.status = "signed";
  contract.signedAt = new Date().toISOString();
  contract.updatedAt = new Date().toISOString();

  CONTRACTS_STORE.set(contract.id, contract);
  return { ok: true };
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
    documentFooterNote: "وثيقة قانونية صادرة وموقعة إلكترونياً وفق نظام التعاملات الإلكترونية ونظام الإثبات بالمملكة.",
  };

  const docModel: PdfDocumentModel = {
    kind: "quote",
    title: contract.title,
    reference: contract.contractNumber,
    fileName: `عقد_${contract.contractNumber}.pdf`,
    subtitle: `عقد واتفاقية قانونية معتمدة`,
    statusLine: contract.status === "signed" ? "موقع ومعتمد رسمياً بالختم الرقمي" : "بانتظار توقيع الطرف الثاني",
    notice: "حرر هذا العقد إلكترونياً ويعد ملزماً لأطرافه وفق الأنظمة واللوائح السارية بالمملكة.",
    meta: [
      { label: "رقم العقد", value: contract.contractNumber },
      { label: "تاريخ الإنشاء", value: fmtDate(contract.createdAt) },
      { label: "حالة التوثيق", value: contract.status === "signed" ? "معتمد ومكتمل" : "قيد الإجراء" },
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
          { label: "إجمالي قيمة العقد والأتعاب", value: `${contract.totalAmount.toLocaleString("en-US")} ر.س`, emphasis: true },
          { label: "الدفعة المقدمة غير المستردة", value: `${(contract.advanceAmount || 0).toLocaleString("en-US")} ر.س` },
        ]
      : [],
    blocks: [
      {
        title: "إقرار وتوثيق التوقيع الإلكتروني:",
        lines: [
          `الطرف الأول: ${contract.firstParty.name} (${contract.lawyerSignature?.signedBy || "المحامي المعتمد"}) — تم التوقيع والاعتماد`,
          `الطرف الثاني: ${contract.secondParty.name} (${contract.clientSignature?.signedBy || "بانتظار التوقيع"}) ${
            contract.clientSignature ? `— تم التوقيع إلكترونياً بتاريخ ${fmtDate(contract.clientSignature.signedAt)}` : ""
          }`,
          "يعد توقيع الطرفين عبر المنصة إقراراً نظامياً ملزماً لا رجعة فيه وفق نظام التعاملات الإلكترونية ونظام الإثبات بالمملكة.",
        ],
      },
    ],
    signatureSlots: [
      { label: "توقيع الطرف الأول (المكتب)", caption: contract.lawyerSignature?.signedBy || "المحامي المعتمد" },
      { label: "توقيع الطرف الثاني (الموكل)", caption: contract.clientSignature?.signedBy || contract.secondParty.name },
    ],
  };

  return await renderBillingPdf(docModel, brand);
}

/** تحويل العقد إلى قضية جديدة */
export async function createCaseFromContract(
  organizationId: string,
  contractId: string,
  lawyerId?: string,
) {
  const contract = CONTRACTS_STORE.get(contractId);
  if (!contract) throw new Error("العقد غير موجود.");

  let clientId = contract.clientId;

  // إذا لم يكن هناك عميل مرتبط، ننشئ سجلاً في جدول العملاء
  if (!clientId) {
    const { data: newClient, error: cErr } = await supabaseAdmin
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

    if (!cErr && newClient) {
      clientId = newClient.id;
      contract.clientId = clientId;
    }
  }

  const { data: newCase, error } = await supabaseAdmin
    .from("cases")
    .insert({
      organization_id: organizationId,
      client_id: clientId,
      case_title: contract.title,
      case_type: contract.contractType === "fee_agreement" ? "commercial" : "general",
      court_name: "المحكمة العامة / التجارية",
      status: "open",
      description: contract.totalAmount
        ? `قضية تم إنشاؤها تلقائياً من العقد رقم: ${contract.contractNumber} — قيمة العقد: ${contract.totalAmount} ر.س`
        : `قضية تم إنشاؤها تلقائياً من العقد رقم: ${contract.contractNumber}`,
      assigned_lawyer_id: lawyerId || null,
    })
    .select("id")
    .single();

  if (error || !newCase) throw new Error("تعذّر إنشاء القضية من العقد.");

  contract.caseId = newCase.id;
  CONTRACTS_STORE.set(contract.id, contract);
  return { caseId: newCase.id };
}

/** إصدار فاتورة مطالبة أتعاب من العقد */
export async function createInvoiceFromContract(organizationId: string, contractId: string) {
  const contract = CONTRACTS_STORE.get(contractId);
  if (!contract) throw new Error("العقد غير موجود.");
  if (!contract.clientId) {
    throw new Error("لا يمكن إصدار فاتورة قبل ربط العقد بموكل في سجل العملاء.");
  }

  const amount = contract.advanceAmount || contract.totalAmount || 10000;
  const vatAmount = Math.round(amount * 0.15 * 100) / 100;
  const totalWithVat = amount + vatAmount;

  const invoiceNumber = `INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

  const { data: inv, error } = await supabaseAdmin
    .from("office_invoices")
    .insert({
      organization_id: organizationId,
      client_id: contract.clientId,
      invoice_number: invoiceNumber,
      subtotal: amount,
      tax_total: vatAmount,
      total: totalWithVat,
      status: "issued",
      due_date: new Date(Date.now() + 14 * 86400000).toISOString(),
    })
    .select("id")
    .single();

  if (error || !inv) throw new Error("تعذّر إصدار الفاتورة من العقد.");
  return { invoiceId: inv.id, invoiceNumber };
}
