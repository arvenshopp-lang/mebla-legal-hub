import React from "react";
import { cn } from "@/lib/utils";

export function MadaBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-[6px] border border-border bg-white px-2 py-1 shadow-xs transition-transform hover:scale-105",
        className,
      )}
      title="مدى — Mada"
      aria-label="مدى (Mada)"
    >
      <svg
        viewBox="0 0 54 20"
        className="h-4 w-auto fill-current"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Mada Logo Paths */}
        <path
          d="M7.8 3.5C5.4 3.5 3.5 5.4 3.5 7.8v4.4c0 2.4 1.9 4.3 4.3 4.3h38.4c2.4 0 4.3-1.9 4.3-4.3V7.8c0-2.4-1.9-4.3-4.3-4.3H7.8z"
          fill="#004B87"
        />
        <path
          d="M7.8 3.5C5.4 3.5 3.5 5.4 3.5 7.8v1.2c1.2-.8 2.6-1.3 4.3-1.3h38.4c1.6 0 3.1.5 4.3 1.3V7.8c0-2.4-1.9-4.3-4.3-4.3H7.8z"
          fill="#86B817"
        />
        <text
          x="27"
          y="13.2"
          textAnchor="middle"
          fill="#FFFFFF"
          fontSize="8.5"
          fontWeight="bold"
          fontFamily="system-ui, -apple-system, sans-serif"
          letterSpacing="0.5"
        >
          mada
        </text>
      </svg>
    </span>
  );
}

export function ApplePayBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-[6px] border border-black/10 bg-black px-2.5 py-1 text-white shadow-xs transition-transform hover:scale-105",
        className,
      )}
      title="Apple Pay"
      aria-label="Apple Pay"
    >
      <svg
        viewBox="0 0 40 17"
        className="h-3.5 w-auto fill-current text-white"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Apple Icon */}
        <path d="M5.4 8.6c-.6.8-1.7 1.3-2.6 1.3-.2 0-.3 0-.4-.1.4-1.2 1.4-2.1 2.6-2.2.1.2.2.6.4 1zm.6-1.5c.6-.7 1-1.7.9-2.7-.9 0-1.9.6-2.5 1.3-.5.6-.9 1.6-.8 2.6 1 .1 1.9-.5 2.4-1.2zM7.5 9.7c-.5-.3-.9-.4-1.4-.4-.8 0-1.1.2-1.7.2s-.9-.2-1.6-.2c-1.3 0-2.5.8-3.1 1.9-.7 1.3-.5 3.2.5 4.7.5.7 1.1 1.5 1.9 1.5.8 0 1.1-.5 2.1-.5s1.3.5 2.1.5c.8 0 1.4-.7 1.9-1.5.6-.9.8-1.7.9-1.8-.1 0-1.6-.6-1.6-2.4 0-1.5 1.2-2.2 1.3-2.3-.7-1-1.7-1.1-2.1-1.1-.3 0-.6.1-.9.4z" />
        {/* Pay Text */}
        <path d="M14.5 5.5h2.5c1.7 0 2.8.9 2.8 2.4 0 1.6-1.1 2.5-2.8 2.5h-1.3v3.8h-1.2V5.5zm2.4 3.8c1 0 1.6-.5 1.6-1.4 0-.8-.6-1.4-1.6-1.4h-1.2v2.8h1.2zM21.2 10.3c0-1.3 1-2.1 2.6-2.2l1.7-.1v-.5c0-.8-.5-1.2-1.4-1.2-.7 0-1.3.3-1.4.8l-1.1-.2c.2-1 1.2-1.6 2.6-1.6 1.6 0 2.5.8 2.5 2.1v4.8h-1.1v-1.1c-.5.8-1.3 1.2-2.2 1.2-1.3 0-2.2-.9-2.2-2.1zm4.3-.2v-.7l-1.6.1c-.9.1-1.5.5-1.5 1.2 0 .7.6 1.1 1.3 1.1.9 0 1.8-.7 1.8-1.7zM29.5 16.5l1.4-4.2-2.3-5.8h1.3l1.6 4.4 1.6-4.4h1.3l-3.7 8.7c-.4.9-1 1.3-2 1.3h-.9v-1.1h.7c.6.1 1-.3 1.3-1.1z" />
      </svg>
    </span>
  );
}

export function VisaBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-[6px] border border-border bg-white px-2.5 py-1 shadow-xs transition-transform hover:scale-105",
        className,
      )}
      title="Visa"
      aria-label="Visa"
    >
      <svg
        viewBox="0 0 38 12"
        className="h-3.5 w-auto"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M15.2 0.3L10 11.7H6.6L4 2.5C3.8 1.8 3.7 1.6 3.1 1.3 2.1 0.8 0.7 0.3 0 0.1L0.1 0.3H5.6C6.3 0.3 6.9 0.8 7 1.6L8.4 8.7 11.9 0.3H15.2ZM28.6 7.9C28.6 4.9 24.4 4.7 24.4 3.4c0-0.4 0.4-0.8 1.3-1 0.4-0.1 1.6-0.1 2.9 0.5l0.5-2.4C28.4 0.2 27.4 0 26.2 0c-2.9 0-4.9 1.5-4.9 3.7 0 1.6 1.5 2.5 2.6 3.1 1.1 0.5 1.5 0.9 1.5 1.4 0 0.8-0.9 1.1-1.8 1.1-1.5 0-2.3-0.2-3.5-0.8l-0.5 2.4c0.7 0.3 1.9 0.6 3.2 0.6 3.1 0 5.1-1.5 5.1-3.6zM37.1 11.7H40L37.5 0.3H34.9c-0.6 0-1.1 0.3-1.4 0.9L29 11.7h3.4l0.7-1.9h4.1l0.4 1.9zm-3.3-4.5l1.7-4.6 1 4.6h-2.7zM20.9 0.3L18.3 11.7H15.1L17.7 0.3h3.2z"
          fill="#1A1F71"
        />
      </svg>
    </span>
  );
}

export function MasterCardBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-[6px] border border-border bg-white px-2 py-1 shadow-xs transition-transform hover:scale-105",
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

/** شريط وسائل الدفع المعتمدة الشامل */
export function PaymentMethodsBar({
  className,
  showLabel = true,
}: {
  className?: string;
  showLabel?: boolean;
}) {
  return (
    <div className={cn("inline-flex flex-wrap items-center gap-2", className)}>
      {showLabel && (
        <span className="text-[12.5px] font-medium text-muted-foreground ml-1">
          وسائل الدفع المعتمدة:
        </span>
      )}
      <div className="flex items-center gap-1.5">
        <MadaBadge />
        <ApplePayBadge />
        <VisaBadge />
        <MasterCardBadge />
      </div>
    </div>
  );
}
