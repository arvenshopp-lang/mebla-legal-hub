import type { DocumentSecurityState, ReleasePurpose } from "./policy";
import { RAW_BYTE_PURPOSES, RELEASABLE_STATES, releaseDenialMessage } from "./policy";
import {
  bindLegacyContentHash,
  isLegacyGrandfathered,
  logSecurityEvent,
  readSecurityState,
} from "./security-state.server";

/**
 * البوابة المركزية الوحيدة لتسليم بايتات أي مستند.
 *
 * كل مسار تسليم (عرض، مشاركة، طباعة، تنزيل، معالجة، مرفق بريد) يجب أن يعبر من
 * هنا. القاعدة: لا تسليم إلا بحالة «مُفرَج عنه» + بصمة محتوى + معرّف قرار +
 * تطابق المكتب. أي شك يُعامل كرفض (Fail-Closed).
 */

export class ReleaseDenied extends Error {
  constructor(
    message: string,
    readonly state: DocumentSecurityState | "missing",
    readonly reason: string,
  ) {
    super(message);
    this.name = "ReleaseDenied";
  }
}

export type ReleaseDecision = {
  documentId: string;
  organizationId: string;
  purpose: ReleasePurpose;
  state: DocumentSecurityState;
  sha256: string;
  decisionId: string;
  /** النسخة الآمنة المسطّحة، عندما تكون الصيغة قابلة للتطهير. */
  safe: { path: string; sha256: string; mime: string } | null;
};

/**
 * يحدد مصدر البايتات لغرض التسليم: النسخة الآمنة للعرض والمشاركة والطباعة،
 * والأصل فقط لمسار المعالجة الداخلي المصرَّح له بالبايتات الخام.
 */
export function deliverySource(
  decision: ReleaseDecision,
  originalPath: string,
): { path: string; sha256: string; isSafeCopy: boolean } {
  if (decision.safe && !RAW_BYTE_PURPOSES.includes(decision.purpose)) {
    return { path: decision.safe.path, sha256: decision.safe.sha256, isSafeCopy: true };
  }
  return { path: originalPath, sha256: decision.sha256, isSafeCopy: false };
}

/**
 * يمنح — أو يمنع — تسليم بايتات مستند لغرض محدد. يُسجّل القرار في السجل الأمني
 * غير القابل للتعديل في الحالتين.
 */
export async function assertReleasable(input: {
  documentId: string;
  organizationId: string;
  purpose: ReleasePurpose;
  actorId?: string | null;
  /** مطلوب صريحاً عندما يكون الغرض تسليم بايتات خام دون ختم. */
  allowRawBytes?: boolean;
}): Promise<ReleaseDecision> {
  const correlationId = crypto.randomUUID();
  const deny = async (
    state: DocumentSecurityState | "missing",
    reason: string,
    message: string,
  ): Promise<never> => {
    await logSecurityEvent({
      documentId: input.documentId,
      organizationId: input.organizationId,
      actorId: input.actorId ?? null,
      action: "release_gate",
      purpose: input.purpose,
      result: "denied",
      reason,
      fromState: state === "missing" ? null : state,
      correlationId,
    });
    throw new ReleaseDenied(message, state, reason);
  };

  const row = await readSecurityState(input.documentId);
  if (!row) {
    return deny("missing", "no_security_state", releaseDenialMessage("quarantined"));
  }
  if (row.organization_id !== input.organizationId) {
    return deny(row.state, "cross_tenant_attempt", "رابط غير صالح.");
  }
  if (!RELEASABLE_STATES.includes(row.state)) {
    return deny(row.state, `state_not_releasable:${row.state}`, releaseDenialMessage(row.state));
  }
  const legacy = isLegacyGrandfathered(row);
  if ((!row.sha256 && !legacy) || !row.decision_id) {
    return deny(row.state, "missing_integrity_binding", releaseDenialMessage("quarantined"));
  }
  if (!row.scan_engine_version) {
    return deny(row.state, "missing_scan_result", releaseDenialMessage("quarantined"));
  }
  if (RAW_BYTE_PURPOSES.includes(input.purpose) && !input.allowRawBytes) {
    return deny(row.state, "raw_bytes_not_authorized", releaseDenialMessage("quarantined"));
  }

  await logSecurityEvent({
    documentId: input.documentId,
    organizationId: input.organizationId,
    actorId: input.actorId ?? null,
    action: "release_gate",
    purpose: input.purpose,
    result: "allowed",
    reason: "released_state_verified",
    fromState: row.state,
    sha256: row.sha256,
    correlationId,
  });

  return {
    documentId: input.documentId,
    organizationId: input.organizationId,
    purpose: input.purpose,
    state: row.state,
    sha256: row.sha256,
    decisionId: row.decision_id,
    safe:
      row.safe_path && row.safe_sha256
        ? {
            path: row.safe_path,
            sha256: row.safe_sha256,
            mime: row.safe_mime ?? "application/pdf",
          }
        : null,
  };
}

