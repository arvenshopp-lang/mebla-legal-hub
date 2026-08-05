/**
 * البحث العالمي داخل لوحة إدارة المنصة (Ctrl/⌘ + K).
 * يبحث في المكاتب والمستخدمين والاشتراكات والفواتير والمدفوعات والتذاكر
 * والبريد والصفحات والموظفين وسجل التدقيق — ويُخفي أي قسم لا تملك صلاحيته.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, X, Loader2, CornerDownLeft } from "lucide-react";
import { globalAdminSearch } from "@/lib/admin-observability.functions";
import type { SearchHit } from "@/lib/admin-observability.shared";
import { useDebounced } from "@/lib/list-utils";
import { cn } from "@/lib/utils";

type Row = { hit: SearchHit; group: string };

export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return { open, setOpen };
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const search = useServerFn(globalAdminSearch);
  const [term, setTerm] = useState("");
  const [cursor, setCursor] = useState(0);
  const debounced = useDebounced(term, 300);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (open) {
      setTerm("");
      setCursor(0);
      const t = window.setTimeout(() => inputRef.current?.focus(), 30);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [open]);

  const { data, isFetching, isError, refetch } = useQuery({
    queryKey: ["admin-global-search", debounced],
    queryFn: () => search({ data: { query: debounced } }),
    enabled: open && debounced.trim().length >= 2,
    staleTime: 20_000,
  });

  const rows = useMemo<Row[]>(
    () => (data?.groups ?? []).flatMap((g) => g.hits.map((hit) => ({ hit, group: g.label }))),
    [data],
  );

  useEffect(() => setCursor(0), [rows.length]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setCursor((c) => (rows.length === 0 ? 0 : (c + 1) % rows.length));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setCursor((c) => (rows.length === 0 ? 0 : (c - 1 + rows.length) % rows.length));
      } else if (e.key === "Enter" && rows[cursor]) {
        e.preventDefault();
        onClose();
        navigate({ to: rows[cursor].hit.href } as never);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, rows, cursor, navigate, onClose]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  if (!open) return null;

  const ready = debounced.trim().length >= 2;

  return (
    <div className="fixed inset-0 z-[var(--z-modal)]" dir="rtl">
      <div
        className="absolute inset-0 bg-foreground/45 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="البحث العالمي في لوحة الإدارة"
        className="absolute inset-x-3 top-[max(1rem,env(safe-area-inset-top))] mx-auto flex max-h-[80dvh] w-auto max-w-2xl flex-col overflow-hidden rounded-[var(--radius-l)] border border-border bg-surface shadow-2xl sm:top-20"
      >
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            ref={inputRef}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="ابحث عن مكتب، مستخدم، فاتورة، تذكرة، رسالة…"
            aria-label="نص البحث"
            className="h-14 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-text-muted"
          />
          {isFetching && (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
          )}
          <button
            onClick={onClose}
            aria-label="إغلاق البحث"
            className="-me-2 shrink-0 rounded-[var(--radius-s)] p-2 text-muted-foreground hover:bg-surface-muted"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto" aria-live="polite">
          {!ready ? (
            <p className="px-4 py-8 text-center text-body-sm text-muted-foreground">
              اكتب حرفين على الأقل لبدء البحث.
            </p>
          ) : isError ? (
            <div className="px-4 py-8 text-center">
              <p className="text-body-sm text-danger">تعذّر تنفيذ البحث.</p>
              <button
                onClick={() => void refetch()}
                className="mt-3 h-10 rounded-[var(--radius-m)] border border-border px-4 text-sm font-medium hover:bg-surface-muted"
              >
                إعادة المحاولة
              </button>
            </div>
          ) : rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-body-sm text-muted-foreground">
              {isFetching ? "جاري البحث…" : "لا توجد نتائج مطابقة."}
            </p>
          ) : (
            <ul ref={listRef} className="py-2">
              {rows.map((row, index) => {
                const first = index === 0 || rows[index - 1]?.group !== row.group;
                return (
                  <li key={`${row.group}:${row.hit.id}`}>
                    {first && (
                      <p className="px-4 pb-1 pt-3 text-[11px] font-semibold tracking-wide text-text-muted">
                        {row.group}
                      </p>
                    )}
                    <button
                      data-active={index === cursor}
                      onMouseEnter={() => setCursor(index)}
                      onClick={() => {
                        onClose();
                        navigate({ to: row.hit.href } as never);
                      }}
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-2.5 text-right transition",
                        index === cursor ? "bg-surface-muted" : "hover:bg-surface-muted",
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-semibold">
                          {row.hit.title}
                        </span>
                        <span className="block truncate text-[12px] text-muted-foreground">
                          {row.hit.subtitle}
                        </span>
                      </span>
                      {index === cursor && (
                        <CornerDownLeft
                          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {ready && (data?.restricted?.length ?? 0) > 0 && (
            <p className="border-t border-border px-4 py-3 text-[11.5px] text-text-muted">
              أقسام مستثناة لعدم توفر الصلاحية: {data?.restricted.join("، ")}
            </p>
          )}
        </div>

        <div className="hidden items-center gap-4 border-t border-border px-4 py-2 text-[11px] text-text-muted sm:flex">
          <span>↑ ↓ للتنقل</span>
          <span>Enter للفتح</span>
          <span>Esc للإغلاق</span>
        </div>
      </div>
    </div>
  );
}
