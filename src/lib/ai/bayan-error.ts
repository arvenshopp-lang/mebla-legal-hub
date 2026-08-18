/** تحويل أخطاء الخادم إلى رسائل عربية آمنة للمستخدم دون كشف تفاصيل داخلية. */
export function bayanErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  if (/401|unauthor/i.test(raw)) {
    return "انتهت جلستك. يرجى إعادة تسجيل الدخول لمتابعة الاستشارة.";
  }
  // الرسائل العربية الصادرة من بوابات الصلاحية والباقة آمنة للعرض كما هي.
  if (/[\u0600-\u06FF]/.test(raw)) return raw;
  return "تعذّر إتمام الاستشارة حالياً. يرجى المحاولة مرة أخرى.";
}
