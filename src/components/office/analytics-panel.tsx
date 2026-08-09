/** إحصاءات الصفحة العامة — عدادات مجمّعة فقط، بلا أي بيانات تعريف للزائر. */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ErrorBlock, LoadingBlock, inputCls } from "@/lib/list-utils";
import { OFFICE_EVENT_LABELS, type OfficeEventKind } from "@/lib/office-page.shared";
import { getOfficePageAnalytics } from "@/lib/office-page.functions";
import { errMsg } from "@/lib/errors";

const CHANNEL_LABELS: Record<string, string> = {
  direct: "زيارة مباشرة",
  instagram: "إنستقرام",
  tiktok: "تيك توك",
  x: "منصة X",
  google: "بحث Google",
  qr: "رمز QR",
  campaign: "حملة تسويقية",
};

export function OfficeAnalyticsPanel({ organizationId }: { organizationId: string }) {
  const [days, setDays] = useState(30);
  const query = useQuery({
    queryKey: ["office-analytics", organizationId, days],
    queryFn: () => getOfficePageAnalytics({ data: { organizationId, days } }),
  });

  if (query.isPending) return <LoadingBlock rows={4} cols={3} />;
  if (query.isError) return <ErrorBlock message={errMsg(query.error)} />;

  const data = query.data;
  const maxDaily = Math.max(1, ...data.daily.map((d) => d.views));
  const conversion =
    data.totals.view > 0 ? Math.round((data.totals.lead / data.totals.view) * 1000) / 10 : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="range" className="text-body-sm">
          الفترة
        </label>
        <select
          id="range"
          className={`${inputCls} sm:max-w-40`}
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          <option value={7}>آخر 7 أيام</option>
          <option value={30}>آخر 30 يوماً</option>
          <option value={90}>آخر 90 يوماً</option>
        </select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(Object.keys(OFFICE_EVENT_LABELS) as OfficeEventKind[]).map((kind) => (
          <div key={kind} className="surface-card p-4">
            <p className="text-caption text-muted-foreground">{OFFICE_EVENT_LABELS[kind]}</p>
            <p className="mt-1 text-2xl font-bold">{(data.totals[kind] ?? 0).toLocaleString("ar-SA")}</p>
          </div>
        ))}
        <div className="surface-card p-4">
          <p className="text-caption text-muted-foreground">نسبة التحويل من مشاهدة إلى طلب</p>
          <p className="mt-1 text-2xl font-bold">{conversion}%</p>
        </div>
        <div className="surface-card p-4">
          <p className="text-caption text-muted-foreground">إجمالي الطلبات (كل الفترات)</p>
          <p className="mt-1 text-2xl font-bold">{data.leadsTotal.toLocaleString("ar-SA")}</p>
        </div>
        <div className="surface-card p-4">
          <p className="text-caption text-muted-foreground">طلبات تحوّلت إلى عملاء</p>
          <p className="mt-1 text-2xl font-bold">{data.convertedTotal.toLocaleString("ar-SA")}</p>
        </div>
      </div>

      <section className="surface-card p-5">
        <h2 className="text-base font-bold">المشاهدات والطلبات يومياً</h2>
        {data.daily.length === 0 ? (
          <p className="mt-3 text-body-sm text-muted-foreground">لا توجد بيانات في هذه الفترة.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {data.daily.map((row) => (
              <li key={row.day} className="flex items-center gap-3 text-caption">
                <span className="w-24 shrink-0 text-muted-foreground" dir="ltr">
                  {row.day}
                </span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-muted">
                  <span
                    className="block h-full rounded-full bg-primary"
                    style={{ width: `${(row.views / maxDaily) * 100}%` }}
                  />
                </span>
                <span className="w-28 shrink-0 text-left" dir="rtl">
                  {row.views} مشاهدة · {row.leads} طلب
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="surface-card p-5">
        <h2 className="text-base font-bold">حسب القناة</h2>
        {data.byChannel.length === 0 ? (
          <p className="mt-3 text-body-sm text-muted-foreground">لا توجد بيانات في هذه الفترة.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-body-sm">
            {data.byChannel.map((row) => (
              <li key={row.channel} className="flex items-center justify-between gap-3">
                <span>{CHANNEL_LABELS[row.channel] ?? row.channel}</span>
                <span className="font-semibold">{row.count.toLocaleString("ar-SA")}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
