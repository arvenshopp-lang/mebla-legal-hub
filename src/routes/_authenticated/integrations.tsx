import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { MessageCircle, ShieldCheck, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { DashboardShell } from "@/components/dashboard/shell";
import { Badge, Btn, EmptyState, ErrorBlock, SectionCard, SectionLoader } from "@/lib/list-utils";
import { getOfficeIntegrationsStatus } from "@/lib/integrations/office-integrations.functions";

export const Route = createFileRoute("/_authenticated/integrations")({
  component: IntegrationsPage,
  head: () => ({
    meta: [
      { title: "التكاملات وقنوات التواصل | مِهلة" },
      {
        name: "description",
        content: "حالة قناة واتساب الرسمية وتفضيلات إشعارات الموكلين في مكتبك.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "التكاملات وقنوات التواصل | مِهلة" },
      {
        property: "og:description",
        content: "تحكم في تفعيل إشعارات واتساب لموكلي المكتب وتابع جاهزية القناة.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type ClientPrefRow = {
  id: string;
  full_name: string | null;
  company_name: string | null;
  phone: string | null;
  whatsapp_enabled: boolean;
};

const CAN_MANAGE = ["owner", "admin", "lawyer"] as const;

function IntegrationsPage() {
  const { activeOrgId, activeRole } = useAuth();
  const qc = useQueryClient();
  const fetchStatus = useServerFn(getOfficeIntegrationsStatus);
  const canManage = !!activeRole && CAN_MANAGE.includes(activeRole as (typeof CAN_MANAGE)[number]);
  const [savingId, setSavingId] = useState<string | null>(null);

  const channel = useQuery({
    queryKey: ["office-integrations-status", activeOrgId],
    enabled: !!activeOrgId,
    staleTime: 60_000,
    queryFn: () => fetchStatus({ data: { organizationId: activeOrgId! } }),
  });

  const clients = useQuery({
    queryKey: ["whatsapp-client-prefs", activeOrgId],
    enabled: !!activeOrgId,
    queryFn: async (): Promise<ClientPrefRow[]> => {
      const [{ data: rows, error }, { data: prefs }] = await Promise.all([
        supabase
          .from("clients")
          .select("id, full_name, company_name, phone")
          .eq("organization_id", activeOrgId!)
          .not("phone", "is", null)
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("notification_client_preferences")
          .select("client_id, whatsapp_enabled")
          .eq("organization_id", activeOrgId!),
      ]);
      if (error) throw new Error(error.message);
      const map = new Map((prefs ?? []).map((p) => [p.client_id, p.whatsapp_enabled]));
      return (rows ?? []).map((c) => ({
        ...c,
        // الافتراض الآمن: القناة مفعّلة للموكل ما لم يُوقفها المكتب صريحاً.
        whatsapp_enabled: map.get(c.id) ?? true,
      }));
    },
  });

  const toggleClient = async (row: ClientPrefRow, next: boolean) => {
    if (!activeOrgId) return;
    setSavingId(row.id);
    const { error } = await supabase.from("notification_client_preferences").upsert(
      {
        organization_id: activeOrgId,
        client_id: row.id,
        whatsapp_enabled: next,
      },
      { onConflict: "organization_id,client_id" },
    );
    setSavingId(null);
    if (error) {
      toast.error("تعذّر تحديث تفضيل الموكل", {
        description: "تحقق من صلاحيتك ثم أعد المحاولة.",
      });
      return;
    }
    toast.success(next ? "تم تفعيل إشعارات واتساب للموكل" : "تم إيقاف إشعارات واتساب للموكل");
    qc.invalidateQueries({ queryKey: ["whatsapp-client-prefs", activeOrgId] });
  };

  const status = channel.data?.whatsapp ?? null;

  return (
    <DashboardShell
      title="التكاملات وقنوات التواصل"
      description="جاهزية قناة واتساب الرسمية وتفضيلات إشعار الموكلين"
    >
      <SectionCard
        title="واتساب الرسمي (WABA)"
        actions={
          status ? (
            <Badge tone={status.ready ? "green" : status.statusLabel === "اتصال متعطّل" ? "red" : "amber"}>
              {status.statusLabel}
            </Badge>
          ) : null
        }
      >
        {channel.isLoading ? (
          <SectionLoader label="جاري قراءة حالة القناة…" />
        ) : channel.error ? (
          <ErrorBlock message="تعذّر قراءة حالة قناة واتساب. حاول تحديث الصفحة." />
        ) : (
          <div className="space-y-3">
            <p className="flex items-start gap-2 text-[13.5px] text-muted-foreground">
              <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              <span>
                ترسل المنصة تحديثات الجلسات والمهل لموكلي المكتب عبر قوالب واتساب الرسمية المعتمدة
                فقط، ويُسجَّل كل إرسال في سجل التدقيق.
              </span>
            </p>
            <dl className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[var(--radius-m)] border border-border bg-surface-muted p-3">
                <dt className="text-[12px] text-muted-foreground">أرقام الإرسال المعتمدة</dt>
                <dd className="mt-1 font-display text-[20px] font-bold tabular-nums">
                  {status?.devicesCount ?? 0}
                </dd>
              </div>
              <div className="rounded-[var(--radius-m)] border border-border bg-surface-muted p-3">
                <dt className="text-[12px] text-muted-foreground">القوالب الرسمية</dt>
                <dd className="mt-1 font-display text-[20px] font-bold tabular-nums">
                  {status?.templatesCount ?? 0}
                </dd>
              </div>
              <div className="rounded-[var(--radius-m)] border border-border bg-surface-muted p-3">
                <dt className="text-[12px] text-muted-foreground">آخر فحص للقناة</dt>
                <dd className="mt-1 text-[13px] font-semibold">
                  {status?.lastCheckedAt
                    ? new Date(status.lastCheckedAt).toLocaleString("ar-SA", {
                        timeZone: "Asia/Riyadh",
                      })
                    : "لم يُنفَّذ بعد"}
                </dd>
              </div>
            </dl>
            {status?.reason && (
              <p className="flex items-start gap-2 rounded-[var(--radius-m)] border border-warning/40 bg-warning/10 p-3 text-[13px]">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
                <span>
                  {status.reason} تهيئة القناة تتم من إدارة المنصة؛ يمكنك ضبط تفضيلات الموكلين الآن
                  وسيبدأ الإرسال تلقائياً بعد جاهزية القناة.
                </span>
              </p>
            )}
          </div>
        )}
      </SectionCard>

      <SectionCard
        className="mt-4"
        title="إشعارات واتساب للموكلين"
        actions={
          <Link to="/clients">
            <Btn variant="ghost" size="sm" className="min-h-11">
              إدارة العملاء
            </Btn>
          </Link>
        }
      >
        {!canManage && (
          <p className="mb-3 flex items-start gap-2 rounded-[var(--radius-m)] bg-surface-muted p-3 text-[13px] text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>التعديل متاح لمالك المكتب والمدير والمحامي فقط.</span>
          </p>
        )}
        {clients.isLoading ? (
          <SectionLoader label="جاري تحميل الموكلين…" />
        ) : clients.error ? (
          <ErrorBlock message="تعذّر تحميل قائمة الموكلين. حاول تحديث الصفحة." />
        ) : (clients.data ?? []).length === 0 ? (
          <EmptyState
            title="لا يوجد موكلون بأرقام جوال"
            hint="أضف رقم جوال للموكل حتى تتمكن من إرسال إشعارات واتساب."
          />
        ) : (
          <ul className="divide-y divide-border">
            {clients.data!.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold">
                    {row.full_name || row.company_name || "—"}
                  </p>
                  <p className="text-caption truncate" dir="ltr">
                    {row.phone}
                  </p>
                </div>
                <label className="flex shrink-0 items-center gap-2 text-[13px]">
                  <span className="text-muted-foreground">إشعارات واتساب</span>
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-[var(--primary)]"
                    checked={row.whatsapp_enabled}
                    disabled={!canManage || savingId === row.id}
                    onChange={(e) => toggleClient(row, e.target.checked)}
                    aria-label={`إشعارات واتساب لـ ${row.full_name || row.company_name || "الموكل"}`}
                  />
                </label>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </DashboardShell>
  );
}
