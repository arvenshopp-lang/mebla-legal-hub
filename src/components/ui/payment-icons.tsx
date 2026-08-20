import React from "react";
import { cn } from "@/lib/utils";

/**
 * أيقونة مدى (mada) الرسمية الحديثة
 */
export function MadaBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center justify-center rounded-[6px] border border-border/80 bg-white px-2.5 shadow-2xs transition-transform hover:scale-105",
        className,
      )}
      title="مدى — mada"
      aria-label="مدى (mada)"
    >
      <svg
        viewBox="0 0 52 18"
        className="h-4 w-auto"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Modern mada symbol: Green upper loop & Blue lower loop */}
        <path
          d="M6.2 3.8C8.5 3.8 10.3 5.4 10.8 7.6C10.2 7.2 9.5 7 8.7 7C6.6 7 5 8.6 5 10.7C5 11.1 5.1 11.6 5.2 12C3 11.6 1.5 9.7 1.5 7.4C1.5 5.4 3.6 3.8 6.2 3.8Z"
          fill="#86B817"
        />
        <path
          d="M8.8 14.2C6.5 14.2 4.7 12.6 4.2 10.4C4.8 10.8 5.5 11 6.3 11C8.4 11 10 9.4 10 7.3C10 6.9 9.9 6.4 9.8 6C12 6.4 13.5 8.3 13.5 10.6C13.5 12.6 11.4 14.2 8.8 14.2Z"
          fill="#004F71"
        />
        {/* mada text */}
        <text
          x="32"
          y="12.5"
          textAnchor="middle"
          fill="#004F71"
          fontSize="10"
          fontWeight="800"
          fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
          letterSpacing="0.8"
        >
          mada
        </text>
      </svg>
    </span>
  );
}

/**
 * أيقونة Apple Pay الرسمية الحديثة
 */
export function ApplePayBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center justify-center rounded-[6px] border border-black/10 bg-black px-2.5 text-white shadow-2xs transition-transform hover:scale-105",
        className,
      )}
      title="Apple Pay"
      aria-label="Apple Pay"
    >
      <svg
        viewBox="0 0 44 18"
        className="h-3.5 w-auto fill-current text-white"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Apple Icon */}
        <path d="M5.85 9.15c-.65.8-1.75 1.35-2.7 1.35-.15 0-.35 0-.45-.05.45-1.3 1.5-2.25 2.75-2.35.1.25.2.65.4 1.05zm.65-1.65c.65-.75 1.1-1.85 1-2.95-.95.05-2.05.65-2.7 1.4-.55.65-1 1.75-.85 2.85 1.1.1 2.05-.55 2.55-1.3zM8.15 10.3c-.55-.35-1-.45-1.55-.45-.9 0-1.2.25-1.85.25s-1-.25-1.75-.25c-1.45 0-2.75.9-3.4 2.1-.75 1.45-.55 3.5.55 5.15.55.8 1.2 1.65 2.1 1.65.9 0 1.2-.55 2.3-.55s1.45.55 2.3.55c.9 0 1.55-.75 2.1-1.65.65-1 .9-1.85 1-1.95-.1 0-1.75-.65-1.75-2.65 0-1.65 1.3-2.45 1.45-2.55-.75-1.1-1.85-1.25-2.3-1.25-.35 0-.65.1-1 .4z" />
        {/* Pay Text */}
        <path d="M15.8 5.8h2.7c1.85 0 3.05 1 3.05 2.65s-1.2 2.75-3.05 2.75h-1.4v4.1H15.8V5.8zm2.6 4.15c1.1 0 1.75-.55 1.75-1.5s-.65-1.5-1.75-1.5h-1.3v3h1.3zM23.1 11.05c0-1.45 1.1-2.3 2.85-2.4l1.85-.1v-.55c0-.9-.55-1.35-1.55-1.35-.75 0-1.4.35-1.55.9l-1.2-.25c.2-1.1 1.3-1.75 2.85-1.75 1.75 0 2.75.9 2.75 2.3v5.25h-1.2v-1.2c-.55.9-1.45 1.35-2.4 1.35-1.45 0-2.4-1-2.4-2.3zm4.7-.2v-.8l-1.75.1c-1 .1-1.65.55-1.65 1.35 0 .75.65 1.2 1.45 1.2 1 0 1.95-.8 1.95-1.85zM32.2 17.8l1.55-4.6-2.5-6.4h1.45l1.75 4.85 1.75-4.85h1.45l-4.1 9.55c-.45 1-1.1 1.45-2.2 1.45h-1v-1.2h.8c.7 0 1.1-.35 1.45-1.2z" />
      </svg>
    </span>
  );
}

