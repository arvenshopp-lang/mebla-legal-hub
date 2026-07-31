import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminShell } from "@/components/admin/shell";
import { supabase } from "@/integrations/supabase/client";
import {
  Badge,
  DataCard,
  EmptyState,
  LoadingBlock,
  PageToolbar,
  Td,
  Th,
  inputCls,
  useDebounced,
} from "@/lib/list-utils";
import { fmtDateTime } from "@/lib/enums";

export const Route = createFileRoute("/mehla-admin/logs")({
  head: () => ({ meta: [{ title: "سجل التدقيق · إدارة مِهلة" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: LogsPage,
});

const ACTION_LABELS: Record<string, string> = {
  "subscription.activate": "تفعيل اشتراك",
  "subscription.cancel": "إلغاء اشتراك",
  "staff.create": "إضافة موظف",
  "staff.update": "تعديل موظف",
  "ticket.reply": "رد على تذكرة",
  "plan.update": "تعديل باقة",
  "settings.update": "تعديل إعدادات",
};

const ENTITY_LABELS: Record<string, string> = {
  subscription: "اشتراك",
  staff: "موظف",
  ticket: "تذكرة",
  plan: "باقة",
  settings: "إعدادات",
};

function LogsPage() {
  const [search, setSearch] = useState("");
  const [entity, setEntity] = useState("all");
  const debounced = useDebounced(search);

  const { data: logs, isLoading, isFetching } = useQuery({
    queryKey: ["admin-logs", debounced, entity],
    queryFn: async () => {
      let q = supabase.from("admin_audit_logs").select("*").order("created_at", { ascending: false }).limit(300);
      if (entity !== "all") q = q.eq("entity_type", entity);
      const term = debounced.trim().replace(/[,()]/g, "");
      if (term) q = q.ilike("actor_email", `%${term}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <AdminShell
      title="سجل التدقيق"
      description="سجل غير قابل للتعديل لكل عملية إدارية تمت داخل لوحة إدارة المنصة."
    >
      <PageToolbar
        search={search}
        setSearch={setSearch}
        placeholder="بحث ببريد المنفّذ…"
        searching={isFetching && !isLoading}
        filters={
          <select
            value={entity}
            onChange={(e) => setEntity(e.target.value)}
            aria-label="نوع العنصر"
            className={`${inputCls} w-auto min-w-[150px]`}
          >
            <option value="all">كل الأنواع</option>
            {Object.entries(ENTITY_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        }
      />

      {isLoading ? (
        <LoadingBlock rows={8} cols={4} />
      ) : (logs ?? []).length === 0 ? (
        <EmptyState title="لا توجد سجلات" hint="ستظهر هنا كل العمليات الإدارية فور تنفيذها." />
      ) : (
        <DataCard>
          <table className="w-full min-w-[720px] text-right">
            <thead>
              <tr>
                <Th>التاريخ</Th>
                <Th>المنفّذ</Th>
                <Th>العملية</Th>
                <Th>النوع</Th>
                <Th>التفاصيل</Th>
                <Th>IP</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {logs!.map((l) => (
                <tr key={l.id} className="hover:bg-surface-muted/60">
                  <Td className="whitespace-nowrap text-[12px] text-muted-foreground">{fmtDateTime(l.created_at)}</Td>
                  <Td className="text-left text-[12px]">{l.actor_email ?? "—"}</Td>
                  <Td>
                    <Badge tone="info">{ACTION_LABELS[l.action] ?? l.action}</Badge>
                  </Td>
                  <Td>{ENTITY_LABELS[l.entity_type] ?? l.entity_type}</Td>
                  <Td className="max-w-[280px] truncate text-[12px] text-muted-foreground" title={l.description ?? ""}>
                    {l.description ?? "—"}
                  </Td>
                  <Td className="text-left text-[12px] text-muted-foreground">{l.ip ?? "—"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataCard>
      )}
    </AdminShell>
  );
}