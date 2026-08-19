/**
 * حقل رمز التحقق — خانات منفصلة بتجربة عربية RTL.
 * ترتيب الخانات منطقي من اليسار لليمين (كالأرقام)، مع دعم اللصق ولوحة المفاتيح وقارئ الشاشة.
 */
import { useEffect, useRef } from "react";
import { toLatinDigits } from "@/lib/sms/sms.shared";

type Props = {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  label?: string;
  onComplete?: (value: string) => void;
};

export function OtpCodeInput({
  value,
  onChange,
  length = 6,
  disabled = false,
  autoFocus = false,
  label = "رمز التحقق",
  onComplete,
}: Props) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.slice(0, length).split("");

  useEffect(() => {
    if (autoFocus && !disabled) refs.current[0]?.focus();
  }, [autoFocus, disabled]);

  const commit = (next: string) => {
    const clean = toLatinDigits(next).replace(/\D/g, "").slice(0, length);
    onChange(clean);
    if (clean.length === length) onComplete?.(clean);
    return clean;
  };

  const handleInput = (index: number, raw: string) => {
    const typed = toLatinDigits(raw).replace(/\D/g, "");
    if (!typed) return;
    const chars = value.split("");
    if (typed.length > 1) {
      const merged = commit(value.slice(0, index) + typed);
      refs.current[Math.min(merged.length, length - 1)]?.focus();
      return;
    }
    chars[index] = typed;
    const merged = commit(chars.join("").slice(0, length));
    if (index < length - 1 && merged.length > index) refs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace") {
      event.preventDefault();
      const chars = value.split("");
      if (chars[index]) {
        chars[index] = "";
        commit(chars.join("").replace(/\s/g, ""));
      } else if (index > 0) {
        chars[index - 1] = "";
        commit(chars.join(""));
        refs.current[index - 1]?.focus();
      }
      return;
    }
    if (event.key === "ArrowLeft" && index > 0) refs.current[index - 1]?.focus();
    if (event.key === "ArrowRight" && index < length - 1) refs.current[index + 1]?.focus();
  };

  return (
    <div
      role="group"
      aria-label={label}
      dir="ltr"
      className="flex items-center justify-center gap-2"
    >
      {Array.from({ length }, (_, index) => (
        <input
          key={index}
          ref={(node) => {
            refs.current[index] = node;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          aria-label={`${label} — الخانة ${index + 1} من ${length}`}
          maxLength={1}
          disabled={disabled}
          value={digits[index] ?? ""}
          onChange={(event) => handleInput(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={(event) => {
            event.preventDefault();
            const merged = commit(event.clipboardData.getData("text"));
            refs.current[Math.min(merged.length, length - 1)]?.focus();
          }}
          className="h-12 w-11 rounded-[var(--radius-m)] border border-border bg-surface text-center font-mono text-[18px] font-semibold text-foreground outline-none transition focus:border-primary focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        />
      ))}
    </div>
  );
}
