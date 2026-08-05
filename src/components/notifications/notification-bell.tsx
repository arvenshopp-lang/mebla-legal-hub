import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, LifeBuoy, Megaphone, Mail, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { fmtDateTime } from "@/lib/enums";

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
};

const ICONS: Record<string, typeof Bell> = {
  platform_broadcast: Megaphone,
  support_reply: LifeBuoy,
  invitation: Mail,
};

function iconFor(type: string) {
  return ICONS[type] ?? Calendar;
}

function linkFor(type: string): string | null {
  if (type === "support_reply") return "/support";
  if (type === "invitation") return "/team";
  return null;
}

export function NotificationBell() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const queryKey = useMemo(() => ["notifications", user?.id ?? "anon"], [user?.id]);

  const { data, isLoading } = useQuery({
    queryKey,
    enabled: !!user?.id,
    queryFn: async (): Promise<NotificationRow[]> => {
      const { data: rows, error } = await supabase
        .from("notifications")
        .select("id, type, title, message, is_read, created_at")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return rows ?? [];
    },
  });

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`notifications-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => qc.invalidateQueries({ queryKey }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, qc, queryKey]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const items = data ?? [];
  const unread = items.filter((n) => !n.is_read);

  const markRead = useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return;
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  if (!user?.id) return null;

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={unread.length > 0 ? `التنبيهات، ${unread.length} غير مقروء` : "التنبيهات"}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-m)] border border-border bg-surface text-muted-foreground transition hover:border-border-strong hover:text-foreground"
      >
        <Bell className="h-[18px] w-[18px]" aria-hidden />
        {unread.length > 0 && (
          <span
            className="absolute -top-1 -left-1 min-w-[18px] rounded-full bg-danger px-1 text-[10px] font-bold leading-[18px] text-white tabular-nums"
            aria-hidden
          >
            {unread.length > 9 ? "9+" : unread.length}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="مركز التنبيهات"
          className="absolute left-0 z-[var(--z-modal)] mt-2 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-[var(--radius-l)] border border-border bg-surface shadow-[var(--shadow-lg,0_18px_40px_rgba(18,60,50,.16))]"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <p className="text-[13.5px] font-semibold">التنبيهات</p>
            {unread.length > 0 && (
              <button
                type="button"
                onClick={() => markRead.mutate(unread.map((n) => n.id))}
                className="inline-flex items-center gap-1.5 text-[12px] text-primary hover:underline"
              >
                <CheckCheck className="h-3.5 w-3.5" aria-hidden /> تحديد الكل كمقروء
              </button>
            )}
          </div>

          <div className="max-h-[380px] overflow-y-auto">
            {isLoading ? (
              <div className="space-y-2 p-4" aria-busy>
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-14 animate-pulse rounded-[var(--radius-m)] bg-surface-muted"
                  />
                ))}
              </div>
            ) : items.length === 0 ? (
              <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">
                لا توجد تنبيهات حالياً.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {items.map((n) => {
                  const Icon = iconFor(n.type);
                  const to = linkFor(n.type);
                  const inner = (
                    <div className="flex gap-3 px-4 py-3 text-right">
                      <span
                        className={cn(
                          "mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-s)]",
                          n.is_read
                            ? "bg-surface-muted text-muted-foreground"
                            : "bg-primary-soft text-primary",
                        )}
                        aria-hidden
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span
                          className={cn(
                            "block text-[13px]",
                            n.is_read ? "font-medium" : "font-semibold",
                          )}
                        >
                          {n.title}
                        </span>
                        <span className="mt-0.5 block whitespace-pre-wrap text-[12.5px] leading-5 text-muted-foreground">
                          {n.message}
                        </span>
                        <span className="mt-1 block text-[11px] text-text-muted">
                          {fmtDateTime(n.created_at)}
                        </span>
                      </span>
                    </div>
                  );
                  return (
                    <li key={n.id} className={cn(!n.is_read && "bg-primary/[0.03]")}>
                      {to ? (
                        <Link
                          to={to}
                          className="block hover:bg-surface-muted/70"
                          onClick={() => {
                            setOpen(false);
                            if (!n.is_read) markRead.mutate([n.id]);
                          }}
                        >
                          {inner}
                        </Link>
                      ) : (
                        <button
                          type="button"
                          className="block w-full hover:bg-surface-muted/70"
                          onClick={() => !n.is_read && markRead.mutate([n.id])}
                        >
                          {inner}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-border px-4 py-2.5">
            <Link
              to="/support"
              className="text-[12.5px] text-primary hover:underline"
              onClick={() => setOpen(false)}
            >
              مركز الدعم والتذاكر
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
