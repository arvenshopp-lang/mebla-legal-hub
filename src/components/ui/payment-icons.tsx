import React from "react";
import { cn } from "@/lib/utils";

/**
 * أيقونة مدى (mada) الرسمية
 */
export function MadaBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-9 sm:h-10 min-w-[62px] sm:min-w-[70px] items-center justify-center rounded-[8px] border border-border/80 bg-white px-2.5 py-1 shadow-2xs transition-all hover:scale-105 hover:border-primary/50",
        className,
      )}
      title="مدى — mada"
      aria-label="مدى (mada)"
    >
      <img
        src="/images/payments/mada.png"
        alt="مدى (mada)"
        className="h-6 sm:h-6.5 w-auto max-w-[56px] object-contain"
        loading="eager"
      />
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
        "inline-flex h-9 sm:h-10 min-w-[62px] sm:min-w-[70px] items-center justify-center rounded-[8px] border border-border/80 bg-white px-2.5 py-1 shadow-2xs transition-all hover:scale-105 hover:border-primary/50",
        className,
      )}
      title="Apple Pay"
      aria-label="Apple Pay"
    >
      <img
        src="/images/payments/apple-pay.png"
        alt="Apple Pay"
        className="h-5 sm:h-5.5 w-auto max-w-[56px] object-contain"
        loading="eager"
      />
    </span>
  );
}

/**
 * أيقونة Visa الرسمية
 */
export function VisaBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-9 sm:h-10 min-w-[62px] sm:min-w-[70px] items-center justify-center rounded-[8px] border border-border/80 bg-white px-2.5 py-1 shadow-2xs transition-all hover:scale-105 hover:border-primary/50",
        className,
      )}
      title="Visa"
      aria-label="Visa"
    >
      <img
        src="/images/payments/visa.png"
        alt="Visa"
        className="h-4.5 sm:h-5 w-auto max-w-[54px] object-contain"
        loading="eager"
      />
    </span>
  );
}

/**
 * أيقونة MasterCard الرسمية
 */
export function MasterCardBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-9 sm:h-10 min-w-[62px] sm:min-w-[70px] items-center justify-center rounded-[8px] border border-border/80 bg-white px-2.5 py-1 shadow-2xs transition-all hover:scale-105 hover:border-primary/50",
        className,
      )}
      title="MasterCard"
      aria-label="MasterCard"
    >
      <img
        src="/images/payments/mastercard.png"
        alt="MasterCard"
        className="h-6 sm:h-7 w-auto max-w-[48px] object-contain"
        loading="eager"
      />
    </span>
  );
}

/**
 * أيقونة Samsung Pay الرسمية
 */
export function SamsungPayBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-9 sm:h-10 min-w-[62px] sm:min-w-[70px] items-center justify-center rounded-[8px] border border-border/80 bg-white px-2.5 py-1 shadow-2xs transition-all hover:scale-105 hover:border-primary/50",
        className,
      )}
      title="Samsung Pay"
      aria-label="Samsung Pay"
    >
      <img
        src="/images/payments/samsung-pay.png"
        alt="Samsung Pay"
        className="h-3.5 sm:h-4 w-auto max-w-[58px] object-contain"
        loading="eager"
      />
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
    <div className={cn("inline-flex flex-wrap items-center gap-3", className)}>
      {showLabel && (
        <span className="text-[13px] font-bold text-muted-foreground ml-1">
          طرق الدفع المعتمدة:
        </span>
      )}
      <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
        <MadaBadge />
        <ApplePayBadge />
        <VisaBadge />
        <MasterCardBadge />
        <SamsungPayBadge />
      </div>
    </div>
  );
}
