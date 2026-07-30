/**
 * MEHLA UI Kit — مكونات الواجهة المشتركة.
 * كل الصفحات الداخلية تستهلك هذه المكونات لضمان اتساق الأزرار والنماذج
 * والجداول والحالات (تحميل / فارغ / خطأ) عبر المنصة.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Loader2, Search, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ Buttons */

type BtnVariant = "primary" | "secondary" | "tertiary" | "ghost" | "outline" | "danger" | "link";
type BtnSize = "sm" | "md" | "lg" | "icon";

const BTN_BASE =
  "inline-flex select-none items-center justify-center gap-2 rounded-[var(--radius-m)] font-medium " +
  "transition-[background-color,color,border-color,box-shadow] duration-[var(--duration-fast)] ease-out " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring " +
  "disabled:pointer-events-none disabled:opacity-50";

const BTN_VARIANTS: Record<BtnVariant, string> = {
  primary: "bg-primary text-primary-foreground shadow-xs hover:bg-primary-hover active:bg-primary-active",
  secondary: "bg-primary-soft text-primary hover:bg-primary-soft/70 active:bg-primary-soft",
  tertiary: "bg-surface-muted text-foreground hover:bg-border/60",
  outline: "border border-border bg-surface text-foreground hover:bg-surface-muted hover:border-border-strong",
  ghost: "bg-transparent text-foreground hover:bg-surface-muted",
  danger: "bg-danger text-primary-foreground hover:brightness-95 active:brightness-90",
  link: "bg-transparent px-0 text-primary underline underline-offset-4 hover:text-primary-hover",
};

const BTN_SIZES: Record<BtnSize, string> = {
  sm: "h-9 px-3 text-[13px]",
  md: "h-11 px-4 text-sm",
  lg: "h-12 px-6 text-[15px]",
  icon: "h-11 w-11 p-0",
};

