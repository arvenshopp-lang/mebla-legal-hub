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
  requestPhoneCode,
  setSmsMfa,
} from "@/lib/sms/sms.functions";
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
  const [sent, setSent] = useState(false);

  const config = useQuery({ queryKey: ["sms-public-config"], queryFn: () => getSmsPublicConfig() });
  const status = useQuery({ queryKey: ["my-phone-status"], queryFn: () => getMyPhoneStatus() });

  const request = useMutation({
    mutationFn: async () => {
      const parsed = normalizePhone(phone, config.data?.defaultDialCode ?? "+966");
      if (!parsed.ok) throw new Error(parsed.message);
      return requestPhoneCode({ data: { phone: parsed.e164, purpose: "phone_verification" } });
    },
    onSuccess: (result) => {
      setSent(true);
      setCode("");
      toast.success("تم إرسال رمز التحقق", {
        description: result.testMode
          ? "الخدمة في وضع الاختبار — تواصل مع الدعم للحصول على الرمز."
          : `الرمز صالح حتى ${fmtDateTime(result.expiresAt)}.`,
      });
    },
    onError: (e: Error) => toast.error("تعذّر الإرسال", { description: e.message }),
  });

  const confirm = useMutation({
    mutationFn: async () => {
      const parsed = normalizePhone(phone, config.data?.defaultDialCode ?? "+966");
      if (!parsed.ok) throw new Error(parsed.message);
      return confirmMyPhone({ data: { phone: parsed.e164, code } });
    },
    onSuccess: () => {
      toast.success(SMS_MESSAGES.verified);
      setSent(false);
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
              <span className="text-[12px] text-text-muted">وثّق في {fmtDateTime(status.data.verifiedAt)}</span>
            )}
          </div>

          <p className="text-[12.5px] leading-6 text-text-muted">
            توثيق رقم الجوال منفصل تماماً عن التحقق بخطوتين، وكلاهما اختياري ولا يؤثر على صلاحياتك أو وصولك
            إلى بيانات المكتب.
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
                  onClick={() => request.mutate()}
                  loading={request.isPending}
                  disabled={phone.trim().length < 8}
                >
                  {sent ? "إعادة إرسال الرمز" : "إرسال رمز التحقق"}
                </Btn>
              </div>

              {sent && (
                <div className="flex flex-wrap items-end gap-3">
                  <label className="grid gap-1.5">
                    <span className="text-sm font-medium">رمز التحقق</span>
                    <input
                      value={code}
                      onChange={(e) =>
                        setCode(e.target.value.replace(/\D/g, "").slice(0, config.data?.codeLength ?? 6))
                      }
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      dir="ltr"
                      className={inputCls + " max-w-[180px] text-center font-mono tracking-[0.4em]"}
                    />
                  </label>
                  <Btn
                    onClick={() => confirm.mutate()}
                    loading={confirm.isPending}
                    disabled={code.length < (config.data?.codeLength ?? 6)}
                  >
                    توثيق الرقم
                  </Btn>
                </div>
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