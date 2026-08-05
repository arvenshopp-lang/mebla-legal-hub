/**
 * توثيق رقم الجوال + التحقق بخطوتين عبر الرسائل.
 *
 * الحالتان مستقلتان تماماً: يمكن توثيق الرقم دون تفعيل التحقق بخطوتين،
 * ولا يمنع أي منهما استخدام المنصة أو الوصول إلى القضايا والمستندات.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Smartphone, ShieldCheck } from "lucide-react";
import { Btn, LoadingBlock, inputCls, Badge } from "@/lib/list-utils";
import { fmtDateTime } from "@/lib/enums";
import {
  confirmMyPhone,
  getMyPhoneStatus,
  getSmsPublicConfig,
  setSmsMfa,
} from "@/lib/sms/sms.functions";
import { formatCountdown, usePhoneChallenge } from "@/lib/sms/use-phone-challenge";
import {
  MFA_STATUS_LABELS,
  PHONE_STATUS_LABELS,
  SMS_MESSAGES,
  normalizePhone,
  type MfaStatus,
  type PhoneVerificationStatus,
} from "@/lib/sms/sms.shared";

export function PhoneVerificationCard() {
  const qc = useQueryClient();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");

  const config = useQuery({ queryKey: ["sms-public-config"], queryFn: () => getSmsPublicConfig() });
  const status = useQuery({ queryKey: ["my-phone-status"], queryFn: () => getMyPhoneStatus() });
  const parsedPhone = normalizePhone(phone, config.data?.defaultDialCode ?? "+966");

  // خطوة التحقق محفوظة على الخادم: الرجوع من واتساب أو الملاحظات يستعيدها كما هي
  const challenge = usePhoneChallenge({
    phone: parsedPhone.ok ? parsedPhone.e164 : null,
    purpose: "phone_verification",
    resendWaitSeconds: config.data?.resendWaitSeconds ?? 60,
  });

  const sendCode = async () => {
    if (!parsedPhone.ok) {
      toast.error("تعذّر الإرسال", { description: parsedPhone.message });
      return;
    }
    const ok = await challenge.send();
    if (ok) {
      setCode("");
      toast.success("تم إرسال رمز التحقق", {
        description: challenge.testMode
          ? "الخدمة في وضع الاختبار — تواصل مع الدعم للحصول على الرمز."
          : undefined,
      });
    } else if (challenge.error) {
      toast.error("تعذّر الإرسال", { description: challenge.error });
    }
  };

  const confirm = useMutation({
    mutationFn: async () => {
      if (!parsedPhone.ok) throw new Error(parsedPhone.message);
      return confirmMyPhone({ data: { phone: parsedPhone.e164, code } });
    },
    onSuccess: () => {
      toast.success(SMS_MESSAGES.verified);
      challenge.reset();
      setCode("");
      qc.invalidateQueries({ queryKey: ["my-phone-status"] });
    },
    onError: (e: Error) => toast.error("تعذّر التوثيق", { description: e.message }),
  });

  const smsMfa = useMutation({
    mutationFn: (enabled: boolean) => setSmsMfa({ data: { enabled } }),
    onSuccess: (result) => {
      toast.success(
        result.mfaStatus === "disabled" || result.mfaStatus === "totp_enabled"
          ? "تم إلغاء التحقق بخطوتين عبر الرسائل"
          : "تم تفعيل التحقق بخطوتين عبر الرسائل",
      );
      qc.invalidateQueries({ queryKey: ["my-phone-status"] });
    },
    onError: (e: Error) => toast.error("تعذّر التحديث", { description: e.message }),
  });

  const phoneStatus = (status.data?.status ?? "not_required") as PhoneVerificationStatus;
  const mfaStatus = (status.data?.mfaStatus ?? "disabled") as MfaStatus;
  const smsMfaOn = mfaStatus === "sms_enabled" || mfaStatus === "both_enabled";
  const verified = phoneStatus === "verified";
  const serviceOff = !config.data?.smsEnabled;

  return (
    <section className="rounded-[var(--radius-l)] border border-border bg-surface p-6">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-bold">
        <Smartphone className="h-4 w-4 text-primary" aria-hidden />
        رقم الجوال وتوثيقه
      </h3>

      {status.isLoading || config.isLoading ? (
        <LoadingBlock rows={2} cols={2} />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone={verified ? "green" : phoneStatus === "pending" ? "warn" : "muted"}>
              {PHONE_STATUS_LABELS[phoneStatus]}
            </Badge>
            {status.data?.phone && (
              <span className="font-medium text-foreground" dir="ltr">
                {status.data.phone}
              </span>
            )}
            {status.data?.verifiedAt && (
              <span className="text-[12px] text-text-muted">
                وثّق في {fmtDateTime(status.data.verifiedAt)}
              </span>
            )}
          </div>

          <p className="text-[12.5px] leading-6 text-text-muted">
            توثيق رقم الجوال منفصل تماماً عن التحقق بخطوتين، وكلاهما اختياري ولا يؤثر على صلاحياتك
            أو وصولك إلى بيانات المكتب.
          </p>

          {serviceOff ? (
            <div className="rounded-[var(--radius-m)] border border-border bg-surface-muted p-3 text-[12.5px] leading-6 text-text-muted">
              {config.data?.outage ? SMS_MESSAGES.outage : SMS_MESSAGES.disabled}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-end gap-3">
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium">رقم الجوال</span>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    inputMode="numeric"
                    autoComplete="tel"
                    dir="ltr"
                    placeholder="05XXXXXXXX"
                    className={inputCls + " max-w-[200px] text-center tracking-[0.12em]"}
                  />
                </label>
                <Btn
                  variant="outline"
                  onClick={() => void sendCode()}
                  loading={challenge.busy}
                  disabled={phone.trim().length < 8 || (challenge.active && !challenge.canResend)}
                >
                  {challenge.active
                    ? challenge.canResend
                      ? "إعادة إرسال الرمز"
                      : `إعادة الإرسال بعد ${formatCountdown(challenge.resendIn)}`
                    : challenge.expired
                      ? "إرسال رمز جديد"
                      : "إرسال رمز التحقق"}
                </Btn>
              </div>

              {(challenge.active || challenge.expired) && (
                <div className="flex flex-wrap items-end gap-3">
                  <label className="grid gap-1.5">
                    <span className="text-sm font-medium">رمز التحقق</span>
                    <input
                      value={code}
                      onChange={(e) =>
                        setCode(
                          e.target.value.replace(/\D/g, "").slice(0, config.data?.codeLength ?? 6),
                        )
                      }
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      dir="ltr"
                      disabled={challenge.expired}
                      className={inputCls + " max-w-[180px] text-center font-mono tracking-[0.4em]"}
                    />
                  </label>
                  <Btn
                    onClick={() => confirm.mutate()}
                    loading={confirm.isPending}
                    disabled={challenge.expired || code.length < (config.data?.codeLength ?? 6)}
                  >
                    توثيق الرقم
                  </Btn>
                </div>
              )}

              {challenge.active && (
                <p role="status" className="text-[12px] text-text-muted">
                  الرمز صالح لمدة {formatCountdown(challenge.secondsLeft)}
                  {challenge.attemptsLeft !== null
                    ? ` — محاولات متبقية: ${challenge.attemptsLeft}`
                    : ""}
                </p>
              )}
              {challenge.expired && (
                <p role="alert" className="text-[12px] text-warning">
                  انتهت صلاحية الرمز. اطلب رمزاً جديداً لإكمال التوثيق.
                </p>
              )}
            </div>
          )}

          <div className="rounded-[var(--radius-m)] border border-border bg-surface-muted/50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
                <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
                التحقق بخطوتين عبر الرسائل — اختياري
              </span>
              <Btn
                variant={smsMfaOn ? "outline" : "secondary"}
                onClick={() => smsMfa.mutate(!smsMfaOn)}
                loading={smsMfa.isPending}
                disabled={!verified && !smsMfaOn}
              >
                {smsMfaOn ? "إلغاء التفعيل" : "تفعيل"}
              </Btn>
            </div>
            <p className="mt-1.5 text-[12px] leading-5 text-text-muted">
              {verified
                ? `الحالة الحالية: ${MFA_STATUS_LABELS[mfaStatus]}.`
                : "وثّق رقم جوالك أولاً لتتمكن من تفعيل التحقق بخطوتين عبر الرسائل."}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
