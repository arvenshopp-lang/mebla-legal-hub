import { Riyal } from "@/components/ui/riyal";
import { fmtAmount, fmtNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * مبلغ مالي موحّد على مستوى المنصة: رقم + رمز الريال السعودي المتجهي.
 * الرمز يتبع حجم النص المحيط ولونه، ولا ينفصل عن المبلغ عند نهاية السطر.
 */
export function Money({
  value,
  decimals = true,
  className,
  symbolClassName,
}: {
  value: number | string | null | undefined;
  /** false لعرض المبلغ بدون منزلتين عشريتين (مؤشرات ولوحات). */
  decimals?: boolean;
  className?: string;
  symbolClassName?: string;
}) {
  const numeric = Number(value ?? 0);
  const text = decimals ? fmtAmount(numeric) : fmtNumber(numeric);
  return (
    <span
      className={cn("inline-flex items-center gap-1 whitespace-nowrap tabular-nums", className)}
      dir="ltr"
    >
      <span>{text}</span>
      <Riyal className={symbolClassName} />
      <span className="sr-only">ريال سعودي</span>
    </span>
  );
}