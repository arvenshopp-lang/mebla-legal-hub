export type AuthErrorLike = { message?: string; status?: number; code?: string } | null | undefined;

export const AUTH_MESSAGES = {
  invalidCredentials: "البريد الإلكتروني أو كلمة المرور غير صحيحة",
  emailNotConfirmed: "يجب تأكيد البريد الإلكتروني قبل تسجيل الدخول",
  userNotFound: "لا يوجد حساب مرتبط بهذا البريد",
  tooManyRequests: "كثرت المحاولات. حاول مرة أخرى بعد قليل",
  network: "تعذر الاتصال بالخدمة. تحقق من الإنترنت ثم أعد المحاولة",
  sessionExpired: "انتهت الجلسة. سجل الدخول مرة أخرى",
  accessDenied: "لا تملك صلاحية الدخول إلى هذه المنشأة",
  profileLoadFailed:
    "تم تسجيل الدخول ولكن تعذر تحميل بيانات الحساب. حاول مرة أخرى أو تواصل مع الدعم",
  organizationLoadFailed: "تم تسجيل الدخول ولكن تعذر تحميل بيانات المنشأة",
  weakPassword:
    "كلمة المرور المستخدمة ضعيفة أو شائعة الاستخدام، يرجى اختيار كلمة مرور أقوى",
  signUpFailed: "تعذر إنشاء الحساب، يرجى المحاولة مرة أخرى",
  emailInvalid: "البريد الإلكتروني غير صحيح، يرجى التحقق منه",
  emailTaken: "هذا البريد مسجّل مسبقاً. سجّل الدخول بدلاً من إنشاء حساب",
  confirmationResent: "أرسلنا رابط تأكيد جديد إلى بريدك الإلكتروني",
  magicLinkSent: "أرسلنا رابط دخول لمرة واحدة إلى بريدك الإلكتروني",
  linkExpired: "انتهت صلاحية الرابط أو تم استخدامه مسبقاً. اطلب رابطاً جديداً",
  reauthCodeSent: "أرسلنا رمز تحقق إلى بريدك الإلكتروني لتأكيد هويتك",
  reauthCodeInvalid: "رمز التحقق غير صحيح أو انتهت صلاحيته. اطلب رمزاً جديداً",
  reauthRequired: "لتأكيد هويتك، اطلب رمز التحقق ثم أدخله قبل إتمام التغيير",
  sameEmail: "هذا هو بريدك الحالي بالفعل، أدخل بريداً مختلفاً",
  samePassword: "كلمة المرور الجديدة مطابقة للحالية، اختر كلمة مختلفة",
  emailChangeSent:
    "أرسلنا رسالة تأكيد إلى البريد الجديد. لن يتغير بريد الدخول قبل تأكيد الرابط",
  passwordUpdated: "تم تحديث كلمة المرور بنجاح",
  generic: "حدث خطأ غير متوقع. حاول مرة أخرى",
} as const;

/** Translates a Supabase/GoTrue error into a clear Arabic message (no technical details leaked). */
export function translateAuthError(error: AuthErrorLike): string {
  if (!error) return AUTH_MESSAGES.generic;
  const code = (error.code || "").toLowerCase();
  const msg = (error.message || "").toLowerCase();

  if (code === "invalid_credentials" || msg.includes("invalid login credentials"))
    return AUTH_MESSAGES.invalidCredentials;
  if (code === "email_not_confirmed" || msg.includes("email not confirmed"))
    return AUTH_MESSAGES.emailNotConfirmed;
  if (code === "user_not_found" || msg.includes("user not found")) return AUTH_MESSAGES.userNotFound;
  if (
    code === "reauthentication_needed" ||
    msg.includes("reauthentication needed") ||
    msg.includes("nonce is required")
  )
    return AUTH_MESSAGES.reauthRequired;
  if (
    code === "reauthentication_not_valid" ||
    msg.includes("nonce has expired") ||
    msg.includes("invalid nonce")
  )
    return AUTH_MESSAGES.reauthCodeInvalid;
  if (code === "same_password" || msg.includes("should be different from the old password"))
    return AUTH_MESSAGES.samePassword;
  if (code === "otp_expired" || msg.includes("token has expired") || msg.includes("otp_expired"))
    return AUTH_MESSAGES.linkExpired;
  if (error.status === 429 || code.includes("over_") || msg.includes("too many"))
    return AUTH_MESSAGES.tooManyRequests;
  if (
    code === "user_already_exists" ||
    code === "email_exists" ||
    msg.includes("already registered") ||
    msg.includes("already been registered") ||
    msg.includes("user already exists")
  )
    return AUTH_MESSAGES.emailTaken;
  if (
    code === "weak_password" ||
    msg.includes("password should be") ||
    msg.includes("known to be weak") ||
    msg.includes("pwned") ||
    msg.includes("password is too short") ||
    msg.includes("data breach")
  )
    return AUTH_MESSAGES.weakPassword;
  if (code === "email_address_invalid" || msg.includes("invalid email") || msg.includes("unable to validate email"))
    return AUTH_MESSAGES.emailInvalid;
  if (code === "signup_disabled" || msg.includes("signups not allowed")) return AUTH_MESSAGES.signUpFailed;
  if (msg.includes("session") && (msg.includes("expired") || msg.includes("missing")))
    return AUTH_MESSAGES.sessionExpired;
  if (
    msg.includes("failed to fetch") ||
    msg.includes("network") ||
    msg.includes("load failed") ||
    error.status === 0 ||
    (error.status ?? 0) >= 500
  )
    return AUTH_MESSAGES.network;
  return AUTH_MESSAGES.generic;
}

/** Structured, PII-safe log line for auth failures. Never logs passwords or tokens. */
export function logAuthEvent(entry: {
  route: string;
  action: string;
  errorCode?: string;
  sanitizedMessage: string;
  userId?: string | null;
  organizationId?: string | null;
  requestId?: string | null;
}) {
  console.warn("[auth]", JSON.stringify({ ...entry, occurred_at: new Date().toISOString() }));
}
