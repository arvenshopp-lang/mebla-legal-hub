import { Link } from "@tanstack/react-router";
import { LogOut, PanelRightClose, PanelRightOpen, Plus, UserRound } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { QUICK_CREATE } from "./nav";

/**
 * الشريط العلوي لمساحة العمل: سياق الصفحة + إنشاء سريع + الإشعارات.
 * «الإنشاء السريع» يفتح نماذج الإنشاء القائمة فعلاً في صفحاتها (#new) — بلا وظائف وهمية.
 */
export function WorkspaceTopbar({
  title,
  description,
  actions,
  collapsed,
  onToggleCollapse,
  canCreate,
  userEmail,
  roleLabel,
  onSignOut,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  collapsed: boolean;
  onToggleCollapse: () => void;
  canCreate: boolean;
  userEmail?: string;
  roleLabel?: string;
  onSignOut: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!accountOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!accountRef.current?.contains(e.target as Node)) setAccountOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAccountOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [accountOpen]);

  return (
    <header className="sticky top-0 z-[var(--z-sticky)] border-b border-border bg-surface/90 backdrop-blur">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 md:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <button
            className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-s)] text-muted-foreground transition hover:bg-surface-muted hover:text-foreground lg:inline-flex"
            onClick={onToggleCollapse}
            aria-label={collapsed ? "توسيع القائمة الجانبية" : "تصغير القائمة الجانبية"}
          >
            {collapsed ? (
              <PanelRightOpen className="h-5 w-5" aria-hidden />
            ) : (
              <PanelRightClose className="h-5 w-5" aria-hidden />
            )}
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-bold sm:text-base">{title}</h1>
            {description && (
              <p className="truncate text-[12px] text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          {canCreate && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-m)] bg-primary px-3 text-[13px] font-semibold text-primary-foreground shadow-xs transition hover:bg-primary-hover"
              >
                <Plus className="h-4 w-4" aria-hidden />
                <span className="hidden sm:inline">إنشاء</span>
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  className="absolute left-0 top-[calc(100%+6px)] z-[var(--z-overlay)] w-52 overflow-hidden rounded-[var(--radius-m)] border border-border bg-surface shadow-lg"
                >
                  {QUICK_CREATE.map(({ to, label, Icon }) => (
                    <Link
                      key={to}
                      to={to}
                      hash="new"
                      role="menuitem"
                      onClick={() => setMenuOpen(false)}
                      className={cn(
                        "flex min-h-11 items-center gap-2.5 px-3 text-[13.5px] text-foreground transition hover:bg-surface-muted",
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      {label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
          <NotificationBell />

          {/* حساب المستخدم: متاح على كل المقاسات حتى يبقى الخروج ممكناً على الجوال والتابلت */}
          <div className="relative" ref={accountRef}>
            <button
              onClick={() => setAccountOpen((v) => !v)}
              aria-expanded={accountOpen}
              aria-haspopup="menu"
              aria-label="حساب المستخدم"
              className="inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius-m)] border border-border text-muted-foreground transition hover:bg-surface-muted hover:text-foreground"
            >
              <UserRound className="h-[18px] w-[18px]" aria-hidden />
            </button>
            {accountOpen && (
              <div
                role="menu"
                className="absolute left-0 top-[calc(100%+6px)] z-[var(--z-overlay)] w-60 overflow-hidden rounded-[var(--radius-m)] border border-border bg-surface shadow-lg"
              >
                <div className="border-b border-border px-3 py-2.5">
                  <p className="truncate text-[12.5px] font-semibold text-foreground">
                    {userEmail ?? "—"}
                  </p>
                  {roleLabel && (
                    <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
                      {roleLabel}
                    </p>
                  )}
                </div>
                <Link
                  to="/settings"
                  role="menuitem"
                  onClick={() => setAccountOpen(false)}
                  className="flex min-h-11 items-center px-3 text-[13.5px] text-foreground transition hover:bg-surface-muted"
                >
                  إعدادات الحساب
                </Link>
                <button
                  role="menuitem"
                  onClick={() => {
                    setAccountOpen(false);
                    onSignOut();
                  }}
                  className="flex min-h-11 w-full items-center gap-2.5 border-t border-border px-3 text-[13.5px] text-danger transition hover:bg-surface-muted"
                >
                  <LogOut className="h-4 w-4 shrink-0" aria-hidden />
                  تسجيل الخروج
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
