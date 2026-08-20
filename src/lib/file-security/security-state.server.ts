import type { DocumentSecurityState, ReleasePurpose } from "./policy";
import { FILE_SECURITY_LIMITS } from "./policy";

/**
 * إدارة الحالة الأمنية للمستندات وسجلها غير القابل للتعديل.
 *
 * كل تغيير حالة يمر من هنا حصراً. الانتقالات المسموح بها مفروضة أيضاً بمُشغِّل
 * في قاعدة البيانات، فلا يمكن لأي مسار خادمي كسر آلة الحالة.
 */

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export type SecurityEvent = {
  documentId?: string | null;
  organizationId?: string | null;
  actorId?: string | null;
  action: string;
  purpose?: ReleasePurpose | null;
  result: "allowed" | "denied" | "error";
  reason?: string | null;
  fromState?: DocumentSecurityState | null;
  toState?: DocumentSecurityState | null;
  sha256?: string | null;
  correlationId?: string | null;
  metadata?: Record<string, unknown>;
};

/** سجل أمني غير قابل للتعديل أو الحذف. يُكتب بصلاحية الخادم فقط. */
export async function logSecurityEvent(event: SecurityEvent): Promise<void> {
  const db = await admin();
  await db.from("document_security_events").insert({
    document_id: event.documentId ?? null,
    organization_id: event.organizationId ?? null,
    actor_id: event.actorId ?? null,
    action: event.action,
    purpose: event.purpose ?? null,
    result: event.result,
    reason: event.reason ? event.reason.slice(0, 400) : null,
    from_state: event.fromState ?? null,
    to_state: event.toState ?? null,
    sha256: event.sha256 ?? null,
    correlation_id: event.correlationId ?? null,
    metadata: (event.metadata ?? {}) as never,
  });
}

export type SecurityStateRow = {
  document_id: string;
  organization_id: string;
  state: DocumentSecurityState;
  sha256: string | null;
  bytes: number | null;
  declared_mime: string | null;
  detected_mime: string | null;
  decision_id: string | null;
  scan_attempts: number;
};

const STATE_COLUMNS =
  "document_id, organization_id, state, sha256, bytes, declared_mime, detected_mime, decision_id, scan_attempts";

export async function readSecurityState(documentId: string): Promise<SecurityStateRow | null> {
  const db = await admin();
  const { data } = await db
    .from("document_security_state")
    .select(STATE_COLUMNS)
    .eq("document_id", documentId)
    .maybeSingle();
  return (data as SecurityStateRow | null) ?? null;
}

/** يُنشئ صف الحالة الأمنية لمستند جديد بحالة «مرفوع». */
export async function registerUploadedDocument(input: {
  documentId: string;
  organizationId: string;
  sha256: string;
  bytes: number;
  declaredMime: string | null;
  detectedMime: string | null;
  correlationId?: string | null;
  actorId?: string | null;
}): Promise<void> {
  const db = await admin();
  const { error } = await db.from("document_security_state").insert({
    document_id: input.documentId,
    organization_id: input.organizationId,
    state: "uploaded",
    sha256: input.sha256,
    bytes: input.bytes,
    declared_mime: input.declaredMime,
    detected_mime: input.detectedMime,
    correlation_id: input.correlationId ?? null,
    reason: "intake",
  });
  if (error) throw new Error("تعذّر تسجيل الحالة الأمنية للملف، ولم يُتَح الملف.");
  await logSecurityEvent({
    documentId: input.documentId,
    organizationId: input.organizationId,
    actorId: input.actorId ?? null,
    action: "intake",
    result: "allowed",
    toState: "uploaded",
    sha256: input.sha256,
    correlationId: input.correlationId ?? null,
    metadata: { bytes: input.bytes, declared_mime: input.declaredMime },
  });
}

/**
 * انتقال حالة واحد. يتحقق من المكتب أولاً، ويُسجّل أي محاولة عبور بين المكاتب
 * كحدث رفض دائم قبل الرمي.
 */
