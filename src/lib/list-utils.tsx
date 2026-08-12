/**
 * MEHLA UI Kit — مكونات الواجهة المشتركة.
 * كل الصفحات الداخلية تستهلك هذه المكونات لضمان اتساق الأزرار والنماذج
 * والجداول والحالات (تحميل / فارغ / خطأ) عبر المنصة.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Loader2, Search, Plus, SlidersHorizontal, X } from "lucide-react";
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
  primary:
    "bg-primary text-primary-foreground shadow-xs hover:bg-primary-hover active:bg-primary-active",
  secondary: "bg-primary-soft text-primary hover:bg-primary-soft/70 active:bg-primary-soft",
  tertiary: "bg-surface-muted text-foreground hover:bg-border/60",
  outline:
    "border border-border bg-surface text-foreground hover:bg-surface-muted hover:border-border-strong",
  ghost: "bg-transparent text-foreground hover:bg-surface-muted",
  danger: "bg-danger text-primary-foreground hover:brightness-95 active:brightness-90",
  link: "bg-transparent px-0 text-primary underline underline-offset-4 hover:text-primary-hover",
};

const BTN_SIZES: Record<BtnSize, string> = {
  // على الجوال يرتفع الزر الصغير إلى 44px لتحقيق الحد الأدنى لهدف اللمس،
  // ويعود إلى مقاسه المضغوط على الشاشات الأكبر حيث المؤشر دقيق.
  sm: "h-11 px-3 text-[13px] md:h-9",
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
        {/* لا نقصّ العنوان العربي: يلتف على سطرين كحد أقصى بدل ellipsis */}
        <h2 className="text-h3 line-clamp-2 break-words text-balance">{title}</h2>
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
  density,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** كثافة الحشو داخل البطاقة */
  density?: "comfortable" | "compact";
}) {
  return (
    <section
      className={cn(
        "surface-card overflow-hidden",
        density === "compact" ? "density-compact" : "density-comfortable",
        className,
      )}
    >
      {(title || actions) && (
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-[var(--density-pad-x,1.25rem)] py-3.5">
          <div className="min-w-0">
            {title && <h3 className="text-h4 min-w-0 break-words">{title}</h3>}
            {description && <p className="text-caption mt-0.5">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="px-[var(--density-pad-x,1.25rem)] py-[var(--density-pad-y,1.25rem)]">
        {children}
      </div>
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
  activeFilters = 0,
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
  /** عدد الفلاتر المطبّقة — يظهر على زر «الفلاتر» في الجوال */
  activeFilters?: number;
}) {
  const id = useId();
  const [filtersOpen, setFiltersOpen] = useState(false);
  return (
    <div className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 md:flex md:flex-wrap">
      <div className="relative col-span-2 min-w-0 md:min-w-[200px] md:flex-1">
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

      {/* الفلاتر: مضمّنة على سطح المكتب، وورقة سفلية على الجوال */}
      {filters && (
        <>
          <div className="hidden flex-wrap items-center gap-2.5 md:flex">{filters}</div>
          <Btn variant="outline" className="md:hidden" onClick={() => setFiltersOpen(true)}>
            <SlidersHorizontal className="h-4 w-4" aria-hidden /> الفلاتر
            {activeFilters > 0 && (
              <span className="ms-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                {activeFilters}
              </span>
            )}
          </Btn>
        </>
      )}

      {onAdd && canAdd && (
        <Btn onClick={onAdd} className={filters ? "" : "col-start-2"}>
          <Plus className="h-4 w-4" aria-hidden /> {addLabel ?? "إضافة"}
        </Btn>
      )}

      {filters && (
        <Modal
          open={filtersOpen}
          onClose={() => setFiltersOpen(false)}
          title="الفلاتر"
          description="حدّد الفلاتر ثم أغلق الورقة لعرض النتائج."
        >
          <div className="grid gap-4 [&_input]:w-full [&_select]:w-full [&_select]:max-w-none">
            {filters}
          </div>
          <div className="mt-6">
            <Btn className="w-full" onClick={() => setFiltersOpen(false)}>
              عرض النتائج
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- States */

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <svg
        width="56"
        height="56"
        viewBox="0 0 56 56"
        fill="none"
        aria-hidden
        className="mb-4 text-border-strong"
      >
        <rect
          x="10.5"
          y="6.5"
          width="35"
          height="43"
          rx="3"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path
          d="M18 18h20M18 26h20M18 34h12"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      <p className="text-h4">{title}</p>
      {hint && <p className="measure mt-1.5 text-body-sm text-muted-foreground">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** لبنة هيكل عظمي أساسية (Skeleton) — تحترم prefers-reduced-motion عبر animate-pulse. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-[var(--radius-s)] bg-surface-muted", className)}
    />
  );
}

/** أسطر نصية هيكلية بعرض متدرّج. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)} aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn("h-3.5", i === lines - 1 ? "w-1/2" : i % 2 ? "w-5/6" : "w-full")}
        />
      ))}
    </div>
  );
}

/** هيكل عظمي لجدول داخل بطاقة — يستخدم أثناء التحميل الأول للقوائم. */
export function LoadingBlock({ rows = 5, cols = 3 }: { rows?: number; cols?: number }) {
  return (
    <div
      className="surface-card divide-y divide-border"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
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
export function SectionLoader({
  label = "جاري التحميل…",
  rows = 3,
}: {
  label?: string;
  rows?: number;
}) {
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
      <div
        className={cn(
          "transition-opacity duration-[var(--duration-fast)]",
          busy && "pointer-events-none opacity-55",
        )}
      >
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
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center rounded-[var(--radius-s)] p-1.5",
        // هدف لمس 44px على الجوال، ومقاس مضغوط داخل الجداول على سطح المكتب.
        "min-h-11 min-w-11 md:min-h-0 md:min-w-0",
        "transition-colors duration-[var(--duration-fast)]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        "disabled:opacity-50",
        tone === "danger"
          ? "text-danger hover:bg-danger-soft"
          : "text-foreground hover:bg-surface-muted",
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

export function DataCard({
  children,
  density,
}: {
  children: ReactNode;
  density?: "comfortable" | "compact";
}) {
  return (
    <div
      className={cn(
        "surface-card overflow-hidden",
        density === "compact" ? "density-compact" : "density-comfortable",
      )}
    >
      {/* التمرير داخل الإطار فقط — ضمانة عدم وجود تمرير أفقي على مستوى الصفحة */}
      <div className="table-scroll">{children}</div>
    </div>
  );
}

export function Th({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={cn(
        "sticky top-0 z-1 whitespace-nowrap border-b border-border bg-surface-muted px-3.5 py-2.5 text-start text-[12px] font-semibold text-muted-foreground",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <td
      className={cn(
        "whitespace-nowrap px-3.5 py-[var(--density-row-y,0.875rem)] align-middle text-table",
        className,
      )}
    >
      {children}
    </td>
  );
}

/* -------------------------------------------------------------------- Modal */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  size = "md",
  busy = false,
  busyLabel = "جاري التحميل…",
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
  // نحتفظ بأحدث onClose داخل ref حتى لا يُعاد تشغيل التأثير عند كل إعادة رسم.
  // (كان تمرير دالة مضمّنة يعيد تنفيذ التأثير بعد كل حرف ويسحب التركيز من الحقل.)
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onEsc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // التركيز يُضبط مرة واحدة فقط عند الفتح، ولا يُعاد أثناء الكتابة.
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onEsc);
      document.body.style.overflow = prev;
    };
  }, [open]);

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
        <div
          className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border sm:hidden"
          aria-hidden
        />
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
        <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
          {children}
          {busy && (
            <div
              role="status"
              className="absolute inset-0 z-10 flex items-center justify-center bg-surface/70 backdrop-blur-[1px]"
            >
              <span className="inline-flex items-center gap-2 text-body-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                {busyLabel}
              </span>
            </div>
          )}
        </div>
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
  optional,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  error?: string;
  required?: boolean;
  /** يُظهر «(اختياري)» بجانب العنوان — لتمييز الحقول غير الإلزامية بوضوح. */
  optional?: boolean;
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
        {!required && optional && <span className="font-normal text-text-muted"> (اختياري)</span>}
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
    green: "bg-success-soft text-success ring-success/25",
    info: "bg-info-soft text-info ring-info/25",
    gold: "bg-warning-soft text-warning ring-warning/25",
    // الخطر والتحذير يُميّزان أيضاً بشكل النقطة (مربّعة) لا باللون وحده
    red: "bg-danger-soft text-danger ring-danger/25 before:rounded-[2px]",
    warn: "bg-warning-soft text-warning ring-warning/25 before:rounded-[2px]",
    muted: "bg-surface-muted text-muted-foreground ring-border before:opacity-60",
  }[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
        // نقطة دلالية إضافية: الحالة تُقرأ بالنص والشكل قبل اللون
        "before:h-1.5 before:w-1.5 before:shrink-0 before:rounded-full before:bg-current before:content-['']",
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
