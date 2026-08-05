import { PASSWORD_RULES, type StrengthLevel } from "@/lib/password-policy";
import type { PasswordStrengthState } from "@/hooks/use-password-strength";

const BAR_COLORS: Record<StrengthLevel, string> = {
  0: "bg-danger",
  1: "bg-danger",
  2: "bg-warning",
  3: "bg-success",
  4: "bg-primary",
};

const LABEL_COLORS: Record<StrengthLevel, string> = {
  0: "text-danger",
  1: "text-danger",
  2: "text-warning",
  3: "text-success",
  4: "text-foreground",
};

const FILLED_BARS: Record<StrengthLevel, number> = { 0: 1, 1: 1, 2: 2, 3: 3, 4: 4 };

export function PasswordChecklist({
  password,
  state,
}: {
  password: string;
  state: PasswordStrengthState;
}) {
  const { rules, score, label, breachStatus, reason, notice } = state;
  const filled = password ? FILLED_BARS[score] : 0;

  return (
    <div className="mt-3 rounded-[var(--radius-l)] border border-border bg-surface-muted/70 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-1 gap-1.5" aria-hidden="true">
          {[1, 2, 3, 4].map((step) => (
            <span
              key={step}
              className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ease-out ${
                filled >= step ? BAR_COLORS[score] : "bg-primary/12"
              }`}
            />
          ))}
        </div>
        <span
          className={`min-w-[62px] text-left text-[11px] font-semibold transition-colors duration-300 ${
            password ? LABEL_COLORS[score] : "text-text-muted"
          }`}
          aria-live="polite"
        >
          {password ? `${label}${score === 4 ? " ⭐" : ""}` : "قوة كلمة المرور"}
        </span>
      </div>

      <ul className="mt-3.5 space-y-2">
        {PASSWORD_RULES.map((rule) => {
          const ok = rules.results[rule.id];
          return (
            <li key={rule.id} className="flex items-center gap-2.5 text-[12.5px] leading-6">
              <span
                className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-all duration-300 ease-out ${
                  ok
                    ? "border-success bg-success text-primary-foreground"
                    : "border-border bg-surface text-transparent"
                }`}
                aria-hidden="true"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-3 w-3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </span>
              <span
                className={`transition-colors duration-300 ${ok ? "font-medium text-success" : "text-muted-foreground"}`}
              >
                {rule.label}
              </span>
            </li>
          );
        })}
        <li className="flex items-center gap-2.5 text-[12.5px] leading-6">
          <span
            className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-all duration-300 ${
              breachStatus === "safe"
                ? "border-success bg-success text-primary-foreground"
                : breachStatus === "breached"
                  ? "border-danger bg-danger text-primary-foreground"
                  : "border-border bg-surface text-transparent"
            }`}
            aria-hidden="true"
          >
            {breachStatus === "breached" ? (
              <svg
                viewBox="0 0 24 24"
                className="h-3 w-3"
                fill="none"
                stroke="currentColor"
                strokeWidth="3.2"
                strokeLinecap="round"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                className="h-3 w-3"
                fill="none"
                stroke="currentColor"
                strokeWidth="3.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            )}
          </span>
          <span
            className={
              breachStatus === "safe"
                ? "font-medium text-success"
                : breachStatus === "breached"
                  ? "font-medium text-danger"
                  : "text-muted-foreground"
            }
          >
            {breachStatus === "checking"
              ? "جارٍ التحقق من أمان كلمة المرور…"
              : breachStatus === "breached"
                ? "ظهرت كلمة المرور ضمن تسريبات سابقة"
                : breachStatus === "unavailable"
                  ? "تعذر الفحص الإضافي — تم التحقق محلياً"
                  : "لم تظهر في تسريبات كلمات المرور المعروفة"}
          </span>
        </li>
      </ul>

      {reason && (
        <p
          role="alert"
          className="mt-3 rounded-[var(--radius-m)] border border-danger/20 bg-danger-soft px-3 py-2 text-[12.5px] leading-6 text-danger"
        >
          {reason}
        </p>
      )}
      {!reason && notice && (
        <p className="mt-3 text-[12px] leading-6 text-muted-foreground" aria-live="polite">
          {notice}
        </p>
      )}
    </div>
  );
}
