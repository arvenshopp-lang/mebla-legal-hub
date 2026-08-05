/**
 * إدارة خطوة التحقق من رقم الجوال بحيث تصمد أمام خروج المستخدم من Safari.
 *
 * • الحالة الحقيقية على الخادم (otp_verifications)، والمتصفح يستعيدها فقط.
 * • الرجوع من واتساب أو الملاحظات يُعيد نفس الخطوة ونفس الرقم ونفس المؤقت.
 * • تحديث الصفحة لا يُرسل رمزاً جديداً: نستعيد الرمز النشط، ولا نُعيد الإرسال
 *   إلا بعد انتهاء صلاحيته أو انتهاء مدة الانتظار.
 * • رمز التحقق نفسه لا يُخزَّن في المتصفح إطلاقاً.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { usePageLifecycle } from "@/hooks/use-page-lifecycle";
import { getPhoneChallenge, requestPhoneCode } from "./sms.functions";
import { SMS_MESSAGES, type OtpPurpose } from "./sms.shared";

const KEY_PREFIX = "mehla_otp_intent:";

type Intent = { key: string; at: number };

function intentKey(purpose: OtpPurpose, phone: string): string {
  return `${KEY_PREFIX}${purpose}:${phone}`;
}

/** مفتاح منع التكرار: نفس المفتاح خلال مدة الانتظار لا يُنتج رسالة ثانية. */
function idempotencyKey(purpose: OtpPurpose, phone: string, windowSeconds: number): string {
  const storageKey = intentKey(purpose, phone);
  try {
    const raw = sessionStorage.getItem(storageKey);
    const existing = raw ? (JSON.parse(raw) as Intent) : null;
    if (existing && Date.now() - existing.at < windowSeconds * 1000) return existing.key;
  } catch {
    /* تجاهل تعذّر القراءة */
  }
  const created: Intent = { key: crypto.randomUUID().replace(/-/g, ""), at: Date.now() };
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(created));
  } catch {
    /* تجاهل تعذّر الحفظ */
  }
  return created.key;
}

function clearIntent(purpose: OtpPurpose, phone: string): void {
  try {
    sessionStorage.removeItem(intentKey(purpose, phone));
  } catch {
    /* تجاهل */
  }
}

export type PhoneChallenge = {
  /** يوجد رمز نشط والمستخدم في خطوة إدخال الرمز. */
  active: boolean;
  /** الثواني المتبقية لصلاحية الرمز. */
  secondsLeft: number;
  /** الثواني المتبقية قبل السماح بإعادة الإرسال. */
  resendIn: number;
  expired: boolean;
  canResend: boolean;
  busy: boolean;
  error: string | null;
  attemptsLeft: number | null;
  testMode: boolean;
  send: () => Promise<boolean>;
  reset: () => void;
  clearError: () => void;
};

export function usePhoneChallenge({
  phone,
  purpose,
  resendWaitSeconds,
  enabled = true,
}: {
  /** الرقم بصيغة E.164 أو null إن لم يكن صالحاً بعد. */
  phone: string | null;
  purpose: OtpPurpose;
  resendWaitSeconds: number;
  enabled?: boolean;
}): PhoneChallenge {
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [resendAt, setResendAt] = useState<number | null>(null);
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [testMode, setTestMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const sending = useRef(false);

  const resume = useCallback(async () => {
    if (!enabled || !phone) return;
    try {
      const state = await getPhoneChallenge({ data: { phone, purpose } });
      setAttemptsLeft(state.attemptsLeft);
      setTestMode(state.testMode);
      if (state.pending && state.expiresAt) {
        setExpiresAt(new Date(state.expiresAt).getTime());
        setResendAt(Date.now() + state.resendAfterSeconds * 1000);
      } else {
        setExpiresAt(null);
        setResendAt(null);
      }
    } catch {
      /* استعادة الحالة لا تُظهر خطأً للمستخدم */
    }
  }, [enabled, phone, purpose]);

  // استعادة الحالة عند التحميل وعند تغيّر الرقم
  useEffect(() => {
    void resume();
  }, [resume]);

  // الرجوع من تطبيق آخر أو من BFCache: نستعيد نفس الخطوة والمؤقت الحقيقي
  usePageLifecycle({
    onShow: () => {
      setNow(Date.now());
      void resume();
    },
  });

  // مؤقت العرض
  useEffect(() => {
    if (!expiresAt && !resendAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [expiresAt, resendAt]);

  const secondsLeft = expiresAt ? Math.max(0, Math.ceil((expiresAt - now) / 1000)) : 0;
  const resendIn = resendAt ? Math.max(0, Math.ceil((resendAt - now) / 1000)) : 0;
  const expired = !!expiresAt && secondsLeft === 0;
  const active = !!expiresAt && secondsLeft > 0;
  const canResend = !!phone && !busy && resendIn === 0 && (!active || expired);

  const send = useCallback(async () => {
    if (!phone || sending.current) return false;
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await requestPhoneCode({
        data: {
          phone,
          purpose,
          idempotencyKey: idempotencyKey(purpose, phone, resendWaitSeconds),
        },
      });
      setExpiresAt(new Date(result.expiresAt).getTime());
      setResendAt(Date.now() + result.resendAfterSeconds * 1000);
      setTestMode(result.testMode);
      setNow(Date.now());
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : SMS_MESSAGES.sendFailed);
      void resume();
      return false;
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }, [phone, purpose, resendWaitSeconds, resume]);

  const reset = useCallback(() => {
    if (phone) clearIntent(purpose, phone);
    setExpiresAt(null);
    setResendAt(null);
    setError(null);
  }, [phone, purpose]);

  return {
    active,
    secondsLeft,
    resendIn,
    expired,
    canResend,
    busy,
    error,
    attemptsLeft,
    testMode,
    send,
    reset,
    clearError: () => setError(null),
  };
}

/** عرض المؤقت بصيغة m:ss. */
export function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
