import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/* ملاحظة: هذا المكوّن يعتمد أدوات المرحلة 1 في styles.css
   (table-mehla, table-scroll, cell-truncate, density-*) بدل أنماط محلية مكرّرة. */

/**
 * تعريف عمود واحد يُستخدم في العرضين معاً:
 * جدول على سطح المكتب، وبطاقة حقيقية على الجوال — بنفس دوال العرض دون تكرار منطق.
 */
export type Column<T> = {
  id: string;
  /** رأس العمود في الجدول (ويُستخدم كتسمية في بطاقة الجوال إن لم تُحدَّد mobileLabel) */
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** موضع العمود داخل بطاقة الجوال. الافتراضي meta */
  mobile?: "title" | "subtitle" | "meta" | "actions" | "hidden";
  /** تسمية مختصرة تظهر فوق القيمة في بطاقة الجوال */
  mobileLabel?: ReactNode;
  /** يجعل العمود يلتف على سطرين بدل قطع النص، للنصوص الطويلة */
  wrap?: boolean;
  className?: string;
  headerClassName?: string;
};

type DataViewProps<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** أصناف تلوين الصف/البطاقة (مثل تمييز المتأخر) */
  rowTone?: (row: T) => string | undefined;
  /** وصف الجدول لقارئ الشاشة */
  label: string;
  /** كثافة العرض: مريحة لمساحة المكتب، مضغوطة للأسطح الإدارية */
  density?: "comfortable" | "compact";
};

export function DataView<T>({
  columns,
  rows,
  rowKey,
  rowTone,
  label,
  density = "comfortable",
}: DataViewProps<T>) {
  const titleCols = columns.filter((c) => c.mobile === "title");
  const subtitleCols = columns.filter((c) => c.mobile === "subtitle");
  const metaCols = columns.filter((c) => !c.mobile || c.mobile === "meta");
  const actionCols = columns.filter((c) => c.mobile === "actions");
  const densityCls = density === "compact" ? "density-compact" : "density-comfortable";

  return (
    <>
      {/* سطح المكتب: جدول بتمرير داخلي منضبط داخل البطاقة — لا تمرير على مستوى الصفحة */}
      <div className={cn("hidden md:block", densityCls)}>
        <div className="surface-card overflow-hidden">
          <div className="table-scroll max-h-[70dvh] overflow-y-auto">
            <table className="table-mehla min-w-full" aria-label={label}>
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c.id} scope="col" className={c.headerClassName}>
                      {c.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={rowKey(row)} className={rowTone?.(row)}>
                    {columns.map((c) => {
                      const clamp = !c.wrap && c.mobile !== "actions";
                      return (
                        <td
                          key={c.id}
                          className={cn(
                            c.mobile === "title" && "font-medium text-foreground",
                            c.wrap && "max-w-[32ch] whitespace-normal",
                            clamp && "max-w-[26ch]",
                            c.mobile === "actions" && "whitespace-nowrap",
                            c.className,
                          )}
                        >
                          {clamp ? (
                            <span className="cell-truncate">{c.cell(row)}</span>
                          ) : (
                            c.cell(row)
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* الجوال: بطاقات حقيقية بدل جدول مضغوط */}
      <ul className={cn("space-y-2.5 md:hidden", densityCls)} aria-label={label}>
        {rows.map((row) => (
          <li
            key={rowKey(row)}
            className={cn(
              "surface-card overflow-hidden px-4 py-[var(--density-pad-y,1rem)]",
              rowTone?.(row),
            )}
          >
            {titleCols.map((c) => (
              <div
                key={c.id}
                className="min-w-0 break-words text-body font-semibold [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center"
              >
                {c.cell(row)}
              </div>
            ))}
            {subtitleCols.map((c) => (
              <div key={c.id} className="text-caption mt-1 min-w-0 break-words">
                {c.cell(row)}
              </div>
            ))}
            {metaCols.length > 0 && (
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5">
                {metaCols.map((c) => (
                  <div key={c.id} className="min-w-0">
                    <dt className="text-caption">{c.mobileLabel ?? c.header}</dt>
                    <dd className="mt-0.5 min-w-0 text-body-sm break-words">{c.cell(row)}</dd>
                  </div>
                ))}
              </dl>
            )}
            {actionCols.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center justify-end gap-1.5 border-t border-border pt-2.5">
                {actionCols.map((c) => (
                  <div key={c.id} className="flex items-center gap-1.5">
                    {c.cell(row)}
                  </div>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
