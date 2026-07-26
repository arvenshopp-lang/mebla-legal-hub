import { createFileRoute } from "@tanstack/react-router";
import { DashboardShell } from "@/components/dashboard/shell";

const TITLES: Record<string, string> = {
  cases: "القضايا",
  hearings: "الجلسات",
  deadlines: "المهل",
  tasks: "المهام",
  clients: "العملاء",
  documents: "المستندات",
  settings: "الإعدادات",
};

export const Route = createFileRoute("/_authenticated/cases")({
  component: () => null,
});
