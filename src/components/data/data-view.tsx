import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { DataCard, Td, Th } from "@/lib/list-utils";

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
};

export function DataView<T>({ columns, rows, rowKey, rowTone, label }: DataViewProps<T>) {
  const titleCols = columns.filter((c) => c.mobile === "title");
  const subtitleCols = columns.filter((c) => c.mobile === "subtitle");
  const metaCols = columns.filter((c) => !c.mobile || c.mobile === "meta");
  const actionCols = columns.filter((c) => c.mobile === "actions");

  return (
    <>
      {/* سطح المكتب: جدول بتمرير داخلي منضبط داخل البطاقة — لا تمرير على مستوى الصفحة */}
      <div className="hidden md:block">
        <DataCard>
          <table className="min-w-full" aria-label={label}>
            <thead className="bg-surface-muted/60">
              <tr>
                {columns.map((c) => (
                  <Th key={c.id} className={c.headerClassName}>
                    {c.header}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={rowKey(row)} className={cn("hover:bg-surface-muted/40", rowTone?.(row))}>
                  {columns.map((c) => (
                    <Td
                      key={c.id}
                      className={cn(
                        c.mobile === "title" && "font-medium",
                        c.wrap && "max-w-[28ch] whitespace-normal",
                        c.className,
                      )}
                    >
                      {c.cell(row)}
                    </Td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </DataCard>
      </div>

      {/* الجوال: بطاقات حقيقية بدل جدول مضغوط */}
      <ul className="space-y-3 md:hidden" aria-label={label}>
        {rows.map((row) => (
          <li key={rowKey(row)} className={cn("surface-card overflow-hidden p-4", rowTone?.(row))}>
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