/**
 * يتحقق من سلامة البايتات المسلَّمة فعلياً مقابل البصمة المثبَّتة عند الإفراج.
 * أي اختلاف يعني تغيّر الكائن بعد القرار، فيُمنع التسليم ويُسجّل الحدث.
 */
export async function assertContentMatchesDecision(
  decision: ReleaseDecision,
  bytes: Uint8Array,
): Promise<void> {
  const { sha256Hex } = await import("./security-state.server");
  const actual = await sha256Hex(bytes);
  // تُقبل بصمة الأصل أو بصمة النسخة الآمنة المثبَّتة لنفس القرار.
  if (actual === decision.sha256 || actual === decision.safe?.sha256) return;
  await logSecurityEvent({
    documentId: decision.documentId,
    organizationId: decision.organizationId,
    action: "integrity_revalidation",
    purpose: decision.purpose,
    result: "denied",
    reason: "content_hash_mismatch",
    sha256: actual,
    metadata: { expected: decision.sha256 },
  });
  throw new ReleaseDenied(
    "تم منع تسليم هذا الملف لعدم تطابق بصمة المحتوى مع النسخة المعتمدة.",
    decision.state,
    "content_hash_mismatch",
  );
}

/**
 * بوابة مرفقات البريد: لا يُسلَّم أي مرفق محجور أو لم يجتز التحقق البنيوي، ولا
 * مرفق بلا بصمة محتوى مسجّلة.
 */
export async function assertAttachmentReleasable(
  db: {
    from: (table: "email_attachments") => {
      select: (columns: string) => {
        eq: (
          column: string,
          value: string,
        ) => { maybeSingle: () => Promise<{ data: unknown; error: unknown }> };
      };
    };
  },
  attachmentId: string,
): Promise<{ storagePath: string; fileName: string; sha256: string }> {
  const { data } = await db
    .from("email_attachments")
    .select("id, file_name, storage_path, sha256, scan_status, is_quarantined")
    .eq("id", attachmentId)
    .maybeSingle();
  const row = data as {
    file_name: string;
    storage_path: string;
    sha256: string | null;
    scan_status: string | null;
    is_quarantined: boolean;
  } | null;
  if (!row) throw new ReleaseDenied("المرفق غير موجود.", "missing", "attachment_missing");
  if (row.is_quarantined) {
    throw new ReleaseDenied(
      "هذا المرفق محجور ولا يمكن تنزيله.",
      "quarantined",
      "attachment_quarantined",
    );
  }
  const ALLOWED_SCAN_STATUS = ["not_scanned", "clean", "passed"];
  if (!ALLOWED_SCAN_STATUS.includes(row.scan_status ?? "")) {
    throw new ReleaseDenied(
      "هذا المرفق غير متاح حالياً لأسباب أمنية.",
      "quarantined",
      `attachment_scan_status:${row.scan_status ?? "unknown"}`,
    );
  }
  if (!row.sha256) {
    throw new ReleaseDenied(
      "هذا المرفق غير متاح حالياً لأسباب أمنية.",
      "quarantined",
      "attachment_missing_hash",
    );
  }
  return { storagePath: row.storage_path, fileName: row.file_name, sha256: row.sha256 };
}