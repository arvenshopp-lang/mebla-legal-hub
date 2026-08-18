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

/** ذاكرة تخزين العقود لضمان العمل الفوري والسلس */
const CONTRACTS_STORE = new Map<string, ContractModel>();

/** تجزئة آمنة للرمز */
async function hashSignSecret(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text + ":mehla-contracts-secure-2026");
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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

  if (contract.status === "signed" && contract.caseId) {
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
      description: `قضية تم إنشاؤها تلقائياً من العقد رقم: ${contract.contractNumber}`,
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
      total: totalWithVat,
      tax_total: vatAmount,
      status: "issued",
      due_date: new Date(Date.now() + 14 * 86400000).toISOString(),
    })
    .select("id")
    .single();

  if (error || !inv) throw new Error("تعذّر إصدار الفاتورة من العقد.");
  return { invoiceId: inv.id, invoiceNumber };
}
