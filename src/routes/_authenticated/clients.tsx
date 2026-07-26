import { createFileRoute } from "@tanstack/react-router";
import { DashboardShell } from "@/components/dashboard/shell";

export const Route = createFileRoute("/_authenticated/clients")({
  component: Page,
});

function Page() {
  return (
    <DashboardShell title="العملاء">
      <div className="rounded-2xl border border-[#123C32]/10 bg-white p-10 text-center text-[#123C32]/60">
        قسم "العملاء" قيد التطوير. سيتم إضافة الوظائف الكاملة قريباً.
      </div>
    </DashboardShell>
  );
}
