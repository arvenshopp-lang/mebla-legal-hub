import { createFileRoute } from "@tanstack/react-router";
import { DashboardShell } from "@/components/dashboard/shell";

export const Route = createFileRoute("/_authenticated/tasks")({
  component: Page,
});

function Page() {
  return (
    <DashboardShell title="المهام">
      <div className="rounded-2xl border border-[#123C32]/10 bg-white p-10 text-center text-[#123C32]/60">
        قسم "المهام" قيد التطوير. سيتم إضافة الوظائف الكاملة قريباً.
      </div>
    </DashboardShell>
  );
}
