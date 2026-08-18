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
    <header className="sticky top-0 z-[var(--z-sticky)] border-b border-border/70 bg-surface/85 backdrop-blur-md">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 md:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <button
            className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/60 text-muted-foreground transition hover:bg-surface-muted hover:text-foreground active:scale-95 lg:inline-flex"
            onClick={onToggleCollapse}
            aria-label={collapsed ? "توسيع القائمة الجانبية" : "تصغير القائمة الجانبية"}
          >
            {collapsed ? (
              <PanelRightOpen className="h-4 w-4" aria-hidden />
            ) : (
              <PanelRightClose className="h-4 w-4" aria-hidden />
            )}
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-bold sm:text-base text-foreground">{title}</h1>
            {description && (
              <p className="truncate text-xs text-muted-foreground leading-tight">{description}</p>
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
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-xs font-bold text-primary-foreground shadow-xs transition hover:bg-primary-hover active:scale-95"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                <span className="hidden sm:inline">إنشاء سريع</span>
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  className="absolute left-0 top-[calc(100%+8px)] z-[var(--z-overlay)] w-56 overflow-hidden rounded-xl border border-border/80 bg-surface/95 p-1.5 shadow-xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-150"
                >
                  {QUICK_CREATE.map(({ to, label, Icon }) => (
                    <Link
                      key={to}
                      to={to}
                      hash="new"
                      role="menuitem"
                      onClick={() => setMenuOpen(false)}
                      className={cn(
                        "flex min-h-10 items-center gap-2.5 rounded-lg px-3 text-xs font-semibold text-foreground transition hover:bg-surface-muted active:scale-[0.98]",
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                      {label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
          <NotificationBell />

          {/* حساب المستخدم: متاح على كل المقاسات */}
          <div className="relative" ref={accountRef}>
            <button
              onClick={() => setAccountOpen((v) => !v)}
              aria-expanded={accountOpen}
              aria-haspopup="menu"
              aria-label="حساب المستخدم"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border/70 bg-card text-muted-foreground transition hover:bg-surface-muted hover:text-foreground active:scale-95"
            >
              <UserRound className="h-4 w-4" aria-hidden />
            </button>
            {accountOpen && (
              <div
                role="menu"
                className="absolute left-0 top-[calc(100%+8px)] z-[var(--z-overlay)] w-64 overflow-hidden rounded-xl border border-border/80 bg-surface/95 p-1.5 shadow-xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-150"
              >
                <div className="rounded-lg bg-surface-muted/60 px-3 py-2.5 mb-1">
                  <p className="truncate text-xs font-bold text-foreground">
                    {userEmail ?? "—"}
                  </p>
                  {roleLabel && (
                    <span className="mt-1 inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                      {roleLabel}
                    </span>
                  )}
                </div>
                <Link
                  to="/settings"
                  role="menuitem"
                  onClick={() => setAccountOpen(false)}
                  className="flex min-h-9 items-center rounded-lg px-3 text-xs font-medium text-foreground transition hover:bg-surface-muted"
                >
                  إعدادات الحساب
                </Link>
                <button
                  role="menuitem"
                  onClick={() => {
                    setAccountOpen(false);
                    onSignOut();
                  }}
                  className="flex min-h-9 w-full items-center gap-2 rounded-lg px-3 text-xs font-semibold text-danger transition hover:bg-danger-soft mt-1"
                >
                  <LogOut className="h-3.5 w-3.5 shrink-0" aria-hidden />
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
