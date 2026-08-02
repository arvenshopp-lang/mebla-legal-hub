/**
 * عرض وتحرير الحقول الحساسة المشفّرة (رقم الهوية / السجل التجاري).
 * القيمة الصريحة لا تصل المتصفح إلا بطلب كشف صريح يُسجَّل في سجل التدقيق.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Eye, Lock, ShieldCheck } from "lucide-react";
import { getMaskedPii, revealPii } from "@/lib/pii.functions";
import { PII_FIELD_LABEL, type PiiField } from "@/lib/crypto/pii.shared";
import { inputCls } from "@/lib/list-utils";

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

/** عرض للقراءة فقط مع زر كشف مُدقَّق. */
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

  if (mask === "—") return <span className="text-text-muted">—</span>;

  const onReveal = async () => {
    setLoading(true);
    try {
      const res = await reveal({ data: { organizationId, entity, entityId, field } });
      setValue(res.value);
      toast.success("تم الكشف وتسجيل العملية في سجل التدقيق");
    } catch (error) {
      toast.error("تعذّر الكشف", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-2 font-mono text-sm" dir="ltr">
      {value ?? mask}
      {!value && canReveal && (
        <button
          type="button"
          onClick={onReveal}
          disabled={loading}
          aria-label={`كشف ${PII_FIELD_LABEL[field]}`}
          title={`كشف ${PII_FIELD_LABEL[field]} — تُسجَّل العملية`}
          className="rounded-md p-1 text-text-muted transition hover:bg-surface-muted hover:text-foreground disabled:opacity-50"
        >
          <Eye className="h-3.5 w-3.5" />
        </button>
      )}
    </span>
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