/**
 * سجل تدقيق تنزيل نسخ العقود — خادمي فقط.
 *
 * كل تنزيل (من رابط التوقيع العام أو من مساحة عمل المكتب) يُكتب كحدث
 * `exported_pdf` في جدول `contract_events` المحصّن ضد التعديل والحذف.
 * السجل جدول مستقل: حدث التنزيل لا يلمس صف العقد ولا نسخته المختومة،
 * والكتابة لا تُفشل عملية التنزيل إطلاقاً.
 */
import { resolveRequestOrigin } from "@/lib/print/print-audit.server";
import { logContractEvent } from "./contracts.server";
import type { ContractModel } from "./contracts.shared";

export type ContractDownloadChannel = "public_sign_link" | "office_workspace";

export async function recordContractDownload(input: {
  contract: ContractModel;
  channel: ContractDownloadChannel;
  /** حجم الملف الناتج بالبايت — دليل مساند على اكتمال الإصدار. */
  byteLength: number;
  actorUserId?: string | null;
  actorLabel?: string | null;
}): Promise<void> {
  const { contract, channel } = input;
  // عنوان الشبكة والمتصفح يُقرآن من الطلب على الخادم ولا يُقبلان من المتصفح.
  const origin = resolveRequestOrigin();
  await logContractEvent({
    organizationId: contract.organizationId,
    contractId: contract.id,
    eventType: "exported_pdf",
    actorUserId: input.actorUserId ?? null,
    actorLabel:
      input.actorLabel ??
      (channel === "public_sign_link"
        ? contract.clientSignature?.signedBy ?? contract.secondParty.name
        : "مستخدم من المكتب"),
    ipAddress: origin.ip || null,
    userAgent: origin.userAgent || null,
    metadata: {
      channel,
      contractNumber: contract.contractNumber,
      verificationId: contract.verificationId ?? null,
      versionNumber: contract.versionNumber ?? null,
      contentHash: contract.contentHash ?? null,
      signatureHash: contract.clientSignature?.verificationHash ?? null,
      contractStatus: contract.status,
      fileBytes: input.byteLength,
      country: origin.country,
      downloadedAt: new Date().toISOString(),
    },
  });
}
