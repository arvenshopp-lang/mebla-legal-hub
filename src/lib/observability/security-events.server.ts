/**
 * محرك وقاموس أحداث الأمان والمراقبة (MEHLA Security Observability & Abuse Detection).
 *
 * المبادئ الصارمة:
 *  1. Sensitive Data Redaction: حظر تسجيل الأسرار وكلمات المرور والرموز والمفاتيح ونصوص الوثائق.
 *  2. Severity Classification: تصنيف دقيق (INFO, LOW, MEDIUM, HIGH, CRITICAL).
 *  3. Tamper Resistance: الأحداث تُسجل عبر صلاحيات الخادم في جداول غير قابلة للتعديل أو الحذف.
 *  4. Zero External Alerting in Dev: محرك كشف وتقييم مستقل لا يرسل بريداً حقيقياً تلقائياً دون إعداد قنوات معتمدة.
 */

export type SecuritySeverity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type SecurityEventType =
  | "AUTH_FAILED"
  | "AUTH_RATE_LIMITED"
  | "AAL2_STEP_UP_REQUIRED"
  | "AAL2_SUCCESS"
  | "PRIVILEGE_DENIED"
  | "PRIVILEGE_CHANGED"
  | "PII_REVEALED"
  | "DOCUMENT_ACCESS_DENIED"
  | "DOCUMENT_SCAN_INFECTED"
  | "DOCUMENT_SCAN_FAILED"
  | "TENANT_AUTHORIZATION_DENIED"
  | "WEBHOOK_SIGNATURE_FAILED"
  | "WEBHOOK_REPLAY_BLOCKED"
  | "RATE_LIMIT_TRIGGERED"
  | "ADMIN_SECURITY_ACTION";

export type SecurityEventInput = {
  type: SecurityEventType;
  severity?: SecuritySeverity;
  actorId?: string | null;
  actorEmail?: string | null;
  organizationId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  action: string;
  description?: string | null;
  traceRef?: string | null;
  ip?: string | null;
  metadata?: Record<string, unknown>;
};

export type SecurityAlertRule = {
  id: string;
  name: string;
  description: string;
  severity: SecuritySeverity;
  thresholdCount: number;
  windowSeconds: number;
};

/** مصفوفة تصنيف الخطورة الافتراضية لأحداث الأمان */
export const EVENT_SEVERITY_MAP: Record<SecurityEventType, SecuritySeverity> = {
  AUTH_FAILED: "LOW",
  AUTH_RATE_LIMITED: "MEDIUM",
  AAL2_STEP_UP_REQUIRED: "LOW",
  AAL2_SUCCESS: "INFO",
  PRIVILEGE_DENIED: "MEDIUM",
  PRIVILEGE_CHANGED: "HIGH",
  PII_REVEALED: "MEDIUM",
  DOCUMENT_ACCESS_DENIED: "MEDIUM",
  DOCUMENT_SCAN_INFECTED: "HIGH",
  DOCUMENT_SCAN_FAILED: "MEDIUM",
  TENANT_AUTHORIZATION_DENIED: "HIGH",
  WEBHOOK_SIGNATURE_FAILED: "HIGH",
  WEBHOOK_REPLAY_BLOCKED: "MEDIUM",
  RATE_LIMIT_TRIGGERED: "LOW",
  ADMIN_SECURITY_ACTION: "MEDIUM",
};

