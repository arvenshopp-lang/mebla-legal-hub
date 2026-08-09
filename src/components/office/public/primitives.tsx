/** عناصر بصرية مشتركة للصفحة العامة — عرض فقط، بلا أي جلب بيانات. */
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function Section({
  id,
  titleId,
  title,
  description,
  icon: Icon,
  alt,
  children,
}: {
  id?: string;
  titleId: string;
  title: string;
  description?: string;
  icon?: LucideIcon;
  alt?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={titleId}
      className={cn("office-section scroll-mt-6", alt && "bg-surface-muted")}
    >
      <div className="office-container">
        <div className="mb-6 flex items-center gap-3">
          {Icon && (
            <span
              aria-hidden="true"
              className="grid size-10 shrink-0 place-items-center rounded-[var(--office-radius-sm)] bg-primary/8 text-primary"
            >
              <Icon size={18} strokeWidth={1.75} />
            </span>
          )}
          <div className="min-w-0">
            <h2 id={titleId} className="text-h2 break-words">
              {title}
            </h2>
            {description && (
              <p className="mt-1 text-body-sm text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        {children}
      </div>
    </section>
  );
}

export function SurfaceCard({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("office-card p-5 shadow-xs sm:p-6", className)}>{children}</div>
  );
}

export function ContactRow({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-border/70 py-3 last:border-0">
      <span
        aria-hidden="true"
        className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-[var(--office-radius-sm)] bg-surface-muted text-primary"
      >
        <Icon size={16} strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <dt className="text-caption">{label}</dt>
        <dd className="mt-0.5 text-body-sm break-words">{children}</dd>
      </div>
    </div>
  );
}

export function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-surface-muted px-2.5 py-1 text-caption text-foreground">
      {children}
    </span>
  );
}
