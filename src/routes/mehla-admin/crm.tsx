/**
 * مركز علاقات العملاء (CRM) في لوحة مالك المنصة: نظرة عامة، محتملون، شركات،
 * جهات اتصال، صفقات، مراحل خط البيع، وأنشطة.
 */
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/lib/list-utils";
import { usePlatformAdmin } from "@/hooks/use-platform-admin";
import { OverviewPanel } from "@/components/admin/crm/overview-panel";
import { LeadsPanel } from "@/components/admin/crm/leads-panel";
import { CompaniesPanel } from "@/components/admin/crm/companies-panel";
import { ContactsPanel } from "@/components/admin/crm/contacts-panel";
import { DealsPanel } from "@/components/admin/crm/deals-panel";
import { StagesPanel } from "@/components/admin/crm/stages-panel";
import { ActivitiesPanel } from "@/components/admin/crm/activities-panel";

export const Route = createFileRoute("/mehla-admin/crm")({ component: CrmPage });

const TABS = [
  { id: "overview", label: "نظرة عامة" },
  { id: "leads", label: "العملاء المحتملون" },
  { id: "companies", label: "الشركات" },
  { id: "contacts", label: "جهات الاتصال" },
  { id: "deals", label: "الصفقات" },
  { id: "stages", label: "مراحل خط البيع" },
  { id: "activities", label: "الأنشطة" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function CrmPage() {
  const { can } = usePlatformAdmin();
  const [tab, setTab] = useState<TabId>("overview");

  if (!can("crm.read")) {
    return (
      <div>
        <PageHeader title="علاقات العملاء" />
        <p className="surface-card p-5 text-body-sm text-muted-foreground">
          لا تملك صلاحية «مشاهدة CRM». تواصل مع مالك المنصة لمنحك الصلاحية.
        </p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="علاقات العملاء (CRM)"
        description="متابعة العملاء المحتملين والشركات والصفقات وأنشطة فريق المبيعات."
      />

      <div className="mb-5 overflow-x-auto">
        <div role="tablist" aria-label="أقسام CRM" className="flex w-max gap-1 rounded-xl border border-border bg-surface-2 p-1">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={`rounded-lg px-3.5 py-2 text-body-sm font-semibold transition-colors ${
                tab === item.id ? "bg-[var(--brand-green)] text-white" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "overview" && <OverviewPanel />}
      {tab === "leads" && <LeadsPanel />}
      {tab === "companies" && <CompaniesPanel />}
      {tab === "contacts" && <ContactsPanel />}
      {tab === "deals" && <DealsPanel />}
      {tab === "stages" && <StagesPanel />}
      {tab === "activities" && <ActivitiesPanel />}
    </div>
  );
}
