/**
 * دوال الخادم لعقود مِهلة الرقمية (TanStack Start Server Functions)
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  getContractsByOrg,
  getContractById,
  saveContract,
  getContractBySignToken,
  signContractByClient,
  generateContractPdf,
  createCaseFromContract,
  createInvoiceFromContract,
  getOfficePartyInfo,
  getClientPartyInfo,
} from "./contracts.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ContractModel, ContractType } from "./contracts.shared";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

export const getContractsListFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { organizationId?: string } | undefined) => d || {})
  .handler(async ({ data, context }) => {
    const orgId = data.organizationId || DEFAULT_ORG_ID;
    const contracts = await getContractsByOrg(orgId);
    return { contracts };
  });

export const getContractDetailsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { contractId: string; organizationId?: string }) => d)
  .handler(async ({ data }) => {
    const orgId = data.organizationId || DEFAULT_ORG_ID;
    const contract = await getContractById(orgId, data.contractId);
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
  .handler(async ({ data }) => {
    const orgId = data.organizationId || DEFAULT_ORG_ID;
    const contract = await saveContract(orgId, {
      ...data,
      organizationId: orgId,
    });
    return { contract, ok: true };
  });

export const getPublicContractForSigningFn = createServerFn({ method: "GET" })
  .validator((d: { signToken: string }) => d)
  .handler(async ({ data }) => {
    const contract = await getContractBySignToken(data.signToken);
    if (!contract) return { contract: null };
    return { contract };
  });

export const signPublicContractFn = createServerFn({ method: "POST" })
  .validator(
    (d: { signToken: string; signatureImageBase64: string; signerName: string; ipAddress?: string }) => d,
  )
  .handler(async ({ data }) => {
    const result = await signContractByClient(
      data.signToken,
      data.signatureImageBase64,
      data.signerName,
      data.ipAddress,
    );
    return result;
  });

export const downloadContractPdfFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { contractId: string; organizationId?: string }) => d)
  .handler(async ({ data }) => {
    const orgId = data.organizationId || DEFAULT_ORG_ID;
    const contract = await getContractById(orgId, data.contractId);
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
  .handler(async ({ data }) => {
    const orgId = data.organizationId || DEFAULT_ORG_ID;
    const result = await createCaseFromContract(orgId, data.contractId);
    return { ok: true, caseId: result.caseId };
  });

export const convertContractToInvoiceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { contractId: string; organizationId?: string }) => d)
  .handler(async ({ data }) => {
    const orgId = data.organizationId || DEFAULT_ORG_ID;
    const result = await createInvoiceFromContract(orgId, data.contractId);
    return { ok: true, invoiceId: result.invoiceId, invoiceNumber: result.invoiceNumber };
  });
