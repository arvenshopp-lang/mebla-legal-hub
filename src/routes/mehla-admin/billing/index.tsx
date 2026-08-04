import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AdminShell } from "@/components/admin/shell";
import { EmptyState } from "@/lib/list-utils";
import { billingListSettings } from "@/lib/billing/billing.functions";
import { usePlatformAdmin } from "@/hooks/use-platform-admin";
import { InvoicesPanel } from "@/components/admin/billing/invoices-panel";
import { PaymentsPanel } from "@/components/admin/billing/payments-panel";
import { RefundsPanel } from "@/components/admin/billing/refunds-panel";
import { ReconciliationPanel } from "@/components/admin/billing/reconciliation-panel";
import { WebhooksPanel } from "@/components/admin/billing/webhooks-panel";
import { SettingsPanel } from "@/components/admin/billing/settings-panel";
import { ReportsPanel } from "@/components/admin/billing/reports-panel";

type TabKey = "invoices" | "payments" | "refunds" | "reconciliation" | "webhooks" | "reports" | "settings";

const TABS: { key: TabKey; label: string }[] = [
  { key: "invoices", label: "الفواتير" },
  { key: "payments", label: "المدفوعات" },
  { key: "refunds", label: "الاستردادات" },
  { key: "reconciliation", label: "المطابقة والفترات" },
  { key: "webhooks", label: "الرسائل الواردة" },
  { key: "reports", label: "التقارير" },
  { key: "settings", label: "الإعدادات والمزوّدون" },
];

const isTab = (value: unknown): value is TabKey => TABS.some((tab) => tab.key === value);

export const Route = createFileRoute("/mehla-admin/billing/")({
  head: () => ({
    meta: [
      { title: "المركز المالي · إدارة مِهلة" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({ tab: isTab(search.tab) ? search.tab : ("invoices" as TabKey) }),
  component: BillingPage,
});

function BillingPage() {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { can } = usePlatformAdmin();
  const settingsFn = useServerFn(billingListSettings);
  const [fallbackRate] = useState(15);

  const settings = useQuery({
    queryKey: ["billing-settings"],
    queryFn: () => settingsFn({ data: undefined as never }),
    enabled: can("billing.read"),
  });

  if (!can("billing.read")) {
    return (
      <AdminShell title="المركز المالي">
        <EmptyState title="لا تملك صلاحية الوصول" hint="الوصول إلى المركز المالي يتطلب صلاحية «مشاهدة المركز المالي»." />
      </AdminShell>
    );
  }

  const defaultTaxRate = settings.data?.tax.defaultRate ?? fallbackRate;

  return (
    <AdminShell
      title="المركز المالي"
      description="الفواتير والمدفوعات والاستردادات والمطابقة البنكية ومزودو الدفع — بيانات فعلية بسجل تدقيق كامل."
    >
      <div className="mb-5 -mx-1 overflow-x-auto px-1">
        <nav className="flex min-w-max gap-1 rounded-[var(--radius-m)] bg-surface-muted p-1" aria-label="أقسام المركز المالي">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              aria-current={tab === item.key ? "page" : undefined}
              onClick={() => navigate({ search: { tab: item.key }, replace: true })}
              className={`min-h-10 whitespace-nowrap rounded-[var(--radius-s)] px-3.5 text-body-sm transition ${
                tab === item.key ? "bg-surface font-semibold text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      {tab === "invoices" && <InvoicesPanel defaultTaxRate={defaultTaxRate} />}
      {tab === "payments" && <PaymentsPanel />}
      {tab === "refunds" && <RefundsPanel />}
      {tab === "reconciliation" && <ReconciliationPanel />}
      {tab === "webhooks" && <WebhooksPanel />}
      {tab === "reports" && (can("billing.view_reports") ? <ReportsPanel /> : <EmptyState title="التقارير غير متاحة لصلاحيتك" />)}
      {tab === "settings" && <SettingsPanel />}
    </AdminShell>
  );
}
