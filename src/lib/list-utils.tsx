import { useEffect, useState, type ReactNode } from "react";
import { Loader2, Search, Plus } from "lucide-react";

export function PageToolbar({
  search, setSearch, onAdd, addLabel, filters, canAdd = true,
}: {
  search: string; setSearch: (v: string) => void;
  onAdd?: () => void; addLabel?: string; filters?: ReactNode; canAdd?: boolean;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <div className="relative flex-1 min-w-[220px]">
        <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث…"
          className="w-full rounded-xl border border-border bg-surface px-10 py-2.5 text-sm outline-none focus:border-[#123C32]"
        />
      </div>
      {filters}
      {onAdd && canAdd && (
        <button
          onClick={onAdd}
          className="flex items-center gap-2 rounded-xl bg-[#123C32] px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
        >
          <Plus className="h-4 w-4" /> {addLabel ?? "إضافة"}
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface p-10 text-center">
      <div className="text-base font-semibold text-[#123C32]">{title}</div>
      {hint && <div className="mt-1 text-sm text-muted-foreground">{hint}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function LoadingBlock() {
  return (
    <div className="rounded-2xl border border-border bg-surface p-10 text-center text-muted-foreground">
      <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" /> جاري التحميل…
    </div>
  );
}

export function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-danger/25 bg-danger-soft p-6 text-center text-sm text-danger">
      حدث خطأ: {message}
    </div>
  );
}

export function DataCard({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto rounded-2xl border border-border bg-surface">{children}</div>;
}
export function Th({ children }: { children: ReactNode }) {
  return <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold text-muted-foreground">{children}</th>;
}
export function Td({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <td className={`whitespace-nowrap px-4 py-3 text-sm ${className}`}>{children}</td>;
}

export function Modal({
  open, onClose, title, children, size = "md",
}: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; size?: "md" | "lg";
}) {
  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={`flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-surface shadow-xl sm:max-h-[88dvh] sm:rounded-2xl ${size === "lg" ? "sm:max-w-3xl" : "sm:max-w-lg"}`}
        dir="rtl"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h3 className="min-w-0 truncate text-base font-bold text-[#123C32]">{title}</h3>
          <button type="button" onClick={onClose} className="shrink-0 text-muted-foreground hover:text-[#123C32]">✕</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">{children}</div>
      </div>
    </div>
  );
}

export function FormField({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-text-muted">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-[#123C32] outline-none focus:border-[#123C32]";

export function Btn({
  children, variant = "primary", size = "md", ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" | "outline"; size?: "sm" | "md" }) {
  const v = {
    primary: "bg-[#123C32] text-primary-foreground hover:bg-primary-hover",
    ghost: "bg-transparent text-[#123C32] hover:bg-[#F5F3EE]",
    outline: "border border-border bg-surface text-[#123C32] hover:bg-[#F5F3EE]",
    danger: "bg-[#7A2E20] text-primary-foreground hover:bg-[#5c221a]",
  }[variant];
  const s = size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm";
  return <button {...props} className={`rounded-xl ${v} ${s} font-medium disabled:opacity-60 ${props.className ?? ""}`}>{children}</button>;
}

export function Badge({ tone = "default", children }: { tone?: "default" | "green" | "gold" | "red" | "warn" | "muted"; children: ReactNode }) {
  const t = {
    default: "bg-[#F5F3EE] text-[#123C32]",
    green: "bg-primary-soft text-[#123C32]",
    gold: "bg-warning-soft text-warning",
    red: "bg-danger-soft text-danger",
    warn: "bg-warning-soft text-warning",
    muted: "bg-surface-muted text-muted-foreground",
  }[tone];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${t}`}>{children}</span>;
}

export function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export function ConfirmDialog({
  open, onClose, onConfirm, title, message, confirmLabel = "تأكيد الحذف", danger = true, loading,
}: {
  open: boolean; onClose: () => void; onConfirm: () => void;
  title: string; message: string; confirmLabel?: string; danger?: boolean; loading?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-sm text-muted-foreground">{message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Btn variant="outline" onClick={onClose} disabled={loading}>إلغاء</Btn>
        <Btn variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={loading}>
          {loading ? "جاري…" : confirmLabel}
        </Btn>
      </div>
    </Modal>
  );
}

export function Pagination({
  page, setPage, total, pageSize,
}: { page: number; setPage: (n: number) => void; total: number; pageSize: number }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
      <div>الصفحة {page} من {pages} — الإجمالي {total}</div>
      <div className="flex gap-2">
        <Btn variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>السابق</Btn>
        <Btn variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>التالي</Btn>
      </div>
    </div>
  );
}