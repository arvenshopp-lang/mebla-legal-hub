/**
 * تبويب الأمان في إعدادات المستخدم:
 *  - التحقق بخطوتين (TOTP)
 *  - حالة تشفير البيانات الحساسة
 *  - سجل كشف البيانات الحساسة (لمالك المكتب والمدير)
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyRound, ShieldCheck, ShieldAlert, Trash2, Mail, LockKeyhole } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Btn, LoadingBlock, inputCls, ConfirmDialog, Badge } from "@/lib/list-utils";
import { fmtDateTime } from "@/lib/enums";
import { PII_FIELD_LABEL, type PiiField } from "@/lib/crypto/pii.shared";
import { PasswordInput } from "@/components/password-input";
import { PasswordChecklist } from "@/components/password-checklist";
import { usePasswordStrength } from "@/hooks/use-password-strength";
import { useAuth } from "@/hooks/use-auth";
import {
  changeAccountEmail,
  changeAccountPassword,
  requestReauthenticationCode,
} from "@/lib/auth-actions";
import {
  confirmTotpEnrollment,
  listMfaFactors,
  removeMfaFactor,
  startTotpEnrollment,
} from "@/lib/mfa";
import {
  MFA_OPTIONAL_HEADLINE,
  MFA_OPTIONAL_INVITE,
  MFA_OPTIONAL_NOTE,
} from "@/lib/security/security-policy";
import { PhoneVerificationCard } from "./phone-card";

export function SecurityTab({ orgId, isOrgAdmin }: { orgId: string | null; isOrgAdmin: boolean }) {
  return (
    <div className="max-w-3xl space-y-6">
      <AccountEmailCard />
      <AccountPasswordCard />
      <PhoneVerificationCard />
      <MfaCard />
      <EncryptionCard />
      {isOrgAdmin && orgId && <PiiAccessLogCard orgId={orgId} />}
    </div>
  );
}

function AccountEmailCard() {
  const { user, profile } = useAuth();
  const currentEmail = user?.email ?? profile?.email ?? "";
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const submit = async () => {
    if (busy || !valid) return;
    setBusy(true);
    const result = await changeAccountEmail(email);
    setBusy(false);
    if (!result.ok) return toast.error(result.message);
    setSentTo(email.trim().toLowerCase());
    setEmail("");
    toast.success(result.message);
  };

  return (
    <Card title="بريد الحساب" icon={<Mail className="h-4 w-4 text-primary" />}>
      <p className="mb-4 text-[12.5px] leading-6 text-text-muted">
        بريدك الحالي: <span dir="ltr" className="font-medium text-foreground">{currentEmail || "—"}</span>
        {" "}— لن يتغيّر بريد الدخول قبل فتح رابط التأكيد المُرسل إلى البريد الجديد.
      </p>
      {sentTo && (
        <div role="status" className="mb-4 rounded-[var(--radius-m)] border border-success/25 bg-success-soft p-3 text-[12.5px] leading-6 text-success">
          أرسلنا رسالة تأكيد إلى <span dir="ltr">{sentTo}</span>. أكمل التأكيد من نفس المتصفح لإتمام التغيير.
        </div>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid flex-1 gap-1.5">
          <span className="text-sm font-medium">البريد الإلكتروني الجديد</span>
          <input
            type="email"
            autoComplete="email"
            dir="ltr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputCls}
          />
        </label>
        <Btn onClick={submit} loading={busy} disabled={!valid}>
          إرسال رابط التأكيد
        </Btn>
      </div>
    </Card>
  );
}

function AccountPasswordCard() {
  const { profile, user } = useAuth();
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState(false);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [codeSent, setCodeSent] = useState(false);

  const strength = usePasswordStrength(password, {
    name: profile?.full_name ?? "",
    email: user?.email ?? "",
  });
  const matches = password.length > 0 && password === confirm;

  const requestCode = async () => {
    if (sending) return;
    setSending(true);
    const result = await requestReauthenticationCode();
    setSending(false);
    if (!result.ok) return toast.error(result.message);
    setCodeSent(true);
    toast.success(result.message);
  };

  const submit = async () => {
    if (saving) return;
    setTouched(true);
    if (!strength.acceptable) {
      toast.error(strength.reason ?? "يرجى استيفاء جميع شروط كلمة المرور");
      return;
    }
    if (!matches) {
      toast.error("كلمتا المرور غير متطابقتين");
      return;
    }
    setSaving(true);
    const result = await changeAccountPassword(password, code);
    setSaving(false);
    if (!result.ok) return toast.error(result.message);
    setPassword("");
    setConfirm("");
    setCode("");
    setCodeSent(false);
    setTouched(false);
    toast.success(result.message);
  };

  return (
    <Card title="كلمة المرور" icon={<LockKeyhole className="h-4 w-4 text-primary" />}>
      <p className="mb-4 text-[12.5px] leading-6 text-text-muted">
        لحماية حسابك، نطلب رمز تحقق يُرسل إلى بريدك قبل تغيير كلمة المرور.
      </p>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1.5">
            <span className="text-sm font-medium">رمز التحقق من البريد</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
              inputMode="numeric"
              autoComplete="one-time-code"
              dir="ltr"
              className={inputCls + " max-w-[180px] text-center font-mono tracking-[0.35em]"}
            />
          </label>
          <Btn variant="outline" onClick={requestCode} loading={sending}>
            {codeSent ? "إعادة إرسال الرمز" : "إرسال الرمز"}
          </Btn>
        </div>
        <label className="grid gap-1.5">
          <span className="text-sm font-medium">كلمة المرور الجديدة</span>
          <PasswordInput
            value={password}
            onChange={(value) => setPassword(value)}
            onBlur={() => setTouched(true)}
            autoComplete="new-password"
          />
        </label>
        {(touched || password.length > 0) && <PasswordChecklist strength={strength} />}
        <label className="grid gap-1.5">
          <span className="text-sm font-medium">تأكيد كلمة المرور</span>
          <PasswordInput
            value={confirm}
            onChange={(value) => setConfirm(value)}
            autoComplete="new-password"
          />
        </label>
        <div className="flex justify-end">
          <Btn onClick={submit} loading={saving} disabled={code.length < 6 || !password || !confirm}>
            تحديث كلمة المرور
          </Btn>
        </div>
      </div>
    </Card>
  );
}

function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-[var(--radius-l)] border border-border bg-surface p-6">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-bold">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function MfaCard() {
  const qc = useQueryClient();
  const [enroll, setEnroll] = useState<{ factorId: string; qrSvg: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);

  const { data: factors, isLoading } = useQuery({
    queryKey: ["mfa-factors"],
    queryFn: listMfaFactors,
  });

  const begin = useMutation({
    mutationFn: startTotpEnrollment,
    onSuccess: (data) => { setEnroll(data); setCode(""); },
    onError: (e: Error) => toast.error("تعذّر التفعيل", { description: e.message }),
  });

  const confirm = useMutation({
    mutationFn: async () => {
      if (!enroll) throw new Error("لا توجد عملية تفعيل جارية.");
      await confirmTotpEnrollment(enroll.factorId, code);
    },
    onSuccess: () => {
      toast.success("تم تفعيل التحقق بخطوتين");
      setEnroll(null);
      setCode("");
      qc.invalidateQueries({ queryKey: ["mfa-factors"] });
    },
    onError: (e: Error) => toast.error("رمز غير صحيح", { description: e.message }),
  });

  const remove = useMutation({
    mutationFn: (factorId: string) => removeMfaFactor(factorId),
    onSuccess: () => {
      toast.success("تم إلغاء التحقق بخطوتين");
      setRemoving(null);
      qc.invalidateQueries({ queryKey: ["mfa-factors"] });
    },
    onError: (e: Error) => toast.error("تعذّر الإلغاء", { description: e.message }),
  });

  const verified = (factors ?? []).filter((f) => f.status === "verified");

  return (
    <Card title={MFA_OPTIONAL_HEADLINE} icon={<KeyRound className="h-4 w-4 text-primary" />}>
      <p className="mb-4 text-[12.5px] leading-6 text-text-muted">{MFA_OPTIONAL_NOTE}</p>
      {isLoading ? (
        <LoadingBlock />
      ) : verified.length ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-success">
            <ShieldCheck className="h-4 w-4" aria-hidden />
            حسابك محمي بتطبيق مصادقة.
          </div>
          {verified.map((f) => (
            <div key={f.id} className="flex items-center justify-between rounded-[var(--radius-m)] border border-border bg-surface-muted/50 px-3 py-2">
              <span className="text-sm">
                {f.friendly_name || "تطبيق مصادقة"}
                <span className="ms-2 text-xs text-text-muted">مُفعَّل {fmtDateTime(f.created_at)}</span>
              </span>
              <button
                type="button"
                onClick={() => setRemoving(f.id)}
                aria-label="إلغاء التحقق بخطوتين"
                className="rounded-md p-1.5 text-danger hover:bg-danger/10"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      ) : enroll ? (
        <div className="space-y-4">
          <p className="text-sm text-text-muted">
            امسح رمز QR بتطبيق مصادقة (Google Authenticator أو Microsoft Authenticator)، ثم أدخل الرمز المكوّن من ستة أرقام.
          </p>
          <img
            src={qrImageSrc(enroll.qrSvg)}
            alt="رمز تفعيل التحقق بخطوتين"
            className="w-44 rounded-[var(--radius-m)] border border-border bg-white p-2"
          />
          <p className="text-xs text-text-muted">
            أو أدخل المفتاح يدوياً: <span className="font-mono" dir="ltr">{enroll.secret}</span>
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1.5">
              <span className="text-sm font-medium">رمز التحقق</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                dir="ltr"
                className={inputCls + " max-w-[160px] text-center font-mono tracking-[0.4em]"}
              />
            </label>
            <Btn onClick={() => confirm.mutate()} loading={confirm.isPending} disabled={code.length !== 6}>
              تأكيد التفعيل
            </Btn>
            <Btn variant="outline" onClick={() => setEnroll(null)} disabled={confirm.isPending}>
              إلغاء
            </Btn>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-start gap-2 text-sm text-text-muted">
            <ShieldAlert className="mt-0.5 h-4 w-4 text-primary" aria-hidden />
            <p>
              {MFA_OPTIONAL_INVITE} — يُطلب الرمز عند تسجيل الدخول فقط، ولا يؤثر على وصولك إلى القضايا
              أو المستندات أو أي عملية تسمح بها صلاحيات دورك.
            </p>
          </div>
          <Btn onClick={() => begin.mutate()} loading={begin.isPending}>تفعيل التحقق بخطوتين</Btn>
        </div>
      )}

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing)}
        loading={remove.isPending}
        title="إلغاء التحقق بخطوتين"
        confirmLabel="إلغاء التحقق"
        message="سيصبح حسابك محمياً بكلمة المرور فقط، وتبقى جميع صلاحياتك على المنصة كما هي. هل ترغب في المتابعة؟"
      />
    </Card>
  );
}

/** رمز QR يصل من خدمة المصادقة إما كـ SVG نصي أو كـ data URI. */
function qrImageSrc(qr: string): string {
  if (qr.trim().startsWith("<svg")) {
    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(qr)))}`;
  }
  return qr;
}

function EncryptionCard() {
  return (
    <Card title="تشفير البيانات الحساسة" icon={<ShieldCheck className="h-4 w-4 text-primary" />}>
      <ul className="space-y-2 text-sm text-text-muted">
        <li>• أرقام الهوية والسجل التجاري تُشفَّر بمعيار AES-256-GCM قبل كتابتها في قاعدة البيانات.</li>
        <li>• لكل مكتب مفتاح مشتق مستقل، فلا يمكن قراءة بيانات مكتب بمفتاح مكتب آخر.</li>
        <li>• البحث بالرقم يتم عبر بصمة حتمية غير قابلة للعكس، دون تخزين الرقم صريحاً.</li>
        <li>• كل عملية كشف لرقم حساس تُسجَّل باسم المستخدم والوقت في سجل غير قابل للتعديل.</li>
        <li>• المستندات تُخزَّن في مستودع خاص ولا تُسلَّم إلا بروابط مؤقتة موقّعة مع علامة مائية.</li>
      </ul>
    </Card>
  );
}

function PiiAccessLogCard({ orgId }: { orgId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["pii-access-logs", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pii_access_logs")
        .select("id, created_at, entity_type, field, user_id, reason")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: names } = useQuery({
    queryKey: ["org-member-names", orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from("organization_members")
        .select("user_id, profiles(full_name)")
        .eq("organization_id", orgId);
      const map: Record<string, string> = {};
      for (const row of data ?? []) {
        const profile = row.profiles as { full_name?: string } | null;
        if (row.user_id) map[row.user_id as string] = profile?.full_name ?? "مستخدم";
      }
      return map;
    },
  });

  return (
    <Card title="سجل كشف البيانات الحساسة" icon={<ShieldCheck className="h-4 w-4 text-primary" />}>
      {isLoading ? (
        <LoadingBlock />
      ) : !data?.length ? (
        <p className="py-4 text-center text-xs text-text-muted">لا توجد عمليات كشف مسجّلة بعد.</p>
      ) : (
        <div className="divide-y divide-border">
          {data.map((row) => (
            <div key={row.id as string} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
              <span className="font-medium">{names?.[row.user_id as string] ?? "مستخدم"}</span>
              <Badge>{PII_FIELD_LABEL[row.field as PiiField] ?? (row.field as string)}</Badge>
              <span className="text-xs text-text-muted">{row.entity_type as string}</span>
              <span className="text-xs text-text-muted">{fmtDateTime(row.created_at as string)}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}