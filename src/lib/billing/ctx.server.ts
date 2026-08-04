/**
 * بناء سياق العمليات المالية — يُستدعى داخل معالجات دوال الخادم فقط.
 * كل عملية مالية تمر من هنا: تحقق صلاحية فعلي على الخادم + معرّف طلب وارتباط
 * يُكتبان في سجل التدقيق ومحاولات الدفع لتتبع العملية من البداية للنهاية.
 */
import { getRequest } from "@tanstack/react-start/server";
import type { AdminPermission } from "@/lib/admin-permissions";
import { requireStaff } from "@/lib/admin-guard.server";
import { newCorrelationId, type BillingCtx } from "./billing.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export function currentRequestId(): string {
  try {
    const req = getRequest();
    const header =
      req.headers.get("cf-ray") ??
      req.headers.get("x-request-id") ??
      req.headers.get("x-correlation-id");
    if (header) return header.slice(0, 80);
  } catch {
    /* لا يوجد طلب فعلي (تشغيل مجدول) */
  }
  return newCorrelationId("req");
}

export async function billingCtx(
  supabase: AnyClient,
  userId: string,
  permission: AdminPermission,
): Promise<BillingCtx> {
  const staff = await requireStaff(supabase, userId, permission);
  return { sb: supabase, staff, correlationId: newCorrelationId(), requestId: currentRequestId() };
}

/** رسالة خطأ آمنة للواجهة: بدون أي تفاصيل داخلية أو Stack Trace. */
export function safeMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : "";
  if (!message) return fallback;
  // نسمح فقط بالرسائل العربية المكتوبة عمداً داخل المحرك.
  return /[\u0600-\u06FF]/.test(message) ? message : fallback;
}
