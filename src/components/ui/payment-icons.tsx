import React from "react";
import { cn } from "@/lib/utils";

/**
 * أيقونة مدى (mada) الرسمية الحديثة — متجهة SVG نقية 100% بدون أي بكسلة
 */
export function MadaBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-8 sm:h-8.5 items-center justify-center rounded-[7px] border border-border/80 bg-white px-2.5 shadow-2xs transition-all hover:scale-105 hover:border-primary/40",
        className,
      )}
      title="مدى — mada"
      aria-label="مدى (mada)"
    >
      <svg
        viewBox="0 0 54 20"
        className="h-4.5 sm:h-5 w-auto"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Cyan block top-left */}
        <rect x="1" y="2" width="13" height="7.5" rx="1.5" fill="#00A3E0" />
        {/* Lime green block bottom-left */}
        <rect x="1" y="10.5" width="13" height="7.5" rx="1.5" fill="#86B817" />
        {/* Arabic text: مدى */}
        <text
          x="34"
          y="8.5"
          textAnchor="middle"
          fill="#111827"
          fontSize="8.5"
          fontWeight="900"
          fontFamily="system-ui, -apple-system, sans-serif"
        >
          مدى
        </text>
        {/* English text: mada */}
        <text
          x="34"
          y="17.2"
          textAnchor="middle"
          fill="#111827"
          fontSize="7.8"
          fontWeight="900"
          fontFamily="system-ui, -apple-system, sans-serif"
          letterSpacing="0.2"
        >
          mada
        </text>
      </svg>
    </span>
  );
}

/**
 * أيقونة Apple Pay الرسمية الحديثة — متجهة SVG نقية 100%
 */
export function ApplePayBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-8 sm:h-8.5 items-center justify-center rounded-[7px] border border-border/80 bg-white px-2.5 shadow-2xs transition-all hover:scale-105 hover:border-primary/40",
        className,
      )}
      title="Apple Pay"
      aria-label="Apple Pay"
    >
      <svg
        viewBox="0 0 46 20"
        className="h-4 sm:h-4.5 w-auto fill-current text-black"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Apple Logo */}
        <path d="M6.2 10.2c-.7.9-1.9 1.5-3 1.5-.2 0-.4 0-.5-.1.5-1.4 1.7-2.5 3-2.6.1.3.2.7.5 1.2zm.7-1.8c.7-.8 1.2-2 1.1-3.2-1 .1-2.2.7-2.9 1.5-.6.7-1.1 1.9-.9 3.1 1.2.1 2.2-.6 2.7-1.4zM8.7 11.4c-.6-.4-1.1-.5-1.7-.5-1 0-1.3.3-2 .3s-1.1-.3-1.9-.3c-1.6 0-3 1-3.7 2.3-.8 1.6-.6 3.8.6 5.6.6.9 1.3 1.8 2.3 1.8 1 0 1.3-.6 2.5-.6s1.6.6 2.5.6c1 0 1.7-.8 2.3-1.8.7-1.1 1-2 1.1-2.1-.1 0-1.9-.7-1.9-2.9 0-1.8 1.4-2.7 1.6-2.8-.8-1.2-2-1.4-2.5-1.4-.4 0-.7.2-1.1.5z" />
        {/* Pay Text */}
        <path d="M16.8 6.5h3c2 0 3.3 1.1 3.3 2.9s-1.3 3-3.3 3h-1.5v4.5h-1.5V6.5zm2.8 4.5c1.2 0 1.9-.6 1.9-1.6s-.7-1.6-1.9-1.6h-1.4v3.2h1.4zM24.8 12.2c0-1.6 1.2-2.5 3.1-2.6l2-.1v-.6c0-1-.6-1.5-1.7-1.5-.8 0-1.5.4-1.7 1l-1.3-.3c.2-1.2 1.4-1.9 3.1-1.9 1.9 0 3 1 3 2.5v5.7h-1.3v-1.3c-.6 1-1.6 1.5-2.6 1.5-1.6 0-2.6-1.1-2.6-2.5zm5.1-.2v-.9l-1.9.1c-1.1.1-1.8.6-1.8 1.5 0 .8.7 1.3 1.6 1.3 1.1 0 2.1-.9 2.1-2zM34.7 19.6l1.7-5-2.7-7h1.6l1.9 5.3 1.9-5.3h1.6l-4.5 10.5c-.5 1.1-1.2 1.6-2.4 1.6h-1.1v-1.3h.9c.7 0 1.2-.4 1.6-1.3z" />
      </svg>
    </span>
  );
}

