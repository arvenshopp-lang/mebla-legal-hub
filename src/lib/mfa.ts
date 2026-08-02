/**
 * التحقق بخطوتين (TOTP) — يعمل في المتصفح مقابل خدمة المصادقة.
 * السرّ لا يُخزَّن في قاعدة بيانات المنصة ولا يمر عبر خوادمنا التطبيقية.
 */
import { supabase } from "@/integrations/supabase/client";

export type MfaFactor = {
  id: string;
  friendly_name?: string;
  status: string;
  created_at: string;
};

export async function listMfaFactors(): Promise<MfaFactor[]> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw new Error("تعذّر قراءة حالة التحقق بخطوتين.");
  return (data?.totp ?? []) as MfaFactor[];
}

export async function startTotpEnrollment(): Promise<{ factorId: string; qrSvg: string; secret: string }> {
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `مِهلة ${new Date().toLocaleDateString("ar-SA")}`,
  });
  if (error || !data) {
    throw new Error(
      error?.message?.includes("already exists")
        ? "لديك عامل تحقق قيد الإنشاء بالفعل. أعد المحاولة بعد إزالته."
        : "تعذّر بدء تفعيل التحقق بخطوتين.",
    );
  }
  return { factorId: data.id, qrSvg: data.totp.qr_code, secret: data.totp.secret };
}

export async function confirmTotpEnrollment(factorId: string, code: string): Promise<void> {
  const challenge = await supabase.auth.mfa.challenge({ factorId });
  if (challenge.error || !challenge.data) throw new Error("تعذّر إنشاء طلب التحقق.");
  const { error } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.data.id,
    code: code.replace(/\s/g, ""),
  });
  if (error) throw new Error("الرمز غير صحيح أو انتهت صلاحيته. حاول برمز جديد.");
}

export async function removeMfaFactor(factorId: string): Promise<void> {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) throw new Error("تعذّر إلغاء التحقق بخطوتين.");
}

/** مستوى ضمان الجلسة الحالي: aal2 يعني أن المستخدم أكمل التحقق بخطوتين. */
export async function currentAssuranceLevel(): Promise<"aal1" | "aal2" | null> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return null;
  return (data.currentLevel as "aal1" | "aal2" | null) ?? null;
}