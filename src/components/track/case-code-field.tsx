import { forwardRef } from "react";

/**
 * حقل رمز القضية (١٠ أرقام).
 *
 * سبب تقطّع النص سابقاً: كان الحقل يستخدم `letter-spacing` كبيراً، والعربية
 * تُرسم بحروف متصلة، فأي تباعد بين الحروف يفصلها بصرياً ("خ ي ب"). لذلك:
 * التباعد هنا صفر تماماً على النص العربي (Placeholder)، ويُضاف تباعد رقمي
 * معتدل فقط عندما تكون القيمة أرقاماً.
 */

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const EASTERN_INDIC = "۰۱۲۳۴۵۶۷۸۹";

/** يوحّد الأرقام العربية والفارسية إلى أرقام لاتينية ويُبقي الأرقام فقط. */
export function normalizeCaseCode(input: string, maxLength = 10): string {
  let out = "";
  for (const char of input) {
    const arabic = ARABIC_INDIC.indexOf(char);
    const eastern = EASTERN_INDIC.indexOf(char);
    if (arabic > -1) out += String(arabic);
    else if (eastern > -1) out += String(eastern);
    else if (char >= "0" && char <= "9") out += char;
  }
  return out.slice(0, maxLength);
}

type Props = {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  invalid?: boolean;
  describedBy?: string;
  autoFocus?: boolean;
  disabled?: boolean;
};

export const CaseCodeField = forwardRef<HTMLInputElement, Props>(function CaseCodeField(
  { id = "case-code", value, onValueChange, invalid, describedBy, autoFocus, disabled },
  ref,
) {
  return (
    <input
      ref={ref}
      id={id}
      name="case-code"
      type="text"
      value={value}
      onChange={(event) => onValueChange(normalizeCaseCode(event.target.value))}
      onPaste={(event) => {
        event.preventDefault();
        onValueChange(normalizeCaseCode(event.clipboardData.getData("text")));
      }}
      inputMode="numeric"
      pattern="[0-9]*"
      maxLength={10}
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      enterKeyHint="go"
      autoFocus={autoFocus}
      disabled={disabled}
      dir="ltr"
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      placeholder="أدخل رمز القضية المكوّن من 10 أرقام"
      style={{
        // تباعد رقمي معتدل للقيمة فقط؛ صفر للنص العربي حتى لا تتقطّع الحروف.
        letterSpacing: value ? "0.12em" : "normal",
        wordSpacing: "normal",
      }}
      className={[
        "block w-full rounded-[var(--radius-l)] border bg-surface px-4 text-center font-semibold tabular-nums",
        "min-h-[56px] py-3 text-[22px] leading-[1.6] sm:text-[26px]",
        "placeholder:text-[15px] placeholder:font-normal placeholder:tracking-normal placeholder:text-text-muted",
        "outline-none transition-colors duration-[var(--duration-fast)]",
        "focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25",
        invalid ? "border-danger" : "border-border-strong hover:border-primary/45",
        disabled ? "opacity-60" : "",
      ].join(" ")}
    />
  );
});
