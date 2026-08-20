import { forwardRef, useId, useState } from "react";
import { inputCls } from "@/lib/list-utils";

type PasswordInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: string;
  hint?: string;
};

/**
 * حقل كلمة مرور مع زر إظهار/إخفاء.
 * لا يُعاد تركيب الحقل عند تبديل الإظهار (نفس العنصر) لذا يبقى التركيز والكيبورد كما هو.
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ label, hint, className, ...props }, ref) {
    const [visible, setVisible] = useState(false);
    const id = useId();

    return (
      <div>
        <label htmlFor={id} className="text-label mb-1.5 block text-foreground">
          {label}
          {props.required && (
            <>
              <span className="font-bold text-danger" aria-hidden>
                {" "}
                *
              </span>
              <span className="sr-only"> (حقل إلزامي)</span>
            </>
          )}
        </label>
        <div className="relative">
          <input
            {...props}
            id={id}
            ref={ref}
            type={visible ? "text" : "password"}
            className={`${className ?? inputCls} pe-12`}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-pressed={visible}
            aria-label={visible ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
            className="absolute inset-y-0 end-0 flex w-11 items-center justify-center rounded-e-[var(--radius-m)] text-muted-foreground transition hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {visible ? (
              <svg
                viewBox="0 0 24 24"
                className="h-[18px] w-[18px]"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8" />
                <path d="M6.7 6.7C4.6 8 3 10 2 12c2 4 6 7 10 7 1.8 0 3.5-.5 5-1.3M17.3 17.3" />
                <path d="M12 5c4 0 8 3 10 7-.6 1.2-1.4 2.4-2.4 3.4" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                className="h-[18px] w-[18px]"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" />
                <circle cx="12" cy="12" r="2.6" />
              </svg>
            )}
          </button>
        </div>
        {hint && <p className="text-caption mt-1">{hint}</p>}
      </div>
    );
  },
);