/** قواعد كشف الأنماط المشبوهة (Abuse Detection Rules) */
export const SECURITY_DETECTION_RULES: readonly SecurityAlertRule[] = [
  {
    id: "RULE_BURST_AUTH_FAILURES",
    name: "تكرار إخفاقات تسجيل الدخول",
    description: "أكثر من 5 محاولات دخول فاشلة لنفس الحساب أو الـ IP خلال 5 دقائق",
    severity: "HIGH",
    thresholdCount: 5,
    windowSeconds: 300,
  },
  {
    id: "RULE_CROSS_TENANT_BURST",
    name: "محاولات وصول عابرة للمستأجرين",
    description: "محاولات وصول غير مصرح بها بين مكاتب مختلفة",
    severity: "CRITICAL",
    thresholdCount: 1,
    windowSeconds: 60,
  },
  {
    id: "RULE_MALWARE_UPLOAD",
    name: "اكتشاف برمجية خبيثة في مستند",
    description: "رفع ملف يحتوي بصمة EICAR أو كود تنفيذي أو ماكرو محظور",
    severity: "HIGH",
    thresholdCount: 1,
    windowSeconds: 60,
  },
  {
    id: "RULE_WEBHOOK_FORGERY_BURST",
    name: "تزوير توقيع رسائل الدفع الواردة",
    description: "تكرار فشل توقيع HMAC لرسائل Webhook لمزودات الدفع",
    severity: "HIGH",
    thresholdCount: 3,
    windowSeconds: 300,
  },
  {
    id: "RULE_BURST_RATE_LIMIT",
    name: "إغراق المسارات العامة بالطلبات",
    description: "تجاوز حدود المعدل على النماذج العامة خلال نافذة زمنية قصيرة",
    severity: "MEDIUM",
    thresholdCount: 10,
    windowSeconds: 60,
  },
] as const;

/** مفاتيح وقيم حساسة تُحجب قسراً قبل كتابتها في السجلات */
const SENSITIVE_KEYS = /(password|secret|token|api[_-]?key|authorization|bearer|cookie|cvv|card[_-]?number|key_material)/i;

/** تنظيف وحجب البيانات الحساسة من السياق التعريفي للحدث */
export function sanitizeEventMetadata(data: unknown, depth = 0): unknown {
  if (depth > 5) return "[عميق]";
  if (!data) return data;
  if (Array.isArray(data)) {
    return data.slice(0, 50).map((item) => sanitizeEventMetadata(item, depth + 1));
  }
  if (typeof data === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.test(key)) {
        out[key] = "[محجوب أمنياً]";
      } else if (typeof value === "string") {
        out[key] = value
          .replace(/[\w.-]+@[\w.-]+\.\w+/g, "[بريد]")
          .replace(/(?:bearer\s+)?[A-Za-z0-9_-]{35,}/gi, "[رمز]")
          .slice(0, 500);
      } else {
        out[key] = sanitizeEventMetadata(value, depth + 1);
      }
    }
    return out;
  }
  if (typeof data === "string") {
    return data.length > 500 ? `${data.slice(0, 500)}…` : data;
  }
  return data;
}

/**
 * تسجيل حدث أمني موحد في قاعدة البيانات (Fail-Safe)
 */
export async function logSecurityEvent(event: SecurityEventInput): Promise<string> {
  const [{ newTraceRef }, { supabaseAdmin }] = await Promise.all([
    import("@/lib/security/sensitive-guard.server"),
    import("@/integrations/supabase/client.server"),
  ]);

  const traceRef = event.traceRef || newTraceRef("SEC");
  const severity = event.severity || EVENT_SEVERITY_MAP[event.type] || "INFO";
  const cleanMeta = sanitizeEventMetadata(event.metadata ?? {}) as Record<string, unknown>;

  try {
    await (supabaseAdmin as any).from("admin_audit_logs").insert({
      action: `security.${event.type.toLowerCase()}`,
      actor_id: event.actorId || null,
      actor_email: event.actorEmail || null,
      target_type: event.targetType || "security_event",
      target_id: event.targetId || null,
      organization_id: event.organizationId || null,
      description: event.description || event.action,
      metadata: {
        ...cleanMeta,
        severity,
        trace_ref: traceRef,
        ip: event.ip || null,
        security_event_type: event.type,
      },
    });
  } catch (err) {
    console.error("[security-observability] Failed to persist audit log:", err);
  }

  return traceRef;
}