export function Btn({
  children,
  variant = "primary",
  size = "md",
  loading = false,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant;
  size?: BtnSize;
  loading?: boolean;
}) {
  return (
    <button
      type={props.type ?? "button"}
      {...props}
      disabled={props.disabled || loading}
      aria-busy={loading || undefined}
      className={cn(BTN_BASE, BTN_VARIANTS[variant], BTN_SIZES[size], className)}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------- Layout */

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:flex sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h2 className="text-h3 truncate">{title}</h2>
        {description && <p className="mt-1 text-body-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionCard({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("surface-card overflow-hidden", className)}>
      {(title || actions) && (
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            {title && <h3 className="text-h4 truncate">{title}</h3>}
            {description && <p className="text-caption mt-0.5">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ Toolbar */

export function PageToolbar({
  search,
  setSearch,
  onAdd,
  addLabel,
  filters,
  canAdd = true,
  placeholder = "بحث…",
  searching = false,
}: {
  search: string;
  setSearch: (v: string) => void;
  onAdd?: () => void;
  addLabel?: string;
  filters?: ReactNode;
  canAdd?: boolean;
  placeholder?: string;
  /** يعرض مؤشراً داخل حقل البحث أثناء جلب النتائج */
  searching?: boolean;
}) {
  const id = useId();
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2.5">
      <div className="relative min-w-[200px] flex-1">
        <label htmlFor={id} className="sr-only">
          بحث
        </label>
        <Search
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
          aria-hidden
        />
        <input
          id={id}
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={placeholder}
          className={cn(inputCls, "h-11 pr-10", searching && "pl-10")}
        />
        {searching && (
          <span
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            role="status"
          >
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            <span className="sr-only">جاري البحث…</span>
          </span>
        )}
      </div>
      {filters}
      {onAdd && canAdd && (
        <Btn onClick={onAdd}>
          <Plus className="h-4 w-4" aria-hidden /> {addLabel ?? "إضافة"}
        </Btn>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- States */

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden className="mb-4 text-border-strong">
        <rect x="10.5" y="6.5" width="35" height="43" rx="3" stroke="currentColor" strokeWidth="1.5" />
        <path d="M18 18h20M18 26h20M18 34h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <p className="text-h4">{title}</p>
      {hint && <p className="measure mt-1.5 text-body-sm text-muted-foreground">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** لبنة هيكل عظمي أساسية (Skeleton) — تحترم prefers-reduced-motion عبر animate-pulse. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-[var(--radius-s)] bg-surface-muted", className)} />;
}

/** أسطر نصية هيكلية بعرض متدرّج. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)} aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn("h-3.5", i === lines - 1 ? "w-1/2" : i % 2 ? "w-5/6" : "w-full")} />
      ))}
    </div>
  );
}

/** هيكل عظمي لجدول داخل بطاقة — يستخدم أثناء التحميل الأول للقوائم. */
export function LoadingBlock({ rows = 5, cols = 3 }: { rows?: number; cols?: number }) {
  return (
    <div className="surface-card divide-y divide-border" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">جاري التحميل…</span>
      <div className="flex items-center gap-4 bg-surface-muted/50 px-5 py-3.5">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className={cn("h-3", i === 0 ? "flex-1" : "hidden w-24 sm:block")} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-5 py-4">
          <Skeleton className="h-4 flex-1" />
          {Array.from({ length: Math.max(0, cols - 2) }).map((_, i) => (
            <Skeleton key={i} className="hidden h-4 w-24 sm:block" />
          ))}
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

/** هيكل عظمي لبطاقات الإحصاءات. */
export function StatsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" role="status" aria-busy="true">
      <span className="sr-only">جاري تحميل الإحصاءات…</span>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="surface-card p-5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-7 w-16" />
        </div>
      ))}
    </div>
  );
}

/** حالة تحميل لقسم داخلي (بطاقة/تبويب) مع نص وصفي. */
export function SectionLoader({ label = "جاري التحميل…", rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="py-2">
      <span className="sr-only">{label}</span>
      <SkeletonText lines={rows} />
    </div>
  );
}

/**
 * غلاف يعرض طبقة تحميل خفيفة فوق محتوى موجود (بحث/فلترة/ترقيم صفحات)
 * مع إبقاء البيانات السابقة ظاهرة لتفادي وميض التخطيط.
 */
export function BusyOverlay({
  busy,
  children,
  label = "جاري تحديث النتائج…",
}: {
  busy: boolean;
  children: ReactNode;
  label?: string;
}) {
  return (
    <div className="relative" aria-busy={busy || undefined}>
      <div className={cn("transition-opacity duration-[var(--duration-fast)]", busy && "pointer-events-none opacity-55")}>
        {children}
      </div>
      {busy && (
        <div className="absolute inset-0 z-10 flex items-start justify-center pt-10" role="status">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-1.5 text-[12px] font-medium text-muted-foreground shadow-sm">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            {label}
          </span>
        </div>
      )}
    </div>
  );
}

/** زر أيقونة بحالة تحميل — يستخدم لعمليات الصف (تحميل/حذف). */
export function IconBtn({
  loading = false,
  tone = "default",
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean; tone?: "default" | "danger" }) {
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "rounded-[var(--radius-s)] p-1.5 transition-colors duration-[var(--duration-fast)]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        "disabled:opacity-50",
        tone === "danger" ? "text-danger hover:bg-danger-soft" : "text-foreground hover:bg-surface-muted",
        className,
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : children}
    </button>
  );
}

export function ErrorBlock({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-[var(--radius-l)] border border-danger/25 bg-danger-soft px-5 py-4 text-body-sm text-danger"
    >
      تعذّر تحميل البيانات. {message}
    </div>
  );
}

/* -------------------------------------------------------------------- Table */

export function DataCard({ children }: { children: ReactNode }) {
  return (
    <div className="surface-card overflow-hidden">
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

export function Th({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={cn(
        "whitespace-nowrap border-b border-border bg-surface-muted/60 px-4 py-3 text-right text-[12px] font-semibold text-muted-foreground",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <td className={cn("whitespace-nowrap px-4 py-3.5 text-table", className)}>{children}</td>;
}

/* -------------------------------------------------------------------- Modal */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  size?: "md" | "lg";
  /** يعرض طبقة انتظار داخل النافذة أثناء جلب بياناتها أو حفظها */
  busy?: boolean;
  busyLabel?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onEsc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onEsc);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-end justify-center bg-foreground/40 backdrop-blur-[2px] sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
        className={cn(
          "flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[var(--radius-xl2)] bg-surface shadow-xl outline-none",
          "sm:max-h-[88dvh] sm:rounded-[var(--radius-l)]",
          size === "lg" ? "sm:max-w-3xl" : "sm:max-w-lg",
        )}
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border sm:hidden" aria-hidden />
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h3 id={titleId} className="text-h4 truncate">
              {title}
            </h3>
            {description && <p className="text-caption mt-0.5">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="-m-2 shrink-0 rounded-[var(--radius-s)] p-2 text-muted-foreground transition hover:bg-surface-muted hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">{children}</div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- Form */

export function FormField({
  label,
  children,
  hint,
  error,
  required,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  error?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-label mb-1.5 block text-foreground">
        {label}
        {required && (
          <span className="text-danger" aria-hidden>
            {" "}
            *
          </span>
        )}
      </span>
      {children}
      {hint && !error && <span className="text-caption mt-1 block">{hint}</span>}
      {error && (
        <span role="alert" className="mt-1 block text-[12px] text-danger">
          {error}
        </span>
      )}
    </label>
  );
}

export const inputCls =
  "w-full min-h-11 rounded-[var(--radius-m)] border border-border bg-surface px-3 py-2.5 text-sm text-foreground " +
  "placeholder:text-text-muted shadow-xs outline-none transition-colors duration-[var(--duration-fast)] " +
  "hover:border-border-strong focus:border-primary focus:ring-2 focus:ring-primary/15 " +
  "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted-foreground";

/* -------------------------------------------------------------------- Badge */

export function Badge({
  tone = "default",
  children,
}: {
  tone?: "default" | "green" | "gold" | "red" | "warn" | "muted" | "info";
  children: ReactNode;
}) {
  const t = {
    default: "bg-surface-muted text-foreground ring-border",
    green: "bg-success-soft text-success ring-success/20",
    info: "bg-info-soft text-info ring-info/20",
    gold: "bg-warning-soft text-warning ring-warning/20",
    red: "bg-danger-soft text-danger ring-danger/20",
    warn: "bg-warning-soft text-warning ring-warning/20",
    muted: "bg-surface-muted text-muted-foreground ring-border",
  }[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
        t,
      )}
    >
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------- Hooks */

export function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

/* ----------------------------------------------------------------- Dialogs */

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "تأكيد الحذف",
  danger = true,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-body-sm text-muted-foreground">{message}</p>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Btn variant="outline" onClick={onClose} disabled={loading}>
          إلغاء
        </Btn>
        <Btn variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={loading}>
          {confirmLabel}
        </Btn>
      </div>
    </Modal>
  );
}

/* --------------------------------------------------------------- Pagination */

export function Pagination({
  page,
  setPage,
  total,
  pageSize,
}: {
  page: number;
  setPage: (n: number) => void;
  total: number;
  pageSize: number;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav
      aria-label="تنقل بين الصفحات"
      className="mt-4 flex flex-wrap items-center justify-between gap-3 text-body-sm text-muted-foreground"
    >
      <div>
        الصفحة {page} من {pages} — الإجمالي {total}
      </div>
      <div className="flex gap-2">
        <Btn variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
          السابق
        </Btn>
        <Btn variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
          التالي
        </Btn>
      </div>
    </nav>
  );
}
