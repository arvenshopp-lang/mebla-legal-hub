import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Badge, EmptyState, ErrorBlock, LoadingBlock } from "@/lib/list-utils";
import { fmtDateTime } from "@/lib/enums";
import { listMarketingProviders } from "@/lib/marketing.functions";
import type { MarketingProviderStatus } from "@/lib/marketing.shared";

export function ProvidersPanel() {
  const listFn = useServerFn(listMarketingProviders);
  const query = useQuery({
    queryKey: ["marketing-providers"],
    queryFn: () => listFn({ data: {} }),
  });

  if (query.isLoading) return <LoadingBlock rows={4} cols={4} />;
  if (query.isError) return <ErrorBlock message="تعذّر تحميل حالة مزوّدي التسويق." />;
  const providers = query.data?.providers ?? [];
  if (providers.length === 0)
    return <EmptyState title="لا توجد مزوّدات مسجّلة" hint="أضف مزوّدي القياس والإعلانات من مركز التكاملات." />;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {providers.map((p: MarketingProviderStatus) => (
        <div key={p.provider_key} className="surface-card p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-body-sm font-semibold">{p.display_name_ar}</p>
              <p className="text-caption truncate">{p.category_label}</p>
            </div>
            <Badge tone={p.configured && p.is_enabled ? "green" : p.configured ? "warn" : "muted"}>
              {p.configured ? (p.is_enabled ? "مفعّل" : "مربوط وغير مفعّل") : "غير مربوط"}
            </Badge>
          </div>
          <dl className="mt-3 space-y-1.5 text-[12px] text-muted-foreground">
            <div className="flex justify-between gap-2">
              <dt>الحالة</dt>
              <dd className="font-medium text-foreground">{p.status}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>البيئة</dt>
              <dd className="font-medium text-foreground">{p.environment ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>آخر فحص</dt>
              <dd className="font-medium text-foreground">{p.last_checked_at ? fmtDateTime(p.last_checked_at) : "لم يُفحص بعد"}</dd>
            </div>
          </dl>
        </div>
      ))}
    </div>
  );
}
