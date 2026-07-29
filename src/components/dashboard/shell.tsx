import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Briefcase,
  Users,
  Gavel,
  Clock,
  ListChecks,
  FileText,
  Bell,
  Settings,
  LogOut,
  ChevronDown,
  UsersRound,
  Menu,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useAuth, ROLE_LABELS } from "@/hooks/use-auth";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";

const NAV: { to: string; label: string; Icon: typeof LayoutDashboard }[] = [
  { to: "/dashboard", label: "الرئيسية", Icon: LayoutDashboard },
  { to: "/cases", label: "القضايا", Icon: Briefcase },
  { to: "/hearings", label: "الجلسات", Icon: Gavel },
  { to: "/deadlines", label: "المهل", Icon: Clock },
  { to: "/tasks", label: "المهام", Icon: ListChecks },
  { to: "/clients", label: "العملاء", Icon: Users },
  { to: "/documents", label: "المستندات", Icon: FileText },
  { to: "/team", label: "الفريق", Icon: UsersRound },
  { to: "/settings", label: "الإعدادات", Icon: Settings },
];

export function DashboardShell({ children, title }: { children: ReactNode; title: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { memberships, activeOrgId, setActiveOrgId, activeRole, user, signOut } = useAuth();
  const [orgOpen, setOrgOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const active = memberships.find((m) => m.organization_id === activeOrgId);

  const onSignOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await signOut();
    navigate({ to: "/login", search: { redirect: "/dashboard" }, replace: true });
  };

  const SidebarInner = (
    <>
      <div className="border-b border-[#123C32]/10 px-5 py-5 flex items-center justify-between">
        <Link to="/dashboard" className="text-xl font-bold">
          مِهلة <span className="text-[#C9A961]">·</span> MEHLA
        </Link>
        <button className="lg:hidden" onClick={() => setMobileOpen(false)} aria-label="إغلاق">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="border-b border-[#123C32]/10 px-3 py-3">
        <button
          onClick={() => setOrgOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-xl bg-[#F5F3EE] px-3 py-2.5 text-right"
        >
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{active?.organization?.name ?? "—"}</div>
            <div className="text-xs text-[#123C32]/60">{activeRole ? ROLE_LABELS[activeRole] : ""}</div>
          </div>
          <ChevronDown className="h-4 w-4 opacity-60" />
        </button>
        {orgOpen && memberships.length > 1 && (
          <div className="mt-2 space-y-1">
            {memberships.map((m) => (
              <button
                key={m.organization_id}
                onClick={() => { setActiveOrgId(m.organization_id); setOrgOpen(false); }}
                className={`block w-full rounded-lg px-3 py-2 text-right text-sm hover:bg-[#F5F3EE] ${
                  m.organization_id === activeOrgId ? "bg-[#F5F3EE] font-semibold" : ""
                }`}
              >
                {m.organization?.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
        {NAV.map(({ to, label, Icon }) => {
          const isActive = pathname === to || pathname.startsWith(to + "/");
          return (
            <Link
              key={to}
              to={to}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                isActive ? "bg-[#123C32] text-white" : "text-[#123C32] hover:bg-[#F5F3EE]"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-[#123C32]/10 p-3">
        <div className="mb-2 px-2 text-xs text-[#123C32]/60 truncate">{user?.email}</div>
        <button
          onClick={onSignOut}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[#123C32]/70 hover:bg-[#F5F3EE]"
        >
          <LogOut className="h-4 w-4" />
          تسجيل الخروج
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-[#F5F3EE] text-[#123C32]" dir="rtl">
      <aside className="fixed inset-y-0 right-0 z-30 hidden w-64 flex-col border-l border-[#123C32]/10 bg-white lg:flex">
        {SidebarInner}
      </aside>

      {mobileOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setMobileOpen(false)} />
          <aside className="fixed inset-y-0 right-0 z-50 flex w-72 flex-col border-l border-[#123C32]/10 bg-white lg:hidden">
            {SidebarInner}
          </aside>
        </>
      )}

      <main className="lg:mr-64">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-[#123C32]/10 bg-white/80 px-6 py-4 backdrop-blur">
          <div className="flex items-center gap-3">
            <button className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="القائمة">
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-lg font-bold">{title}</h1>
          </div>
          <button className="relative rounded-full p-2 hover:bg-[#F5F3EE]">
            <Bell className="h-5 w-5" />
          </button>
        </header>
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: "default" | "warn" | "danger" | "gold";
}) {
  const tones: Record<string, string> = {
    default: "bg-white",
    warn: "bg-[#F6E9CC]",
    danger: "bg-[#F4D9D2]",
    gold: "bg-[#123C32] text-white",
  };
  return (
    <div className={`rounded-2xl border border-[#123C32]/10 p-5 ${tones[tone]}`}>
      <div className={`text-sm ${tone === "gold" ? "text-white/70" : "text-[#123C32]/60"}`}>{label}</div>
      <div className="mt-2 text-3xl font-bold">{value}</div>
      {hint && <div className={`mt-1 text-xs ${tone === "gold" ? "text-white/70" : "text-[#123C32]/50"}`}>{hint}</div>}
    </div>
  );
}