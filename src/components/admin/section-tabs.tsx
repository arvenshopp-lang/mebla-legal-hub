/**
 * تبويبات أقسام لوحة الإدارة (RTL) — كل تبويب رابط حقيقي لمسار قائم.
 * تمرير أفقي داخلي على الجوال، وتنقل كامل بلوحة المفاتيح (سهم يمين/يسار، Home/End).
 */
import { useRef, type KeyboardEvent } from "react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export type SectionTab = { to: string; label: string };

export function SectionTabs({
  tabs,
  activeTo,
  label = "تبويبات القسم",
}: {
  tabs: SectionTab[];
  activeTo: string;
  label?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  if (tabs.length < 2) return null;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowRight", "ArrowLeft", "Home", "End"];
    if (!keys.includes(event.key)) return;
    const links = Array.from(listRef.current?.querySelectorAll<HTMLAnchorElement>("a") ?? []);
    if (links.length === 0) return;
    const current = links.findIndex((link) => link === document.activeElement);
    event.preventDefault();
    // في RTL: السهم الأيسر يتقدّم للأمام والأيمن يرجع للخلف.
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? links.length - 1
          : event.key === "ArrowLeft"
            ? (Math.max(current, 0) + 1) % links.length
            : (Math.max(current, 0) - 1 + links.length) % links.length;
    links[next]?.focus();
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="mb-5 -mx-4 flex gap-1 overflow-x-auto border-b border-border px-4 [scrollbar-width:none] lg:mx-0 lg:px-0 [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map((tab) => {
        const active = tab.to === activeTo;
        return (
          <Link
            key={tab.to}
            to={tab.to}
            role="tab"
            aria-selected={active}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex min-h-11 shrink-0 items-center border-b-2 px-3 text-[13px] font-medium transition",
              active
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
