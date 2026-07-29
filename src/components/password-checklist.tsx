import { PASSWORD_RULES, evaluatePassword, type StrengthLevel } from "@/lib/password-policy";

const BAR_COLORS: Record<StrengthLevel, string> = {
  0: "bg-primary/15",
  1: "bg-danger",
  2: "bg-warning",
  3: "bg-success",
  4: "bg-primary",
};

const LABEL_COLORS: Record<StrengthLevel, string> = {
  0: "text-text-muted",
  1: "text-danger",
  2: "text-warning",
  3: "text-success",
  4: "text-foreground",
};

export function PasswordChecklist({ password }: { password: string }) {
  const { results, score, label, valid } = evaluatePassword(password);

  return (
    <div className="mt-3 rounded-[var(--radius-l)] border border-border bg-surface-muted/70 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-1 gap-1.5" aria-hidden="true">
          {[1, 2, 3, 4].map((step) => (
            <span
              key={step}
              className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ease-out ${
                score >= step ? BAR_COLORS[score] : "bg-primary/12"
              }`}
            />
          ))}
        </div>
        <span
          className={`min-w-[62px] text-left text-[11px] font-semibold transition-colors duration-300 ${LABEL_COLORS[score]}`}
          aria-live="polite"
        >
          {password ? `${label}${score === 4 ? " ⭐" : ""}` : "قوة كلمة المرور"}
        </span>
      </div>
      <ul className="mt-3.5 space-y-2">
        {PASSWORD_RULES.map((rule) => {
          const ok = results[rule.id];
          return (
            <li key={rule.id} className="flex items-center gap-2.5 text-[12.5px] leading-6">
              <span
                className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-all duration-300 ease-out ${
                  ok
                    ? "border-[#2E7D5B] bg-success text-primary-foreground"
                    : "border-border bg-surface text-transparent"
                }`}
                aria-hidden="true"
              >
                <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </span>
              <span
                className={`transition-colors duration-300 ${
                  ok ? "font-medium text-success" : "text-muted-foreground"
                }`}
              >
                {rule.label}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="sr-only" aria-live="polite">
        {valid ? "كلمة المرور مستوفية لجميع الشروط" : "كلمة المرور لم تستوف جميع الشروط بعد"}
      </p>
    </div>
  );
}