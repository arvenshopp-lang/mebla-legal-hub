/**
 * الأسعار التجارية المعتمدة للعرض العام (Display Source of Truth).
 *
 * السبب: كتالوج `platform_plans` يحتوي قيمة شهرية غير تجارية للباقة الأساسية
 * (5 ريال) لا تتوافق مع السعر السنوي المعتمد (1,990 ريال). حتى تُصحَّح القيمة
 * في الكتالوج ضمن نافذة تعديل مصرّح بها لقاعدة البيانات، تُعرض الصفحات العامة
 * السعر التجاري المعتمد من هذا الملف.
 *
 * قواعد صارمة:
 * - هذا الملف للعرض العام فقط؛ لا يُستخدم في الفوترة أو إنشاء المدفوعات.
 * - أي إضافة أو تعديل هنا تتطلب اعتماد مالك المنصة كتابةً.
 */

export type CommercialPrice = { price_monthly: number; price_yearly: number };

/** الأسعار المعتمدة من مالك المنصة (ريال سعودي، بلا ضريبة). */
export const APPROVED_PLAN_PRICES: Record<string, CommercialPrice> = {
  basic: { price_monthly: 199, price_yearly: 1990 },
};

/** يطبّق السعر التجاري المعتمد على صف باقة عام (عرض فقط). */
export function applyApprovedPricing<T extends { code: string } & CommercialPrice>(plan: T): T {
  const approved = APPROVED_PLAN_PRICES[plan.code];
  if (!approved) return plan;
  return { ...plan, price_monthly: approved.price_monthly, price_yearly: approved.price_yearly };
}
