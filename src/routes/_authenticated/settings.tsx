import { createFileRoute } from "@tanstack/react-router";
import { DashboardShell } from "@/components/dashboard/shell";

export const Route = createFileRoute("/_authenticated/settings")({
  component: Page,
});

function Page() {
  return (
    <DashboardShell title="الإعدادات">
      <div className="rounded-2xl border border-[#123C32]/10 bg-white p-10 text-center text-[#123C32]/60">
        قسم "الإعدادات" قيد التطوير. سيتم إضافة الوظائف الكاملة قريباً.
      </div>
    </DashboardShell>
  );
}
