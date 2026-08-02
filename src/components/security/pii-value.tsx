/**
 * عرض وتحرير الحقول الحساسة المشفّرة (رقم الهوية / السجل التجاري).
 * القيمة الصريحة لا تصل المتصفح إلا بطلب كشف صريح يُسجَّل في سجل التدقيق.
 */
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Eye, Lock, ShieldAlert, ShieldCheck } from "lucide-react";
import { getMaskedPii, revealPii } from "@/lib/pii.functions";
import { PII_FIELD_LABEL, type PiiField } from "@/lib/crypto/pii.shared";
import { inputCls, Modal } from "@/lib/list-utils";
import { PII_REVEAL_LIMITS, isMfaRequiredError } from "@/lib/security/security-policy";

type Entity = "client" | "case_party";

export function useMaskedPii(organizationId: string | null | undefined, entity: Entity, entityId?: string | null) {
  const fetchMasked = useServerFn(getMaskedPii);
  return useQuery({
    queryKey: ["pii-mask", entity, entityId, organizationId],
    enabled: Boolean(organizationId && entityId),
    staleTime: 60_000,
    queryFn: async () => {
      const res = await fetchMasked({
        data: { organizationId: organizationId!, entity, ids: [entityId!] },
      });
      return res[entityId!] ?? { national_id: "—", commercial_registration: "—" };
    },
  });
}

/**
 * عرض للقراءة فقط مع كشف مُدقَّق: يطلب سبباً إلزامياً قبل الطلب، ثم يُظهر القيمة
 * في الذاكرة فقط ويخفيها تلقائياً — لا تُخزَّن في المتصفح ولا في الرابط.
 */
export function PiiReveal({
  organizationId,
  entity,
  entityId,
  field,
  mask,
  canReveal = true,
}: {
  organizationId: string;
  entity: Entity;
  entityId: string;
  field: PiiField;
  mask: string;
  canReveal?: boolean;
}) {
  const reveal = useServerFn(revealPii);
  const [value, setValue] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
    },
    [],
  );

  const startAutoHide = () => {
    setSecondsLeft(PII_REVEAL_LIMITS.autoHideSeconds);
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          if (timer.current) clearInterval(timer.current);
          setValue(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const onReveal = async () => {
    if (reason.trim().length < PII_REVEAL_LIMITS.minReasonLength) {
      toast.error("سبب الكشف إلزامي", {
        description: `اكتب سبباً واضحاً (${PII_REVEAL_LIMITS.minReasonLength} أحرف على الأقل) — يُسجَّل في سجل التدقيق.`,
      });
      return;
    }
    setLoading(true);
    try {
      const res = await reveal({
        data: { organizationId, entity, entityId, field, reason: reason.trim() },
      });
      setValue(res.value);
      setAskOpen(false);
      setReason("");
      startAutoHide();
      toast.success("تم الكشف وتسجيل العملية في سجل التدقيق");
    } catch (error) {
      if (isMfaRequiredError(error)) {
        toast.error("مطلوب تحقق بخطوتين", {
          description: "فعّل التحقق بخطوتين من الإعدادات ← الأمان ثم أعد المحاولة.",
        });
      } else {
        toast.error("تعذّر الكشف", {
          description: error instanceof Error ? error.message : undefined,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  if (mask === "—") return <span className="text-text-muted">—</span>;

  return (
    <>
      <span className="inline-flex items-center gap-2 font-mono text-sm" dir="ltr">
        {value ?? mask}
        {value && (
          <span className="text-[11px] text-text-muted" dir="rtl">
            يُخفى بعد {secondsLeft} ثانية
          </span>
        )}
        {!value && canReveal && (
          <button
            type="button"
            onClick={() => setAskOpen(true)}
            aria-label={`كشف ${PII_FIELD_LABEL[field]}`}
            title={`كشف ${PII_FIELD_LABEL[field]} — يتطلب سبباً وتحققاً بخطوتين`}
            className="rounded-md p-1 text-text-muted transition hover:bg-surface-muted hover:text-foreground"
          >
            <Eye className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </span>

      <Modal
        open={askOpen}
        onClose={() => setAskOpen(false)}
        title={`كشف ${PII_FIELD_LABEL[field]}`}
        description="عملية حساسة: تتطلب تحققاً بخطوتين وسبباً يُسجَّل باسمك في سجل التدقيق."
        size="md"
      >
        <div className="grid gap-3">
          <label className="grid gap-1.5 text-sm font-medium">
            سبب الكشف
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={300}
              placeholder="مثال: التحقق من هوية الموكل قبل تقديم مذكرة الدفاع"
              className={inputCls}
            />
          </label>
          <p className="flex items-start gap-2 rounded-[var(--radius-m)] bg-surface-muted/60 p-3 text-[12px] text-muted-foreground">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
            تُخفى القيمة تلقائياً بعد {PII_REVEAL_LIMITS.autoHideSeconds} ثانية، ولا تُحفظ في المتصفح، وعدد
            عمليات الكشف محدود لكل مستخدم.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAskOpen(false)}
              className="h-10 rounded-[var(--radius-m)] border border-border px-4 text-sm font-medium"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={onReveal}
              disabled={loading}
              className="h-10 rounded-[var(--radius-m)] bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {loading ? "جارٍ الكشف…" : "كشف وتسجيل"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

/**
 * مدخل حقل حساس داخل النماذج: يعرض القناع فقط، ولا يُرسل قيمة جديدة
 * إلا إذا اختار المستخدم التعديل — فلا يُمحى الرقم المحفوظ بالخطأ.
 */
export function PiiSecureInput({
  label,
  mask,
  value,
  editing,
  onChange,
  onStartEdit,
  onCancelEdit,
}: {
  label: string;
  mask: string;
  value: string;
  /** true عندما يكون الحقل في وضع الإدخال */
  editing: boolean;
  onChange: (next: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
}) {
  return (
    <div className="grid gap-1.5">
      <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        {label}
        <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden />
      </label>
      {editing ? (
        <>
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            inputMode="numeric"
            autoComplete="off"
            className={inputCls}
            dir="ltr"
          />
          {mask !== "—" && (
            <button type="button" onClick={onCancelEdit} className="w-fit text-xs text-text-muted underline">
              إلغاء التعديل والإبقاء على القيمة المحفوظة
            </button>
          )}
        </>
      ) : (
        <div className="flex items-center justify-between gap-2 rounded-[var(--radius-m)] border border-border bg-surface-muted/50 px-3 py-2">
          <span className="flex items-center gap-2 font-mono text-sm" dir="ltr">
            <Lock className="h-3.5 w-3.5 text-text-muted" aria-hidden />
            {mask}
          </span>
          <button type="button" onClick={onStartEdit} className="text-xs font-medium text-primary underline">
            {mask === "—" ? "إضافة" : "تعديل"}
          </button>
        </div>
      )}
      <p className="text-[11px] text-text-muted">
        مشفّر داخل قاعدة البيانات (AES-256-GCM) ولا يظهر إلا بكشف مُدقَّق.
      </p>
    </div>
  );
}