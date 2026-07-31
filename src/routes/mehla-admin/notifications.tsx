import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { AdminShell } from "@/components/admin/shell";
import { supabase } from "@/integrations/supabase/client";
import { Badge, Btn, EmptyState, FormField, LoadingBlock, SectionCard, inputCls } from "@/lib/list-utils";
import { fmtDateTime } from "@/lib/enums";
import { listBroadcasts, sendBroadcast } from "@/lib/admin-ops.functions";

export const Route = createFileRoute("/mehla-admin/notifications")({
  head: () => ({ meta: [{ title: "الإشعارات · إدارة مِهلة" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: NotificationsPage,
});

const AUDIENCES = [
  { value: "all_users", label: "كل مستخدمي المنصة" },
  { value: "subscribers", label: "أصحاب الاشتراكات النشطة" },
  { value: "expired", label: "بدون اشتراك نشط" },
  { value: "organization", label: "مكتب محدد" },
  { value: "user", label: "مستخدم محدد" },
] as const;

const AUDIENCE_LABELS: Record<string, string> = Object.fromEntries(AUDIENCES.map((a) => [a.value, a.label]));

function NotificationsPage() {
  const qc = useQueryClient();
  const [audience, setAudience] = useState<(typeof AUDIENCES)[number]["value"]>("all_users");
  const [orgId, setOrgId] = useState("");
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const { data: orgs } = useQuery({
    queryKey: ["admin-orgs-options"],
    queryFn: async () =>
      (await supabase.from("organizations").select("id, name").order("name").limit(500)).data ?? [],
  });

  const listFn = useServerFn(listBroadcasts);
  const history = useQuery({ queryKey: ["admin-broadcasts"], queryFn: () => listFn({ data: undefined }) });

  const sendFn = useServerFn(sendBroadcast);
  const send = useMutation({
    mutationFn: () =>
      sendFn({
        data: {
          audience,
          targetOrganizationId: audience === "organization" ? orgId : undefined,
          targetUserEmail: audience === "user" ? email : undefined,
          title,
          body,
          inApp: true,
        },
      }),
    onSuccess: (r) => {
      toast.success(`تم إرسال الإشعار إلى ${r.recipients} مستخدماً.`);
      setTitle("");
      setBody("");
      qc.invalidateQueries({ queryKey: ["admin-broadcasts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AdminShell title="الإشعارات" description="إشعارات داخلية موجّهة لمستخدمي المنصة داخل لوحاتهم.">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <SectionCard title="إشعار جديد">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              send.mutate();
            }}
          >
            <FormField label="الجهة المستهدفة" required>
              <select
                className={inputCls}
                value={audience}
                onChange={(e) => setAudience(e.target.value as typeof audience)}
              >
                {AUDIENCES.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
            </FormField>

            {audience === "organization" && (
              <FormField label="المكتب" required>
                <select className={inputCls} value={orgId} onChange={(e) => setOrgId(e.target.value)} required>
                  <option value="">اختر المكتب…</option>
                  {(orgs ?? []).map((o: { id: string; name: string }) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </FormField>
            )}

            {audience === "user" && (
              <FormField label="بريد المستخدم" required>
                <input
                  type="email"
                  className={inputCls}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </FormField>
            )}

            <FormField label="عنوان الإشعار" required>
              <input
                className={inputCls}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={160}
                required
              />
            </FormField>

            <FormField label="نص الإشعار" required hint="نص واضح ومهني، يظهر داخل مركز الإشعارات للمستخدم.">
              <textarea
                className={`${inputCls} min-h-32`}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={2000}
                required
              />
            </FormField>

            <Btn
              type="submit"
              loading={send.isPending}
              disabled={title.trim().length < 3 || body.trim().length < 5}
              className="w-full"
            >
              <Send className="h-4 w-4" aria-hidden /> إرسال الإشعار
            </Btn>
          </form>
        </SectionCard>

        <SectionCard title="سجل الإشعارات المُرسلة">
          {history.isLoading ? (
            <LoadingBlock rows={4} cols={2} />
          ) : (history.data?.broadcasts.length ?? 0) === 0 ? (
            <EmptyState title="لم تُرسل إشعارات بعد" hint="سيظهر هنا كل إشعار أرسلته للمشتركين." />
          ) : (
            <ul className="space-y-3">
              {history.data!.broadcasts.map((b) => (
                <li key={b.id} className="rounded-[var(--radius-m)] border border-border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">{b.title}</p>
                    <Badge tone="info">{AUDIENCE_LABELS[b.audience] ?? b.audience}</Badge>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-body-sm text-muted-foreground">{b.body}</p>
                  <p className="text-caption mt-2">
                    {b.recipients_count} مستلماً · {b.sent_by_name ?? "—"} · {fmtDateTime(b.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </AdminShell>
  );
}
