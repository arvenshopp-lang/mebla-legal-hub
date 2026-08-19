/**
 * دوال الخادم لعقود مِهلة الرقمية (TanStack Start Server Functions)
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import {
  getContractsByOrg,
  getContractById,
  saveContract,
  getContractBySignToken,
  signContractByClient,
  generateContractPdf,
  createCaseFromContract,
  resolveContractOrg,
  issueSignLink,
  issueContractDownloadTicket,
  resolveContractDownloadTicket,
  getContractForTicket,
  logContractEvent,
  ContractAccessError,
} from "./contracts.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertEntitlement } from "@/lib/subscription.server";
import type { ContractType } from "./contracts.shared";

/** بوابة التوقيع الإلكتروني: متاحة للباقة الاحترافية وباقة المؤسسات فقط. */
const ESIGNATURE_GATE = { feature: "esignature_enabled", requireLive: true } as const;

export const getContractsListFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { organizationId?: string } | undefined) => d || {})
  .handler(async ({ data, context }) => {
    const { organizationId } = await resolveContractOrg(context.supabase, data.organizationId ?? null);
    const contracts = await getContractsByOrg(context.supabase, organizationId);
    return { contracts };
  });

export const getContractDetailsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { contractId: string; organizationId?: string }) => d)
  .handler(async ({ data, context }) => {
    const { organizationId } = await resolveContractOrg(context.supabase, data.organizationId ?? null);
    const contract = await getContractById(context.supabase, organizationId, data.contractId);
    return { contract };
  });

export const saveContractDraftFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (
      data: {
        id?: string;
        organizationId?: string;
        title: string;
        contractType: ContractType;
        clientId?: string | null;
        totalAmount?: number | null;
        advanceAmount?: number | null;
        clauses: Array<{ id: string; title: string; content: string; isMandatory?: boolean }>;
        secondParty?: {
          role: "first_party" | "second_party";
          name: string;
          identifierType: "cr" | "national_id" | "iqama";
          identifierNumber: string;
          phone: string;
          email?: string;
          city?: string;
        };
        lawyerSignature?: {
          signedBy: string;
          signedAt: string;
          signatureImageBase64: string;
        } | null;
        status?: "draft" | "pending_signature" | "signed" | "cancelled" | "expired";
      },
    ) => data,
  )
  .handler(async ({ data, context }) => {
    const { organizationId } = await resolveContractOrg(context.supabase, data.organizationId ?? null, true);
    // الاعتماد على التوقيع الرقمي (توقيع المحامي أو إرسال العقد للتوقيع) ميزة مدفوعة.
    if (data.lawyerSignature || data.status === "pending_signature" || data.status === "signed") {
      await assertEntitlement(context.supabase, organizationId, ESIGNATURE_GATE);
    }
    const contract = await saveContract(
      context.supabase,
      organizationId,
      { ...data, organizationId },
      { userId: context.userId },
    );
    return { contract, ok: true };
  });

export const issueContractSignLinkFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { contractId: string; organizationId?: string }) => d)
  .handler(async ({ data, context }) => {
    const { organizationId } = await resolveContractOrg(context.supabase, data.organizationId ?? null, true);
    await assertEntitlement(context.supabase, organizationId, ESIGNATURE_GATE);
    const link = await issueSignLink(context.supabase, organizationId, data.contractId, {
      userId: context.userId,
    });
    return link;
  });

export const getPublicContractForSigningFn = createServerFn({ method: "GET" })
  .validator((d: { signToken: string }) => d)
  .handler(async ({ data }) => {
    const contract = await getContractBySignToken(data.signToken);
    if (!contract) return { contract: null };
    // العقد الموقّع مسبقاً يُتاح تحميله فوراً بتذكرة قصيرة الصلاحية.
    const downloadTicket =
      contract.status === "signed" ? await issueContractDownloadTicket(contract) : null;
    return { contract, downloadTicket };
  });

export const signPublicContractFn = createServerFn({ method: "POST" })
  .validator(
    (d: { signToken: string; signatureImageBase64: string; signerName: string; ipAddress?: string }) => d,
  )
  .handler(async ({ data }) => {
    // عنوان الشبكة والمتصفح يُقرآن من الطلب على الخادم ولا يُقبلان من المتصفح.
    const request = getRequest();
    const ipAddress =
      request.headers.get("cf-connecting-ip") ||
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      undefined;
    const result = await signContractByClient(
      data.signToken,
      data.signatureImageBase64,
      data.signerName,
      ipAddress,
      request.headers.get("user-agent") ?? undefined,
    );
    return result;
  });

/**
 * تحميل النسخة الموقعة من رابط التوقيع العام.
 * الطرف الخارجي لا يملك جلسة، فالتحقق يعتمد على تذكرة موقّعة (HMAC) قصيرة
 * الصلاحية صادرة من الخادم بعد التوقيع، ولا تُقبل أي معرّفات من المتصفح.
 */
export const downloadSignedContractByTicketFn = createServerFn({ method: "POST" })
  .validator((d: { downloadTicket: string }) => d)
  .handler(async ({ data }) => {
    const { contractId, organizationId } = await resolveContractDownloadTicket(data.downloadTicket);
    const contract = await getContractForTicket(contractId, organizationId);
    if (!contract) throw new ContractAccessError("العقد غير متاح للتحميل.");
    if (contract.status !== "signed") {
      throw new ContractAccessError("لم يكتمل توقيع العقد بعد، ولا تتوفر نسخة نهائية للتحميل.");
    }

    const pdfBytes = await generateContractPdf(contract);

    const request = getRequest();
    await logContractEvent({
      organizationId: contract.organizationId,
      contractId: contract.id,
      eventType: "exported_pdf",
      actorLabel: contract.clientSignature?.signedBy ?? contract.secondParty.name,
      ipAddress:
        request.headers.get("cf-connecting-ip") ||
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        null,
      userAgent: request.headers.get("user-agent"),
      metadata: { channel: "public_sign_link" },
    });

    return {
      fileName: `عقد_${contract.contractNumber}.pdf`,
      base64: Buffer.from(pdfBytes).toString("base64"),
    };
  });

export const downloadContractPdfFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { contractId: string; organizationId?: string }) => d)
  .handler(async ({ data, context }) => {
    const { organizationId } = await resolveContractOrg(context.supabase, data.organizationId ?? null);
    const contract = await getContractById(context.supabase, organizationId, data.contractId);
    if (!contract) throw new Error("العقد غير موجود.");

    const pdfBytes = await generateContractPdf(contract);
    const base64 = Buffer.from(pdfBytes).toString("base64");
    return {
      fileName: `عقد_${contract.contractNumber}.pdf`,
      base64,
    };
  });

export const convertContractToCaseFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { contractId: string; organizationId?: string }) => d)
  .handler(async ({ data, context }) => {
    const { organizationId } = await resolveContractOrg(context.supabase, data.organizationId ?? null, true);
    const result = await createCaseFromContract(context.supabase, organizationId, data.contractId);
    return { ok: true, caseId: result.caseId };
  });


/**
 * تحقق عام من عقد عبر رقم التحقق (QR أو إدخال يدوي).
 * لا يكشف أي بند أو مبلغ أو بيانات تعريف للأطراف — إثبات وجود وحالة فقط.
 */
export const verifyContractPublicFn = createServerFn({ method: "GET" })
  .validator((d: { verificationId: string }) => ({
    verificationId: String(d?.verificationId ?? "").slice(0, 40),
  }))
  .handler(async ({ data }) => {
    const { verifyContractByPublicId } = await import("./contract-lifecycle.server");
    return verifyContractByPublicId(data.verificationId);
  });
