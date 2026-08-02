/**
 * طبقة الرسائل النصية — أنواع وأدوات آمنة للمتصفح والخادم معاً.
 *
 * توثيق الجوال مستقل تماماً عن التحقق بخطوتين: قد يكون الجوال موثقاً دون تفعيل
 * التحقق بخطوتين، والعكس صحيح. المزوّد قابل للتغيير من لوحة الإدارة دون أي تعديل برمجي.
 */

export type SmsProvider = "infobip" | "twilio" | "unifonic" | "custom";

export const SMS_PROVIDER_LABELS: Record<SmsProvider, string> = {
  infobip: "Infobip",
  twilio: "Twilio",
  unifonic: "Unifonic",
  custom: "مزوّد مخصص (Webhook)",
};

/** نمط التسجيل: يحدد دور الجوال في إنشاء الحساب دون أي علاقة بالتحقق بخطوتين. */
export type SignupMode =
  | "disabled"
  | "optional"
  | "required_unverified_allowed"
  | "required_verified"
  | "outage_bypass";

export const SIGNUP_MODE_LABELS: Record<SignupMode, string> = {
  disabled: "معطّل — لا يُطلب رقم الجوال",
  optional: "اختياري — يُطلب الرقم دون توثيق",
  required_unverified_allowed: "إلزامي بدون توثيق — الرقم مطلوب ويُسمح بالمتابعة",
  required_verified: "إلزامي بتوثيق — لا يكتمل التسجيل قبل التحقق",
  outage_bypass: "تجاوز الانقطاع — الرقم مطلوب ويُتجاوز التحقق مؤقتاً",
};

export const SIGNUP_MODE_HINTS: Record<SignupMode, string> = {
  disabled: "لا يظهر حقل الجوال في التسجيل، ولا تُرسل أي رسالة.",
  optional: "يظهر الحقل ويمكن تخطيه، ويُحفظ الرقم بحالة «غير موثّق».",
  required_unverified_allowed: "الحقل مطلوب، ويكمل المستخدم التسجيل وحالة رقمه «غير موثّق».",
  required_verified: "الحقل مطلوب ويجب إدخال رمز التحقق قبل إنشاء الحساب.",
  outage_bypass: "يُستخدم أثناء انقطاع المزوّد: يُحفظ الرقم ويؤجَّل التوثيق دون تعطيل التسجيل.",
};

export type PhoneVerificationStatus = "not_required" | "pending" | "verified" | "failed" | "disabled";

export const PHONE_STATUS_LABELS: Record<PhoneVerificationStatus, string> = {
  not_required: "غير مطلوب",
  pending: "بانتظار التوثيق",
  verified: "موثّق",
  failed: "فشل التوثيق",
  disabled: "التوثيق معطّل",
};

/** حالة التحقق بخطوتين — اختيارية دائماً ولا تمنع أي عملية على المنصة. */
export type MfaStatus = "disabled" | "sms_enabled" | "totp_enabled" | "both_enabled";

export const MFA_STATUS_LABELS: Record<MfaStatus, string> = {
  disabled: "غير مفعّل",
  sms_enabled: "مفعّل عبر الرسائل النصية",
  totp_enabled: "مفعّل عبر تطبيق المصادقة",
  both_enabled: "مفعّل عبر الرسائل وتطبيق المصادقة",
};

export type OtpPurpose = "signup" | "phone_verification" | "login_mfa" | "phone_change";

export type SmsHealthStatus = "operational" | "degraded" | "unavailable" | "disabled";

export const SMS_HEALTH_LABELS: Record<SmsHealthStatus, string> = {
  operational: "تعمل بشكل طبيعي",
  degraded: "أداء متذبذب",
  unavailable: "متوقفة",
  disabled: "غير مُشغّلة",
};

/** ما تحتاجه صفحة التسجيل وإعدادات المستخدم — لا يحتوي أي مفاتيح أو أسرار. */
export type SmsPublicConfig = {
  smsEnabled: boolean;
  signupMode: SignupMode;
  showPhoneField: boolean;
  requirePhone: boolean;
  requireVerification: boolean;
  allowSignupDuringOutage: boolean;
  showOutageNotice: boolean;
  outage: boolean;
  defaultDialCode: string;
  codeLength: number;
  codeTtlMinutes: number;
  resendWaitSeconds: number;
  testMode: boolean;
};

