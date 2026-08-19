/**
 * سجل أعطال داخلي قابل للبحث.
 *
 * لكل عطل يُولَّد "معرّف تعرّف" قصير وآمن (لا يحمل أي بيانات) يُعرض للمستخدم
 * مع رسالة عامة فقط، بينما تُحفظ التفاصيل التقنية داخل جدول `system_failures`
 * الذي لا يقرأه إلا موظفو المنصة المصرَّح لهم. الكتابة تحدث بصلاحية الخادم،
 * ولا يمكن لأي مستخدم إضافته أو تعديله أو حذفه.
 */

export type FailureSurface =
  | "secure_view"
  | "secure_share"
  | "document_processing"
  | "support_ticket"
  | "support_message"
  | "support_rating"
  | "print"
  | "email"
  | "office_page"
  | "other";

export type FailureInput = {
  surface: FailureSurface;
  action: string;
  error: unknown;
  errorCode?: string | null;
  httpStatus?: number | null;
  organizationId?: string | null;
  userId?: string | null;
  documentId?: string | null;
  ticketId?: string | null;
  path?: string | null;
  metadata?: Record<string, unknown>;
};

const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** خطورة الحادثة المشتقة من السطح — لا تعتمد على نص العطل. */
const SURFACE_SEVERITY: Record<FailureSurface, "critical" | "high" | "medium" | "low"> = {
  secure_view: "critical",
  secure_share: "high",
  document_processing: "high",
  support_ticket: "medium",
  support_message: "medium",
  support_rating: "low",
  print: "high",
  email: "high",
  office_page: "medium",
  other: "medium",
};

/** تسميات عربية للأسطح داخل عنوان الحادثة. */
const SURFACE_LABELS: Record<FailureSurface, string> = {
  secure_view: "العرض الآمن للمستندات",
  secure_share: "مشاركة المستندات",
  document_processing: "معالجة المستندات",
  support_ticket: "تذاكر الدعم",
  support_message: "رسائل الدعم",
  support_rating: "تقييم الدعم",
  print: "محرك الطباعة",
  email: "البريد",
  office_page: "صفحة المكتب العامة",
  other: "أنظمة أخرى",
};

/** معرّف تعرّف آمن: عشوائي بالكامل ولا يكشف أي بيانات. */
export function newFailureRef(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let out = "";
  bytes.forEach((byte) => {
    out += REF_ALPHABET[byte % REF_ALPHABET.length];
  });
  return `MF-${out.slice(0, 5)}-${out.slice(5)}`;
}

/** إزالة أي قيم قد تكشف مسارات المخزن أو الرموز أو البريد قبل الحفظ. */
function redact(text: string): string {
  return text
    .replace(/[\w.-]+@[\w.-]+\.\w+/g, "[بريد]")
    .replace(/(?:bearer\s+)?[A-Za-z0-9_-]{40,}/g, "[رمز]")
    .replace(/https?:\/\/\S+/g, "[رابط]")
    .replace(/\b[\w-]+\/[\w-]+\/[\w./-]+\.(pdf|docx?|png|jpe?g|webp|txt)\b/gi, "[مسار ملف]")
    .slice(0, 1000);
}

function describe(error: unknown): string {
  if (error instanceof Error) return redact(error.message || error.name);
  if (typeof error === "string") return redact(error);
  try {
    return redact(JSON.stringify(error));
  } catch {
    return "خطأ غير معروف";
  }
}

/**
 * يكتب العطل ويُعيد معرّف التعرّف. لا يرمي أي استثناء أبداً: فشل التسجيل
 * لا يجوز أن يُخفي العطل الأصلي عن المستخدم.
 */
export async function logFailure(input: FailureInput): Promise<string> {
  const ref = newFailureRef();
  try {
    const [{ supabaseAdmin }, secure] = await Promise.all([
      import("@/integrations/supabase/client.server"),
      import("@/lib/secure-view/secure-view.server"),
    ]);
    const env = secure.requestEnvironment();
    await supabaseAdmin.from("system_failures").insert({
      ref,
      surface: input.surface,
      action: input.action.slice(0, 80),
      error_code: input.errorCode ? input.errorCode.slice(0, 60) : null,
      error_message: describe(input.error),
      http_status: input.httpStatus ?? null,
      organization_id: input.organizationId ?? null,
      user_id: input.userId ?? null,
      document_id: input.documentId ?? null,
      ticket_id: input.ticketId ?? null,
      path: input.path ? input.path.slice(0, 200) : null,
      ip: env.ip || null,
      browser: env.browser,
      os: env.os,
      device: env.device,
      user_agent: env.userAgent || null,
      metadata: (input.metadata ?? {}) as never,
    });

    // تجميع العطل في حادثة تشغيلية واحدة (بصمة السطح + الإجراء + رمز العطل)
    // ثم تنبيه فريق المنصة عبر قناة لا تعتمد على SMTP.
    const [{ recordIncident, recordAlertOutcome }, { dispatchIncidentAlert }] = await Promise.all([
      import("@/lib/observability/incidents.server"),
      import("@/lib/observability/alert-channel.server"),
    ]);
    const incident = await recordIncident(supabaseAdmin, {
      source: "failure",
      surface: input.surface,
      action: input.action,
      errorCode: input.errorCode ?? null,
      title: `عطل في ${SURFACE_LABELS[input.surface]} — ${input.action}`,
      severity: SURFACE_SEVERITY[input.surface],
      sampleRef: ref,
      metadata: {
        http_status: input.httpStatus ?? undefined,
        ...(input.metadata ?? {}),
      },
    });
    if (incident?.shouldAlert) {
      const outcome = await dispatchIncidentAlert(supabaseAdmin, {
        incidentId: incident.incidentId,
        title: incident.title,
        severity: incident.severity,
        surface: input.surface,
        action: input.action,
        occurrences: incident.occurrences,
        reopened: incident.reopened,
      });
      await recordAlertOutcome(supabaseAdmin, incident.incidentId, {
        sent: outcome.sent,
        channel: outcome.channel,
        reason: outcome.reason ?? null,
      });
    }
  } catch (error) {
    console.error("[failure-log] تعذّر حفظ سجل العطل", ref, error);
  }
  return ref;
}
