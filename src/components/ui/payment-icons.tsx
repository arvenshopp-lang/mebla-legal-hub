import React from "react";
import { cn } from "@/lib/utils";

/**
 * أيقونة مدى (mada) الرسمية الحديثة
 */
export function MadaBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-8 items-center justify-center rounded-[7px] border border-border/70 bg-white px-2.5 shadow-2xs transition-transform hover:scale-105",
        className,
      )}
      title="مدى — mada"
      aria-label="مدى (mada)"
    >
      <img
        src="/images/payments/mada.png"
        alt="مدى (mada)"
        className="h-5 w-auto object-contain"
        loading="lazy"
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
        "inline-flex h-8 items-center justify-center rounded-[7px] border border-border/70 bg-white px-2.5 shadow-2xs transition-transform hover:scale-105",
        className,
      )}
      title="Apple Pay"
      aria-label="Apple Pay"
    >
      <img
        src="/images/payments/apple-pay.png"
        alt="Apple Pay"
        className="h-4 w-auto object-contain"
        loading="lazy"
      />
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
        "inline-flex h-8 items-center justify-center rounded-[7px] border border-border/70 bg-white px-2.5 shadow-2xs transition-transform hover:scale-105",
        className,
      )}
      title="Visa"
      aria-label="Visa"
    >
      <img
        src="/images/payments/visa.png"
        alt="Visa"
        className="h-4 w-auto object-contain"
        loading="lazy"
      />
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
        "inline-flex h-8 items-center justify-center rounded-[7px] border border-border/70 bg-white px-2.5 shadow-2xs transition-transform hover:scale-105",
        className,
      )}
      title="MasterCard"
      aria-label="MasterCard"
    >
      <img
        src="/images/payments/mastercard.png"
        alt="MasterCard"
        className="h-4.5 w-auto object-contain"
        loading="lazy"
      />
    </span>
  );
}

/**
 * أيقونة Samsung Pay الرسمية الحديثة
 */
export function SamsungPayBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-8 items-center justify-center rounded-[7px] border border-border/70 bg-white px-2.5 shadow-2xs transition-transform hover:scale-105",
        className,
      )}
      title="Samsung Pay"
      aria-label="Samsung Pay"
    >
      <img
        src="/images/payments/samsung-pay.png"
        alt="Samsung Pay"
        className="h-3.5 w-auto object-contain"
        loading="lazy"
      />
    </span>
  );
}

/**
 * شريط وسائل الدفع المعتمدة المحدث والشامل
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