/**
 * أيقونة Visa الرسمية الحديثة
 */
export function VisaBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center justify-center rounded-[6px] border border-border/80 bg-white px-2.5 shadow-2xs transition-transform hover:scale-105",
        className,
      )}
      title="Visa"
      aria-label="Visa"
    >
      <svg
        viewBox="0 0 38 13"
        className="h-3.5 w-auto"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M14.6 0.5L9.6 12.3H6.3L3.8 2.8C3.6 2.1 3.5 1.9 2.9 1.6 1.9 1.1 0.7 0.6 0 0.3L0.1 0.5H5.4C6.1 0.5 6.7 1 6.8 1.8L8.2 9.1 11.6 0.5H14.6ZM27.5 8.3C27.5 5.2 23.4 5 23.4 3.7c0-0.4 0.4-0.8 1.3-1 0.4-0.1 1.6-0.1 2.8 0.5l0.5-2.5C27.3 0.4 26.3 0.2 25.2 0.2c-2.8 0-4.7 1.6-4.7 3.8 0 1.6 1.5 2.6 2.5 3.2 1.1 0.5 1.5 0.9 1.5 1.5 0 0.8-0.9 1.2-1.8 1.2-1.5 0-2.2-0.2-3.4-0.8l-0.5 2.5c0.7 0.3 1.9 0.6 3.1 0.6 3 0 4.9-1.6 4.9-3.7zM35.7 12.3H38.5L36.1 0.5H33.6c-0.6 0-1.1 0.3-1.4 0.9L27.9 12.3h3.3l0.7-2h4l0.4 2zm-3.2-4.7l1.7-4.8 1 4.8h-2.7zM20.1 0.5L17.5 12.3H14.5L17.1 0.5h3z"
          fill="#1434CB"
        />
      </svg>
    </span>
  );
}

/**
 * أيقونة MasterCard الرسمية الحديثة
 */
export function MasterCardBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center justify-center rounded-[6px] border border-border/80 bg-white px-2 shadow-2xs transition-transform hover:scale-105",
        className,
      )}
      title="MasterCard"
      aria-label="MasterCard"
    >
      <svg
        viewBox="0 0 32 20"
        className="h-4 w-auto"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <circle cx="10" cy="10" r="9" fill="#EB001B" />
        <circle cx="22" cy="10" r="9" fill="#F79E1B" />
        <path
          d="M16 3.8a8.95 8.95 0 0 1 3.2 6.2 8.95 8.95 0 0 1-3.2 6.2 8.95 8.95 0 0 1-3.2-6.2A8.95 8.95 0 0 1 16 3.8z"
          fill="#FF5F00"
        />
      </svg>
    </span>
  );
}

/**
 * شريط وسائل الدفع المعتمدة الحديث والأنيق
 */
export function PaymentMethodsBar({
  className,
  showLabel = true,
}: {
  className?: string;
  showLabel?: boolean;
}) {
  return (
    <div className={cn("inline-flex flex-wrap items-center gap-2.5", className)}>
      {showLabel && (
        <span className="text-[12.5px] font-semibold text-muted-foreground ml-1">
          طرق الدفع المعتمدة:
        </span>
      )}
      <div className="flex items-center gap-2">
        <MadaBadge />
        <ApplePayBadge />
        <VisaBadge />
        <MasterCardBadge />
      </div>
    </div>
  );
}
