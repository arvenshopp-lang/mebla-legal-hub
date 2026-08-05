/**
 * نموذج دعوات الفريق المشترك بين الواجهة ودوال الخادم.
 * الرمز (token) سرّ لا يُشتق منه أي معرف، ولا تُعاد أي بيانات حساسة للزائر.
 */

export type InviteRole = "admin" | "lawyer" | "legal_assistant" | "viewer";

export const INVITE_ROLES: readonly InviteRole[] = [
  "admin",
  "lawyer",
  "legal_assistant",
  "viewer",
] as const;

export const INVITE_TOKEN_MIN = 20;
export const INVITE_TOKEN_MAX = 128;
export const INVITE_VALID_DAYS = 14;

export type InvitePreviewState =
  | "valid"
  | "invalid"
  | "expired"
  | "revoked"
  | "accepted"
  | "org_inactive";

export type InvitePreview = {
  state: InvitePreviewState;
  orgName: string | null;
  role: InviteRole | null;
  maskedEmail: string | null;
  expiresAt: string | null;
};

export type InviteAcceptResult =
  | {
      state: "joined";
      organizationId: string;
      orgName: string;
      role: InviteRole;
      alreadyMember: boolean;
    }
  | { state: "email_mismatch"; maskedEmail: string }
  | { state: Exclude<InvitePreviewState, "valid"> };

/** يُظهر ما يكفي للتعرّف على البريد دون كشفه بالكامل لحامل الرابط. */
export function maskEmail(email: string): string {
  const value = email.trim();
  const at = value.lastIndexOf("@");
  if (at <= 0) return "•••";
  const name = value.slice(0, at);
  const domain = value.slice(at + 1);
  const head = name.slice(0, Math.min(2, name.length));
  return `${head}${"•".repeat(Math.max(name.length - head.length, 2))}@${domain}`;
}

export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

export function isValidInviteToken(token: string): boolean {
  return (
    typeof token === "string" &&
    token.length >= INVITE_TOKEN_MIN &&
    token.length <= INVITE_TOKEN_MAX &&
    /^[A-Za-z0-9_-]+$/.test(token)
  );
}

export const INVITE_MESSAGES: Record<Exclude<InvitePreviewState, "valid">, string> = {
  invalid: "رابط الدعوة غير صحيح أو تم تعديله. اطلب من مسؤول المكتب إرسال رابط جديد.",
  expired: "انتهت صلاحية هذه الدعوة. اطلب من مسؤول المكتب إصدار دعوة جديدة.",
  revoked: "تم إلغاء هذه الدعوة من قِبل مسؤول المكتب.",
  accepted: "تم استخدام هذه الدعوة مسبقاً. سجّل الدخول للوصول إلى المكتب.",
  org_inactive: "حساب المكتب غير مُتاح حالياً. تواصل مع مسؤول المكتب.",
};

/** يحوّل أخطاء قاعدة البيانات إلى رسالة عربية مفهومة عند قبول الدعوة. */
export function describeInviteError(message: string): string {
  if (message.includes("FORBIDDEN")) {
    return "دعوة الأعضاء متاحة لمالك المكتب ومديريه فقط.";
  }
  if (message.includes("ALREADY_MEMBER")) {
    return "هذا البريد مسجّل بالفعل كعضو فعّال في المكتب.";
  }
  if (message.includes("INVITE_CREATE_FAILED") || message.includes("INVITE_LOOKUP_FAILED")) {
    return "تعذّر إنشاء الدعوة. حاول مرة أخرى بعد قليل.";
  }
  if (message.includes("QUOTA_EXCEEDED:users")) {
    return "بلغ المكتب الحد الأقصى لعدد الأعضاء في باقته الحالية. يلزم ترقية الباقة قبل إضافة عضو جديد.";
  }
  if (message.includes("SUBSCRIPTION_SUSPENDED")) {
    return "اشتراك المكتب موقوف حالياً، لذلك تعذّر إتمام الانضمام.";
  }
  return "تعذّر إتمام الانضمام. حاول مرة أخرى أو تواصل مع مسؤول المكتب.";
}