export const SMS_DISABLED_CONFIG: SmsPublicConfig = {
  smsEnabled: false,
  signupMode: "disabled",
  showPhoneField: false,
  requirePhone: false,
  requireVerification: false,
  allowSignupDuringOutage: true,
  showOutageNotice: false,
  outage: false,
  defaultDialCode: "+966",
  codeLength: 6,
  codeTtlMinutes: 5,
  resendWaitSeconds: 60,
  testMode: true,
};

const ARABIC_DIGITS = /[\u0660-\u0669\u06F0-\u06F9]/g;

/** يحوّل الأرقام العربية والهندية إلى لاتينية ويحذف كل ما ليس رقماً أو +. */
export function toLatinDigits(input: string): string {
  return input.replace(ARABIC_DIGITS, (d) => {
    const code = d.charCodeAt(0);
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });
}

export type PhoneParseResult =
  | { ok: true; e164: string; national: string }
  | { ok: false; message: string };

/**
 * تطبيع رقم الجوال إلى صيغة E.164. يدعم الصيغ السعودية الشائعة
 * (05XXXXXXXX، 5XXXXXXXX، 9665XXXXXXXX، +9665XXXXXXXX) وأي رقم دولي بصيغة +.
 */
export function normalizePhone(raw: string, defaultDialCode = "+966"): PhoneParseResult {
  const cleaned = toLatinDigits(raw ?? "").replace(/[\s\-()._]/g, "");
  if (!cleaned) return { ok: false, message: "يرجى إدخال رقم الجوال." };
  if (/[^\d+]/.test(cleaned)) return { ok: false, message: "رقم الجوال يجب أن يحتوي أرقاماً فقط." };

  let digits = cleaned.startsWith("+") ? cleaned.slice(1) : cleaned;
  if (digits.includes("+")) return { ok: false, message: "صيغة رقم الجوال غير صحيحة." };

  const dial = defaultDialCode.replace("+", "") || "966";
  if (dial === "966") {
    if (digits.startsWith("00966")) digits = digits.slice(5);
    else if (digits.startsWith("966")) digits = digits.slice(3);
    else if (digits.startsWith("0")) digits = digits.slice(1);
    if (/^5\d{8}$/.test(digits)) {
      return { ok: true, e164: `+966${digits}`, national: `0${digits}` };
    }
    if (!cleaned.startsWith("+")) {
      return { ok: false, message: "أدخل رقم جوال سعودي صحيح يبدأ بـ 05 ويتكون من 10 أرقام." };
    }
  }

  if (!cleaned.startsWith("+")) digits = `${dial}${digits.replace(/^0+/, "")}`;
  if (!/^\d{8,15}$/.test(digits)) return { ok: false, message: "صيغة رقم الجوال الدولي غير صحيحة." };
  return { ok: true, e164: `+${digits}`, national: `+${digits}` };
}

/** إخفاء الرقم للعرض والسجلات: يُبقي مفتاح الدولة وآخر ثلاثة أرقام فقط. */
export function maskPhone(e164: string): string {
  const digits = toLatinDigits(e164).replace(/[^\d]/g, "");
  if (digits.length < 5) return "•••";
  return `+${digits.slice(0, digits.length > 11 ? 3 : 3)}•••••${digits.slice(-3)}`;
}

export function requiresVerification(mode: SignupMode): boolean {
  return mode === "required_verified";
}

export function phoneFieldVisible(config: SmsPublicConfig): boolean {
  if (config.signupMode === "disabled") return false;
  return config.showPhoneField;
}

export const SMS_MESSAGES = {
  disabled: "خدمة الرسائل النصية غير مُشغّلة حالياً.",
  outage: "خدمة الرسائل غير متاحة مؤقتاً. يمكنك متابعة إنشاء الحساب وتوثيق رقمك لاحقاً من الإعدادات.",
  rateLimited: "تجاوزت عدد المحاولات المسموح بها. انتظر قليلاً ثم أعد المحاولة.",
  invalidCode: "الرمز غير صحيح. تأكد من الرمز المرسل وأعد المحاولة.",
  expiredCode: "انتهت صلاحية الرمز. اطلب رمزاً جديداً.",
  tooManyAttempts: "تم تجاوز عدد محاولات التحقق. اطلب رمزاً جديداً.",
  sendFailed: "تعذّر إرسال رمز التحقق حالياً.",
  verified: "تم توثيق رقم الجوال بنجاح.",
} as const;