export async function transitionSecurityState(input: {
  documentId: string;
  organizationId: string;
  next: DocumentSecurityState;
  reason: string;
  sha256?: string | null;
  detectedMime?: string | null;
  correlationId?: string | null;
  actorId?: string | null;
}): Promise<DocumentSecurityState> {
  const db = await admin();
  const current = await readSecurityState(input.documentId);
  if (!current) throw new Error("لا توجد حالة أمنية مسجّلة لهذا الملف.");

  if (current.organization_id !== input.organizationId) {
    await logSecurityEvent({
      documentId: input.documentId,
      organizationId: current.organization_id,
      actorId: input.actorId ?? null,
      action: "transition",
      result: "denied",
      reason: "cross_tenant_attempt",
      fromState: current.state,
      toState: input.next,
      correlationId: input.correlationId ?? null,
    });
    throw new Error("الملف لا ينتمي إلى هذا المكتب.");
  }

  const patch: {
    state: DocumentSecurityState;
    reason: string;
    sha256?: string;
    detected_mime?: string;
    correlation_id?: string;
    scan_attempts?: number;
    decision_id?: string;
    decided_at?: string;
  } = {
    state: input.next,
    reason: input.reason,
  };
  if (input.sha256) patch.sha256 = input.sha256;
  if (input.detectedMime) patch.detected_mime = input.detectedMime;
  if (input.correlationId) patch.correlation_id = input.correlationId;
  if (input.next === "scanning") patch.scan_attempts = current.scan_attempts + 1;
  if (input.next === "released") patch.decision_id = crypto.randomUUID();
  if (["released", "clean", "malicious", "unscannable"].includes(input.next)) {
    patch.decided_at = new Date().toISOString();
  }

  const { error } = await db
    .from("document_security_state")
    .update(patch)
    .eq("document_id", input.documentId)
    .eq("organization_id", input.organizationId);
  if (error) {
    await logSecurityEvent({
      documentId: input.documentId,
      organizationId: input.organizationId,
      action: "transition",
      result: "denied",
      reason: `transition_rejected:${current.state}->${input.next}`,
      fromState: current.state,
      toState: input.next,
      correlationId: input.correlationId ?? null,
    });
    throw new Error("انتقال الحالة الأمنية غير مسموح.");
  }

  await logSecurityEvent({
    documentId: input.documentId,
    organizationId: input.organizationId,
    actorId: input.actorId ?? null,
    action: "transition",
    result: "allowed",
    reason: input.reason,
    fromState: current.state,
    toState: input.next,
    sha256: input.sha256 ?? current.sha256,
    correlationId: input.correlationId ?? null,
  });
  return input.next;
}

/**
 * خط الفحص والإفراج الكامل لملف تم التحقق من بايتاته عند الإدخال:
 * مرفوع → محجوز → قيد الفحص → سليم → مُفرَج عنه.
 *
 * أي فشل يُبقي الملف محجوزاً ولا يُفرج عنه أبداً (Fail-Closed)، والمستند يبقى
 * مسجّلاً في القاعدة حتى لا تُفقد بيانات المكتب.
 */
export async function runIntakeReleasePipeline(input: {
  documentId: string;
  organizationId: string;
  sha256: string;
  bytes: number;
  declaredMime: string | null;
  detectedMime: string | null;
  actorId?: string | null;
}): Promise<DocumentSecurityState> {
  const correlationId = crypto.randomUUID();
  await registerUploadedDocument({ ...input, correlationId });
  const base = {
    documentId: input.documentId,
    organizationId: input.organizationId,
    correlationId,
    actorId: input.actorId ?? null,
  };
  try {
    await transitionSecurityState({ ...base, next: "quarantined", reason: "intake_quarantine" });
    await transitionSecurityState({ ...base, next: "scanning", reason: "structural_scan" });

    if (input.bytes <= 0 || input.bytes > FILE_SECURITY_LIMITS.maxBytes) {
      await transitionSecurityState({ ...base, next: "malicious", reason: "size_out_of_policy" });
      throw new Error("حجم الملف خارج السياسة الأمنية.");
    }

    await transitionSecurityState({
      ...base,
      next: "clean",
      reason: "structural_validation_passed",
      sha256: input.sha256,
      detectedMime: input.detectedMime,
    });
    return await transitionSecurityState({
      ...base,
      next: "released",
      reason: "release_gate_approved",
      sha256: input.sha256,
    });
  } catch (error) {
    await logSecurityEvent({
      documentId: input.documentId,
      organizationId: input.organizationId,
      action: "pipeline",
      result: "error",
      reason: error instanceof Error ? error.message : "pipeline_failed",
      correlationId,
    });
    throw error;
  }
}