/**
 * أيقونة Visa الرسمية الحديثة — متجهة SVG نقية 100%
 */
export function VisaBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-8 sm:h-8.5 items-center justify-center rounded-[7px] border border-border/80 bg-white px-2.5 shadow-2xs transition-all hover:scale-105 hover:border-primary/40",
        className,
      )}
      title="Visa"
      aria-label="Visa"
    >
      <svg
        viewBox="0 0 46 16"
        className="h-4 sm:h-4.5 w-auto"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M17.8 0.8L11.7 15.2H7.7L4.7 3.6C4.5 2.7 4.3 2.4 3.6 2 2.3 1.4 0.9 0.8 0 0.4L0.1 0.8H6.7C7.6 0.8 8.3 1.4 8.5 2.4L10.2 11.4 14.4 0.8H17.8ZM33.6 10.3C33.6 6.5 28.5 6.2 28.5 4.6c0-0.5 0.5-1 1.6-1.2 0.5-0.1 2-0.2 3.5 0.6l0.6-3.1C33.3 0.5 32.1 0.3 30.7 0.3c-3.5 0-5.9 2-5.9 4.7 0 2 1.9 3.2 3.1 3.9 1.4 0.6 1.9 1.1 1.9 1.8 0 1-1.1 1.5-2.2 1.5-1.9 0-2.8-0.3-4.3-1l-0.6 3.1c0.9 0.4 2.4 0.8 3.9 0.8 3.7 0 6.1-2 6.1-4.6zM43.7 15.2H47.2L44.2 0.8H41.1c-0.8 0-1.4 0.4-1.7 1.1L34.1 15.2h4.1l0.9-2.5h5l0.5 2.5zm-4-5.8l2.1-5.9 1.2 5.9h-3.3zM24.5 0.8L21.3 15.2H17.6L20.8 0.8h3.7z"
          fill="#1A1F71"
        />
      </svg>
    </span>
  );
}

/**
 * أيقونة MasterCard الرسمية الحديثة — متجهة SVG نقية 100%
 */
export function MasterCardBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-8 sm:h-8.5 items-center justify-center rounded-[7px] border border-border/80 bg-white px-2.5 shadow-2xs transition-all hover:scale-105 hover:border-primary/40",
        className,
      )}
      title="MasterCard"
      aria-label="MasterCard"
    >
      <svg
        viewBox="0 0 36 22"
        className="h-4.5 sm:h-5 w-auto"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <circle cx="12" cy="11" r="10" fill="#EB001B" />
        <circle cx="24" cy="11" r="10" fill="#F79E1B" />
        <path
          d="M18 4.1a9.95 9.95 0 0 1 3.6 6.9 9.95 9.95 0 0 1-3.6 6.9 9.95 9.95 0 0 1-3.6-6.9A9.95 9.95 0 0 1 18 4.1z"
          fill="#FF5F00"
        />
      </svg>
    </span>
  );
}

/**
 * أيقونة Samsung Pay الرسمية الحديثة — متجهة SVG نقية 100%
 */
export function SamsungPayBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-8 sm:h-8.5 items-center justify-center rounded-[7px] border border-border/80 bg-white px-2.5 shadow-2xs transition-all hover:scale-105 hover:border-primary/40",
        className,
      )}
      title="Samsung Pay"
      aria-label="Samsung Pay"
    >
      <svg
        viewBox="0 0 58 16"
        className="h-3.5 sm:h-4 w-auto fill-current text-black"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <text
          x="29"
          y="12"
          textAnchor="middle"
          fill="#000000"
          fontSize="11"
          fontWeight="900"
          fontFamily="system-ui, -apple-system, sans-serif"
          letterSpacing="0.8"
        >
          SAMSUNG
        </text>
      </svg>
    </span>
  );
}

/**
 * شريط وسائل الدفع المعتمدة الموحد والشامل
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
      <div className="flex flex-wrap items-center gap-2">
        <MadaBadge />
        <ApplePayBadge />
        <VisaBadge />
        <MasterCardBadge />
        <SamsungPayBadge />
      </div>
    </div>
  );
}
