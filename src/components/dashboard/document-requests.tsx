import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, Link2, Plus, Share2, Ban, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, canEdit } from "@/hooks/use-auth";
import { useSubscription } from "@/hooks/use-subscription";
import { fmtDateTime } from "@/lib/enums";
import {
  Badge,
  Btn,
  ConfirmDialog,
  FormField,
  IconBtn,
  Modal,
  SectionLoader,
  inputCls,
} from "@/lib/list-utils";
import { DOC_REQUEST_STATUS } from "@/lib/client-portal.shared";
import { createDocumentRequest, revokeDocumentRequest } from "@/lib/document-requests.functions";
import { describeMutationError } from "@/lib/subscription.shared";
import type { Tables } from "@/integrations/supabase/types";
import { errMsg } from "@/lib/errors";

const EVENT_LABEL: Record<string, string> = {
  created: "إنشاء الرابط",
  opened: "فتح الرابط من العميل",
  submitted: "إرسال المستندات",
  revoked: "إلغاء الرابط",
};

export function DocumentRequestsSection({ caseId }: { caseId: string }) {
  const { activeRole } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  type DocRequestRow = Tables<"document_requests"> & {
    creator: { full_name: string } | null;
  };
  const [revoking, setRevoking] = useState<DocRequestRow | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const revokeFn = useServerFn(revokeDocumentRequest);
  const { can: canUse, isLoading: planLoading } = useSubscription();
  const uploadAllowed = canUse("client_upload_enabled");

  const { data: rows, isLoading } = useQuery({
    queryKey: ["doc-requests", caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_requests")
        .select("*, creator:profiles!document_requests_created_by_fkey(full_name)")
        .eq("case_id", caseId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => revokeFn({ data: { id } }),
    onSuccess: () => {
      toast.success("تم إلغاء الرابط");
      qc.invalidateQueries({ queryKey: ["doc-requests", caseId] });
      setRevoking(null);
    },
    onError: (e: unknown) => toast.error("تعذّر الإلغاء", { description: errMsg(e) }),
  });

  return (
    <section className="mt-4 rounded-[var(--radius-l)] border border-border bg-surface p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold">طلبات المستندات</h3>
        {canEdit(activeRole) && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {!planLoading && !uploadAllowed && (
              <span className="text-[11.5px] text-text-muted" id="doc-request-gate-reason">
                رفع مستندات العملاء غير متاح في باقتك الحالية
              </span>
            )}
            <Btn
              size="sm"
              onClick={() => setOpen(true)}
              disabled={planLoading || !uploadAllowed}
              aria-describedby={
                !planLoading && !uploadAllowed ? "doc-request-gate-reason" : undefined
              }
            >
              <Plus className="ms-1 inline h-4 w-4" /> إنشاء طلب مستندات
            </Btn>
          </div>
        )}
      </div>

      {isLoading ? (
        <SectionLoader label="جاري تحميل الطلبات…" rows={3} />
      ) : (rows ?? []).length === 0 ? (
        <p className="py-6 text-center text-xs text-text-muted">
          لا توجد طلبات. أنشئ رابطاً آمناً يستخدم مرة واحدة لطلب مستندات من العميل.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows!.map((r: DocRequestRow) => (
            <li
              key={r.id}
              className="rounded-[var(--radius-m)] border border-border bg-surface-muted/50 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-sm">{r.title}</span>
                    <Badge
                      tone={
                        r.status === "completed"
                          ? "green"
                          : r.status === "active"
                            ? "gold"
                            : "muted"
                      }
                    >
                      {DOC_REQUEST_STATUS[r.status] ?? r.status}
                    </Badge>
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    أُنشئ {fmtDateTime(r.created_at)} · بواسطة {r.creator?.full_name ?? "—"}
                    {r.expires_at ? ` · ينتهي ${fmtDateTime(r.expires_at)}` : ""}
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    الملفات المرفوعة: {r.file_count}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg p-1.5 hover:bg-surface md:min-h-0 md:min-w-0"
                    title="السجل"
                  >
                    {expanded === r.id ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>
                  {r.status === "active" && canEdit(activeRole) && (
                    <IconBtn
                      tone="danger"
                      title="إلغاء الرابط"
                      aria-label="إلغاء الرابط"
                      loading={revoke.isPending && revoking?.id === r.id}
                      onClick={() => setRevoking(r)}
                    >
                      <Ban className="h-4 w-4" />
                    </IconBtn>
                  )}
                </div>
              </div>
              {expanded === r.id && <RequestLog requestId={r.id} />}
            </li>
          ))}
        </ul>
      )}

      <CreateRequestModal open={open} onClose={() => setOpen(false)} caseId={caseId} />
      <ConfirmDialog
        open={!!revoking}
        onClose={() => setRevoking(null)}
        onConfirm={() => revoking && revoke.mutate(revoking.id)}
        loading={revoke.isPending}
        title="إلغاء الرابط"
        message="سيتوقف الرابط فوراً ولن يتمكن العميل من رفع أي مستندات عبره."
        confirmLabel="إلغاء الرابط"
      />
    </section>
  );
}

function RequestLog({ requestId }: { requestId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["doc-request-events", requestId],
    queryFn: async () =>
      (
        await supabase
          .from("document_request_events")
          .select("*")
          .eq("request_id", requestId)
          .order("created_at", { ascending: false })
      ).data ?? [],
  });
  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="mb-2 text-[11px] font-semibold text-muted-foreground">سجل العمليات</div>
      {isLoading ? (
        <SectionLoader label="جاري تحميل السجل…" rows={2} />
      ) : (data ?? []).length === 0 ? (
        <p className="text-[11px] text-text-muted">لا يوجد سجل بعد.</p>
      ) : (
        <ul className="space-y-1">
          {data!.map((e: Tables<"document_request_events">) => (
            <li
              key={e.id}
              className="flex flex-wrap justify-between gap-2 text-[11px] text-muted-foreground"
            >
              <span>
                {EVENT_LABEL[e.event] ?? e.event}
                {(() => {
                  const files =
                    e.detail && typeof e.detail === "object" && !Array.isArray(e.detail)
                      ? (e.detail as { files?: number }).files
                      : undefined;
                  return files ? ` (${files} ملف)` : "";
                })()}
              </span>
              <span>{fmtDateTime(e.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CreateRequestModal({
  caseId,
  open,
  onClose,
}: {
  caseId: string;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const createFn = useServerFn(createDocumentRequest);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [itemsText, setItemsText] = useState("");
  const [expires, setExpires] = useState("");
  const [saving, setSaving] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  const reset = () => {
    setTitle("");
    setMessage("");
    setItemsText("");
    setExpires("");
    setLink(null);
  };

  const submit = async () => {
    if (title.trim().length < 2) return toast.error("أدخل عنواناً للطلب");
    setSaving(true);
    try {
      const items = itemsText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 20);
      const res = await createFn({
        data: {
          caseId,
          title: title.trim(),
          message: message.trim() || null,
          items,
          expiresAt: expires ? new Date(expires).toISOString() : null,
        },
      });
      setLink(`${window.location.origin}/upload/${res.token}`);
      qc.invalidateQueries({ queryKey: ["doc-requests", caseId] });
      toast.success("تم إنشاء رابط الرفع الآمن");
    } catch (e: unknown) {
      toast.error("تعذّر إنشاء الرابط", { description: describeMutationError(errMsg(e)) });
    } finally {
      setSaving(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("تم نسخ الرابط");
    } catch {
      toast.error("تعذّر النسخ، انسخ الرابط يدوياً");
    }
  };

  const share = async () => {
    if (!link) return;
    const text = `مرحباً، يرجى رفع المستندات المطلوبة عبر الرابط الآمن التالي:\n${link}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "طلب مستندات", text });
        return;
      } catch {
        /* cancelled */
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title={link ? "الرابط جاهز" : "إنشاء طلب مستندات من العميل"}
      size="lg"
    >
      {link ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            هذا الرابط يعمل <strong>مرة واحدة فقط</strong> ولن يظهر مجدداً. انسخه الآن وأرسله
            للعميل.
          </p>
          <div className="flex items-center gap-2 rounded-[var(--radius-m)] border border-border bg-surface-muted p-3">
            <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 break-all text-xs" dir="ltr">
              {link}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Btn onClick={copy}>
              <Copy className="ms-1 inline h-4 w-4" /> نسخ الرابط
            </Btn>
            <Btn variant="outline" onClick={share}>
              <Share2 className="ms-1 inline h-4 w-4" /> مشاركة
            </Btn>
            <div className="flex-1" />
            <Btn
              variant="ghost"
              onClick={() => {
                reset();
                onClose();
              }}
            >
              إغلاق
            </Btn>
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-4">
            <FormField label="عنوان الطلب *">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={inputCls}
                placeholder="مستندات مطلوبة لدعوى المطالبة"
              />
            </FormField>
            <FormField label="رسالة للعميل">
              <textarea
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className={inputCls}
                placeholder="يرجى رفع المستندات التالية في أقرب وقت."
              />
            </FormField>
            <FormField label="المستندات المطلوبة" hint="اكتب كل مستند في سطر مستقل">
              <textarea
                rows={4}
                value={itemsText}
                onChange={(e) => setItemsText(e.target.value)}
                className={inputCls}
                placeholder={"صورة الهوية\nالعقد\nالفواتير"}
              />
            </FormField>

            <p className="rounded-xl border border-border/60 bg-muted/40 p-3 text-xs leading-6 text-muted-foreground">
              تُحفظ كل الملفات التي يرفعها العميل في خزينة مِهلة المشفّرة الخاصة بالمكتب (تشفير
              AES-256-GCM، حاوية تخزين خاصة، روابط عرض موقّعة قصيرة الصلاحية، وسجل تدقيق لكل
              عرض وتنزيل وطباعة). لا يمكن لأي طرف خارج مكتبك الوصول إليها.
            </p>

            <FormField label="تاريخ الانتهاء (اختياري)">
              <input
                type="datetime-local"
                value={expires}
                onChange={(e) => setExpires(e.target.value)}
                className={inputCls}
              />
            </FormField>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Btn
              variant="outline"
              onClick={() => {
                reset();
                onClose();
              }}
              disabled={saving}
            >
              إلغاء
            </Btn>
            <Btn onClick={submit} loading={saving}>
              {saving ? "جاري إنشاء الرابط…" : "إنشاء الرابط"}
            </Btn>
          </div>
        </>
      )}
    </Modal>
  );
}
