/**
 * عمليات المصادقة المساعدة (متصفح فقط): إعادة إرسال تأكيد البريد، رابط الدخول
 * لمرة واحدة، إعادة تأكيد الهوية، وتغيير البريد أو كلمة المرور.
 * كل دالة تُرجع رسالة عربية جاهزة للعرض ولا تكشف أي تفاصيل تقنية.
 */
import { supabase } from "@/integrations/supabase/client";
import { AUTH_MESSAGES, logAuthEvent, translateAuthError } from "@/lib/auth-errors";

export type AuthActionResult = { ok: boolean; message: string };

const authRedirect = () => `${window.location.origin}/auth/callback`;

function fail(route: string, action: string, error: unknown): AuthActionResult {
  const message = translateAuthError(error as { message?: string; status?: number; code?: string });
  logAuthEvent({ route, action, sanitizedMessage: message });
  return { ok: false, message };
}

/** إعادة إرسال رابط تأكيد البريد لحساب لم يُؤكَّد بعد. */
export async function resendSignupConfirmation(email: string): Promise<AuthActionResult> {
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: email.trim().toLowerCase(),
    options: { emailRedirectTo: authRedirect() },
  });
  if (error) return fail("auth-actions", "resend_signup", error);
  return { ok: true, message: AUTH_MESSAGES.confirmationResent };
}

/** رابط دخول لمرة واحدة للحسابات القائمة فقط (لا يُنشئ حساباً جديداً). */
export async function sendMagicLink(email: string): Promise<AuthActionResult> {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { emailRedirectTo: authRedirect(), shouldCreateUser: false },
  });
  if (error) return fail("auth-actions", "magic_link", error);
  return { ok: true, message: AUTH_MESSAGES.magicLinkSent };
}

/** يطلب رمز إعادة تأكيد الهوية (يُرسل إلى بريد المستخدم الحالي). */
export async function requestReauthenticationCode(): Promise<AuthActionResult> {
  const { error } = await supabase.auth.reauthenticate();
  if (error) return fail("auth-actions", "reauthenticate", error);
  return { ok: true, message: AUTH_MESSAGES.reauthCodeSent };
}

/** تغيير بريد الحساب: لا يُطبَّق قبل تأكيد الرابط المُرسل إلى البريد الجديد. */
export async function changeAccountEmail(newEmail: string): Promise<AuthActionResult> {
  const email = newEmail.trim().toLowerCase();
  const { data } = await supabase.auth.getUser();
  if ((data.user?.email ?? "").toLowerCase() === email) {
    return { ok: false, message: AUTH_MESSAGES.sameEmail };
  }
  const { error } = await supabase.auth.updateUser(
    { email },
    { emailRedirectTo: authRedirect() },
  );
  if (error) return fail("auth-actions", "change_email", error);
  return { ok: true, message: AUTH_MESSAGES.emailChangeSent };
}

/** تغيير كلمة المرور مع رمز إعادة تأكيد الهوية. */
export async function changeAccountPassword(
  newPassword: string,
  nonce: string,
): Promise<AuthActionResult> {
  const code = nonce.trim();
  if (code.length < 6) return { ok: false, message: AUTH_MESSAGES.reauthRequired };
  const { error } = await supabase.auth.updateUser({ password: newPassword, nonce: code });
  if (error) return fail("auth-actions", "change_password", error);
  return { ok: true, message: AUTH_MESSAGES.passwordUpdated };
}