import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ChevronRight,
  Inbox,
  PenSquare,
  PlugZap,
  Search,
  Star,
  Settings2,
  Tag,
  Trash2,
} from "lucide-react";
import { AdminShell } from "@/components/admin/shell";
import {
  Badge,
  Btn,
  ConfirmDialog,
  EmptyState,
  FormField,
  IconBtn,
  LoadingBlock,
  Modal,
  SectionCard,
  inputCls,
} from "@/lib/list-utils";
import { fmtDateTime } from "@/lib/enums";
import { usePlatformAdmin } from "@/hooks/use-platform-admin";
import {
  ComposeModal,
  type ComposePayload,
  type ComposeSeed,
} from "@/components/admin/mail/compose-modal";
import { ThreadView } from "@/components/admin/mail/thread-view";
import { MailIntegrationPanel } from "@/components/admin/mail/integration-panel";
import { EMAIL_FOLDERS, type EmailFolder } from "@/lib/email/email.shared";
import type { AttachmentMeta } from "@/lib/email/attachments.shared";
import {
  addMailNote,
  checkMailRecipients,
  deleteMailAttachment,
  deleteMailLabel,
  discardMailDraft,
  getMailAttachmentUrl,
  getMailThread,
  getMailWorkspace,
  liftMailRecipientBlock,
  listMailThreads,
  retryMailMessage,
  saveMailDraft,
  saveMailLabel,
  sendMailMessage,
  updateMailThread,
  updateMailbox,
  uploadMailAttachment,
} from "@/lib/email/email.functions";

export const Route = createFileRoute("/mehla-admin/mail")({
  validateSearch: (search: Record<string, unknown>): { thread?: string } => ({
    thread: typeof search["thread"] === "string" ? search["thread"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "مركز البريد · إدارة مِهلة" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: MailWorkspacePage,
});

function MailWorkspacePage() {
  const qc = useQueryClient();
  const { can } = usePlatformAdmin();
  const { thread: threadFromLink } = Route.useSearch();

  const workspaceFn = useServerFn(getMailWorkspace);
  const workspace = useQuery({
    queryKey: ["mail-workspace"],
    queryFn: () => workspaceFn({ data: undefined }),
  });

  const [mailboxId, setMailboxId] = useState<string | null>(null);
  const [folder, setFolder] = useState<EmailFolder>("inbox");
  const [search, setSearch] = useState("");
  const [starredOnly, setStarredOnly] = useState(false);
  const [labelId, setLabelId] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(threadFromLink ?? null);
  const [compose, setCompose] = useState<ComposeSeed | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [integrationOpen, setIntegrationOpen] = useState(false);

  const mailboxes = workspace.data?.mailboxes ?? [];
  const activeMailboxId = mailboxId ?? mailboxes.find((m) => m.type === "human")?.id ?? null;
  const activeMailbox = mailboxes.find((m) => m.id === activeMailboxId) ?? null;
  const canSend = Boolean(workspace.data?.canSend);
  const canManage = Boolean(workspace.data?.canManage);
  const canAssign = can("email.assign");

  const listFn = useServerFn(listMailThreads);
  const threads = useQuery({
    queryKey: ["mail-threads", activeMailboxId, folder, search, starredOnly, labelId],
    enabled: Boolean(activeMailboxId),
    queryFn: () =>
      listFn({
        data: {
          mailboxId: activeMailboxId!,
          folder,
          search: search.trim() || undefined,
          starred: starredOnly || undefined,
          labelId,
        },
      }),
  });

  const threadFn = useServerFn(getMailThread);
  const thread = useQuery({
    queryKey: ["mail-thread", threadId],
    enabled: Boolean(threadId),
    queryFn: () => threadFn({ data: { threadId: threadId! } }),
  });

  function refreshLists() {
    qc.invalidateQueries({ queryKey: ["mail-threads"] });
    qc.invalidateQueries({ queryKey: ["mail-workspace"] });
    if (threadId) qc.invalidateQueries({ queryKey: ["mail-thread", threadId] });
  }

  const sendFn = useServerFn(sendMailMessage);
  const draftFn = useServerFn(saveMailDraft);
  const uploadFn = useServerFn(uploadMailAttachment);
  const removeAttachmentFn = useServerFn(deleteMailAttachment);
  const attachmentUrlFn = useServerFn(getMailAttachmentUrl);

  /* حالة مرفقات نافذة الإنشاء: تُربط دائماً بمسوّدة محفوظة قبل الرفع. */
  const [composeDraftId, setComposeDraftId] = useState<string | null>(null);
  const [composeAttachments, setComposeAttachments] = useState<AttachmentMeta[]>([]);
  const [uploading, setUploading] = useState(false);
  const [downloadingAttachmentId, setDownloadingAttachmentId] = useState<string | null>(null);

  function openCompose(seed: ComposeSeed | null) {
    setComposeDraftId(seed?.draftId ?? null);
    setComposeAttachments([]);
    setCompose(seed);
  }

  function closeCompose() {
    setCompose(null);
    setComposeDraftId(null);
    setComposeAttachments([]);
  }

  function withDraft(payload: ComposePayload): ComposePayload {
    return { ...payload, draftId: composeDraftId ?? payload.draftId };
  }

  /** يقرأ الملف كـ Base64 دون تحميل المتصفح لسلاسل ضخمة في الذاكرة مرتين. */
  function readBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("تعذّر قراءة الملف."));
      reader.onload = () => resolve(String(reader.result ?? "").split(",")[1] ?? "");
      reader.readAsDataURL(file);
    });
  }

  async function attachFiles(files: File[], payload: ComposePayload) {
    setUploading(true);
    try {
      let draftId = composeDraftId;
      if (!draftId) {
        const saved = await draftFn({ data: withDraft(payload) });
        draftId = saved.messageId;
        setComposeDraftId(draftId);
      }
      for (const file of files) {
        const contentBase64 = await readBase64(file);
        const result = await uploadFn({
          data: { messageId: draftId, fileName: file.name, contentBase64 },
        });
        setComposeAttachments((prev) => [...prev, result.attachment]);
      }
      toast.success("تم إرفاق الملفات بعد التحقق الأمني.");
      refreshLists();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر إرفاق الملف.");
    } finally {
      setUploading(false);
    }
  }

  async function removeAttachment(attachmentId: string) {
    try {
      await removeAttachmentFn({ data: { attachmentId } });
      setComposeAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر إزالة المرفق.");
    }
  }

  async function downloadAttachment(attachmentId: string) {
    setDownloadingAttachmentId(attachmentId);
    try {
      const { url } = await attachmentUrlFn({ data: { attachmentId } });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر تنزيل المرفق.");
    } finally {
      setDownloadingAttachmentId(null);
    }
  }

  const send = useMutation({
    mutationFn: (payload: ComposePayload) => sendFn({ data: withDraft(payload) }),
    onSuccess: (result) => {
      if (result.sent) toast.success("تم إرسال الرسالة.");
      else if (result.failureRef)
        toast.error(`تعذّر الإرسال الآن — سنعيد المحاولة تلقائياً. المرجع ${result.failureRef}`);
      else toast.success("تمت جدولة الرسالة في قائمة الإرسال.");
      closeCompose();
      setThreadId(result.threadId);
      refreshLists();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveDraft = useMutation({
    mutationFn: (payload: ComposePayload) => draftFn({ data: withDraft(payload) }),
    onSuccess: () => {
      toast.success("تم حفظ المسوّدة.");
      closeCompose();
      refreshLists();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateFn = useServerFn(updateMailThread);
  const update = useMutation({
    mutationFn: (
      input: Parameters<typeof updateMailThread>[0] extends never ? never : Record<string, unknown>,
    ) => updateFn({ data: { threadId: threadId!, ...input } as never }),
    onSuccess: refreshLists,
    onError: (e: Error) => toast.error(e.message),
  });

  const flagFn = useServerFn(updateMailThread);
  const toggleStar = useMutation({
    mutationFn: (input: { id: string; starred: boolean }) =>
      flagFn({ data: { threadId: input.id, is_starred: input.starred } }),
    onSuccess: refreshLists,
    onError: (e: Error) => toast.error(e.message),
  });

  const noteFn = useServerFn(addMailNote);
  const addNote = useMutation({
    mutationFn: (body: string) => noteFn({ data: { threadId: threadId!, body } }),
    onSuccess: () => {
      toast.success("تم حفظ الملاحظة.");
      qc.invalidateQueries({ queryKey: ["mail-thread", threadId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const retryFn = useServerFn(retryMailMessage);
  const retry = useMutation({
    mutationFn: (messageId: string) => retryFn({ data: { messageId } }),
    onSuccess: (result) => {
      if (result.sent) toast.success("تم إرسال الرسالة.");
      else toast.error("لم ينجح الإرسال بعد — ستُعاد المحاولة تلقائياً.");
      refreshLists();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const discardFn = useServerFn(discardMailDraft);
  const [toDiscard, setToDiscard] = useState<string | null>(null);
  const discard = useMutation({
    mutationFn: (messageId: string) => discardFn({ data: { messageId } }),
    onSuccess: () => {
      toast.success("تم حذف المسوّدة.");
      setToDiscard(null);
      setThreadId(null);
      refreshLists();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /* حالة حجب المستلمين لدى خدمة البريد المُدارة: تُفحص قبل الإرسال وعند فتح
     محادثة فيها رسالة فاشلة، فيظهر السبب الحقيقي بدل فشل متكرر في السجل. */
  const [blockedRecipients, setBlockedRecipients] = useState<string[]>([]);
  const checkRecipientsFn = useServerFn(checkMailRecipients);
  const checkRecipients = useMutation({
    mutationFn: (input: { mailboxId: string; addresses: string[] }) =>
      checkRecipientsFn({ data: input }),
    onSuccess: (result, variables) => {
      setBlockedRecipients((prev) => {
        const cleared = prev.filter(
          (address) => !variables.addresses.map((a) => a.toLowerCase()).includes(address),
        );
        return [...new Set([...cleared, ...result.blocked])];
      });
    },
  });

  const liftBlockFn = useServerFn(liftMailRecipientBlock);
  const [liftingAddress, setLiftingAddress] = useState<string | null>(null);
  const liftBlock = useMutation({
    mutationFn: (input: { address: string; reason: string }) => liftBlockFn({ data: input }),
    onSuccess: (result, variables) => {
      if (result.lifted) {
        setBlockedRecipients((prev) =>
          prev.filter((address) => address !== variables.address.toLowerCase()),
        );
        toast.success(result.message);
      } else toast.error(result.message);
      setLiftingAddress(null);
    },
    onError: (e: Error) => {
      setLiftingAddress(null);
      toast.error(e.message);
    },
  });

  /* فحص مستلمي الرسائل الفاشلة في المحادثة المفتوحة. */
  const failedRecipientsKey = (thread.data?.messages ?? [])
    .filter((m) => m.status === "failed" || m.status === "bounced")
    .flatMap((m) => m.to_addresses)
    .map((a) => a.toLowerCase())
    .join(",");
  useEffect(() => {
    const addresses = failedRecipientsKey ? failedRecipientsKey.split(",") : [];
    const mailboxId = thread.data?.thread.mailbox_id;
    if (!mailboxId || addresses.length === 0) return;
    checkRecipients.mutate({ mailboxId, addresses });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failedRecipientsKey, thread.data?.thread.mailbox_id]);

  const mailboxFn = useServerFn(updateMailbox);
  const saveMailbox = useMutation({
    mutationFn: (input: {
      id: string;
      display_name?: string;
      signature_html?: string | null;
      inbound_enabled?: boolean;
      is_active?: boolean;
    }) => mailboxFn({ data: input }),
    onSuccess: () => {
      toast.success("تم حفظ إعدادات الصندوق.");
      qc.invalidateQueries({ queryKey: ["mail-workspace"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const labelSaveFn = useServerFn(saveMailLabel);
  const labelSave = useMutation({
    mutationFn: (input: { id?: string; name_ar: string; color: string }) =>
      labelSaveFn({ data: input }),
    onSuccess: () => {
      toast.success("تم حفظ التسمية.");
      qc.invalidateQueries({ queryKey: ["mail-workspace"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const labelDeleteFn = useServerFn(deleteMailLabel);
  const labelDelete = useMutation({
    mutationFn: (id: string) => labelDeleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("تم حذف التسمية.");
      setLabelId(null);
      qc.invalidateQueries({ queryKey: ["mail-workspace"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const folderCounts = useMemo(() => threads.data?.total ?? 0, [threads.data]);

  /**
   * الجوال (أقل من lg): رحلة متدرجة بثلاث شاشات مستقلة — الصناديق ثم المحادثات ثم
   * التفاصيل. لا تُعرض الأعمدة الثلاثة معاً، والتنقّل بزر رجوع صريح.
   */
  const [boxesOpen, setBoxesOpen] = useState(false);
  const compactStep: "boxes" | "list" | "detail" = boxesOpen
    ? "boxes"
    : threadId
      ? "detail"
      : "list";
  const paneCls = (pane: "boxes" | "list" | "detail") =>
    compactStep === pane ? "" : "hidden lg:flex";

  return (
    <AdminShell
      title="مركز البريد"
      description="صناديق المنصة الرسمية: قراءة، رد، تحويل، إسناد، وملاحظات داخلية — بسجل تدقيق كامل."
      actions={
        <div className="flex flex-wrap gap-2">
          {canManage && (
            <>
              <Btn size="sm" variant="outline" onClick={() => setIntegrationOpen(true)}>
                <PlugZap className="h-4 w-4" aria-hidden /> تكامل الخادم
              </Btn>
              <Btn size="sm" variant="outline" onClick={() => setLabelsOpen(true)}>
                <Tag className="h-4 w-4" aria-hidden /> التسميات
              </Btn>
              <Btn size="sm" variant="outline" onClick={() => setSettingsOpen(true)}>
                <Settings2 className="h-4 w-4" aria-hidden /> إعدادات الصناديق
              </Btn>
            </>
          )}
          {canSend && activeMailbox && (
            <Btn
              size="sm"
              onClick={() => openCompose({ mailboxId: activeMailbox.id, title: "رسالة جديدة" })}
            >
              <PenSquare className="h-4 w-4" aria-hidden /> رسالة جديدة
            </Btn>
          )}
        </div>
      }
    >
      {workspace.isLoading ? (
        <LoadingBlock rows={6} cols={3} />
      ) : mailboxes.length === 0 ? (
        <EmptyState title="لا توجد صناديق بريد" hint="أضف صناديق المنصة الرسمية أولاً." />
      ) : (
        <div className="grid min-w-0 gap-4 lg:grid-cols-[240px_minmax(0,340px)_minmax(0,1fr)]">
          {/* شريط تنقّل الجوال */}
          <div className="flex items-center gap-2 lg:hidden">
            {compactStep === "boxes" ? (
              <Btn size="sm" variant="outline" onClick={() => setBoxesOpen(false)}>
                <ChevronRight className="h-4 w-4" aria-hidden /> رجوع إلى المحادثات
              </Btn>
            ) : compactStep === "detail" ? (
              <Btn size="sm" variant="outline" onClick={() => setThreadId(null)}>
                <ChevronRight className="h-4 w-4" aria-hidden /> رجوع إلى القائمة
              </Btn>
            ) : (
              <Btn size="sm" variant="outline" onClick={() => setBoxesOpen(true)}>
                <Inbox className="h-4 w-4" aria-hidden /> الصناديق والمجلدات
              </Btn>
            )}
            <span className="min-w-0 flex-1 truncate text-body-sm text-muted-foreground">
              {activeMailbox?.display_name ?? ""}
            </span>
          </div>

          {/* الصناديق والمجلدات */}
          <nav
            aria-label="صناديق البريد"
            className={`surface-card h-fit min-w-0 p-3 ${paneCls("boxes")} lg:block`}
          >
            <p className="text-caption px-2 pb-2">الصناديق</p>
            <ul className="space-y-1">
              {mailboxes.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setMailboxId(m.id);
                      setThreadId(null);
                      setBoxesOpen(false);
                    }}
                    aria-current={m.id === activeMailboxId}
                    className={`flex min-h-[44px] w-full items-center justify-between gap-2 rounded-[var(--radius-s)] px-2.5 py-2 text-right text-body-sm transition-colors ${
                      m.id === activeMailboxId
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-surface-muted"
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{m.display_name}</span>
                      <span className="text-caption block truncate" dir="ltr">
                        {m.address}
                      </span>
                    </span>
                    {m.type === "system" ? (
                      <Badge tone="muted">نظام</Badge>
                    ) : m.unread > 0 ? (
                      <Badge tone="green">{m.unread}</Badge>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>

            <p className="text-caption mt-4 px-2 pb-2">المجلدات</p>
            <ul className="space-y-1">
              {EMAIL_FOLDERS.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setFolder(f.id);
                      setThreadId(null);
                      setBoxesOpen(false);
                    }}
                    aria-current={folder === f.id}
                    className={`flex min-h-[44px] w-full items-center gap-2 rounded-[var(--radius-s)] px-2.5 py-2 text-right text-body-sm transition-colors ${
                      folder === f.id ? "bg-primary/10 text-primary" : "hover:bg-surface-muted"
                    }`}
                  >
                    <Inbox className="h-4 w-4 shrink-0" aria-hidden />
                    {f.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {/* قائمة المحادثات */}
          <section
            aria-label="المحادثات"
            className={`surface-card flex min-w-0 flex-col lg:min-h-[520px] ${paneCls("list")}`}
          >
            <div className="space-y-2 border-b border-border p-3">
              <label className="relative block">
                <span className="sr-only">بحث في المواضيع</span>
                <Search
                  className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <input
                  className={`${inputCls} pe-9`}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="بحث في المواضيع…"
                />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  aria-pressed={starredOnly}
                  onClick={() => setStarredOnly((v) => !v)}
                  className={`rounded-full border px-2.5 py-1 text-[12px] ${
                    starredOnly
                      ? "border-gold bg-gold/10 text-gold-strong"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  المميّزة بنجمة
                </button>
                {(workspace.data?.labels ?? []).map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    aria-pressed={labelId === l.id}
                    onClick={() => setLabelId(labelId === l.id ? null : l.id)}
                    className={`rounded-full border px-2.5 py-1 text-[12px] ${
                      labelId === l.id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    {l.name_ar}
                  </button>
                ))}
              </div>
              <p className="text-caption">{folderCounts} محادثة</p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {threads.isLoading ? (
                <div className="p-3">
                  <LoadingBlock rows={5} cols={1} />
                </div>
              ) : (threads.data?.threads.length ?? 0) === 0 ? (
                <EmptyState title="لا توجد رسائل" hint="هذا المجلد فارغ حالياً." />
              ) : (
                <ul className="divide-y divide-border">
                  {threads.data!.threads.map((t) => (
                    <li key={t.id}>
                      <div
                        className={`flex items-start gap-2 p-3 ${threadId === t.id ? "bg-primary/5" : "hover:bg-surface-muted/60"}`}
                      >
                        <IconBtn
                          aria-label={t.is_starred ? "إزالة النجمة" : "إضافة نجمة"}
                          onClick={() => toggleStar.mutate({ id: t.id, starred: !t.is_starred })}
                        >
                          <Star
                            className={t.is_starred ? "h-4 w-4 fill-gold text-gold" : "h-4 w-4"}
                            aria-hidden
                          />
                        </IconBtn>
                        <button
                          type="button"
                          onClick={() => setThreadId(t.id)}
                          className="min-w-0 flex-1 text-right"
                          aria-current={threadId === t.id}
                        >
                          <span className="flex items-center justify-between gap-2">
                            <span
                              className={`truncate ${t.is_unread ? "font-bold" : "font-medium"}`}
                            >
                              {t.subject || "(بدون موضوع)"}
                            </span>
                            <span className="text-caption shrink-0">
                              {fmtDateTime(t.last_activity_at)}
                            </span>
                          </span>
                          <span className="text-caption mt-0.5 block truncate" dir="ltr">
                            {t.participants.join(" ، ")}
                          </span>
                          <span className="mt-1 block truncate text-body-sm text-muted-foreground">
                            {t.preview}
                          </span>
                          {(t.labels.length > 0 || t.assigned_to_email) && (
                            <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              {t.labels.map((l) => (
                                <Badge key={l.id} tone="gold">
                                  {l.name_ar}
                                </Badge>
                              ))}
                              {t.assigned_to_email && (
                                <Badge tone="info">{t.assigned_to_email}</Badge>
                              )}
                            </span>
                          )}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* المحادثة */}
          <section
            aria-label="تفاصيل المحادثة"
            className={`surface-card flex min-w-0 flex-col [overflow-wrap:anywhere] lg:min-h-[520px] ${paneCls("detail")}`}
          >
            {!threadId ? (
              <EmptyState
                title="اختر محادثة"
                hint="اختر رسالة من القائمة لعرض تفاصيلها والرد عليها."
              />
            ) : thread.isLoading || !thread.data ? (
              <div className="p-4">
                <LoadingBlock rows={4} cols={2} />
              </div>
            ) : (
              <>
                <ThreadView
                  detail={thread.data}
                  staff={workspace.data?.staff ?? []}
                  labels={workspace.data?.labels ?? []}
                  canSend={canSend}
                  canAssign={canAssign}
                  onCompose={openCompose}
                  onUpdate={(patch) => update.mutate(patch as Record<string, unknown>)}
                  onAddNote={(body) => addNote.mutate(body)}
                  onRetry={(messageId) => retry.mutate(messageId)}
                  onDownloadAttachment={(id) => void downloadAttachment(id)}
                  blockedRecipients={blockedRecipients}
                  savingNote={addNote.isPending}
                  retrying={retry.isPending}
                  downloadingAttachmentId={downloadingAttachmentId}
                />
                {folder === "drafts" && canSend && (
                  <div className="border-t border-border p-3">
                    <Btn
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const draft = thread.data.messages.find((m) => m.status === "draft");
                        if (draft) setToDiscard(draft.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden /> حذف المسوّدة
                    </Btn>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}

      <ComposeModal
        seed={compose}
        mailboxes={mailboxes}
        onClose={closeCompose}
        onSend={(payload) => send.mutate(payload)}
        onSaveDraft={(payload) => saveDraft.mutate(payload)}
        attachments={composeAttachments}
        onAttachFiles={(files, payload) => void attachFiles(files, payload)}
        onRemoveAttachment={(id) => void removeAttachment(id)}
        uploading={uploading}
        sending={send.isPending}
        savingDraft={saveDraft.isPending}
        blockedRecipients={blockedRecipients}
        checkingRecipients={checkRecipients.isPending}
        onCheckRecipients={(mailboxId, addresses) =>
          checkRecipients.mutate({ mailboxId, addresses })
        }
        canManageSuppression={canManage}
        onLiftBlock={(address, reason) => {
          setLiftingAddress(address);
          liftBlock.mutate({ address, reason });
        }}
        liftingAddress={liftingAddress}
      />

      <Modal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="إعدادات صناديق البريد"
        size="lg"
      >
        <ul className="space-y-4">
          {mailboxes.map((m) => (
            <li key={m.id} className="rounded-[var(--radius-m)] border border-border p-4">
              <MailboxSettings
                mailbox={m}
                saving={saveMailbox.isPending}
                onSave={(input) => saveMailbox.mutate({ id: m.id, ...input })}
              />
            </li>
          ))}
        </ul>
      </Modal>

      <Modal open={labelsOpen} onClose={() => setLabelsOpen(false)} title="تسميات البريد">
        <LabelsManager
          labels={workspace.data?.labels ?? []}
          saving={labelSave.isPending}
          deleting={labelDelete.isPending}
          onSave={(input) => labelSave.mutate(input)}
          onDelete={(id) => labelDelete.mutate(id)}
        />
      </Modal>

      <Modal
        open={integrationOpen}
        onClose={() => setIntegrationOpen(false)}
        title="تكامل بريد الخادم (SMTP / IMAP)"
        size="lg"
      >
        <MailIntegrationPanel canManage={canManage} />
      </Modal>

      <ConfirmDialog
        open={Boolean(toDiscard)}
        onClose={() => setToDiscard(null)}
        onConfirm={() => toDiscard && discard.mutate(toDiscard)}
        title="حذف المسوّدة"
        message="سيتم حذف المسوّدة نهائياً."
        loading={discard.isPending}
      />
    </AdminShell>
  );
}

function MailboxSettings({
  mailbox,
  saving,
  onSave,
}: {
  mailbox: {
    id: string;
    address: string;
    display_name: string;
    type: string;
    is_active: boolean;
    inbound_enabled: boolean;
    sync_enabled: boolean;
    signature_html: string | null;
  };
  saving: boolean;
  onSave: (input: {
    display_name: string;
    signature_html: string | null;
    is_active: boolean;
    inbound_enabled: boolean;
    sync_enabled: boolean;
  }) => void;
}) {
  const [name, setName] = useState(mailbox.display_name);
  const [signature, setSignature] = useState(mailbox.signature_html ?? "");
  const [active, setActive] = useState(mailbox.is_active);
  const [inbound, setInbound] = useState(mailbox.inbound_enabled);
  const [syncEnabled, setSyncEnabled] = useState(mailbox.sync_enabled);
  const isSystem = mailbox.type === "system";

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          display_name: name,
          signature_html: signature.trim() || null,
          is_active: active,
          inbound_enabled: inbound,
          sync_enabled: syncEnabled,
        });
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold" dir="ltr">
          {mailbox.address}
        </p>
        {isSystem && <Badge tone="muted">صندوق نظام — لا يستقبل ولا يُرسل يدوياً</Badge>}
      </div>
      <FormField label="الاسم الظاهر">
        <input
          className={inputCls}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
        />
      </FormField>
      {!isSystem && (
        <FormField label="التوقيع" hint="نص يُضاف يدوياً أسفل الرسائل عند الحاجة.">
          <textarea
            className={`${inputCls} min-h-24`}
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
          />
        </FormField>
      )}
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-body-sm">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-border"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          الصندوق مُفعّل
        </label>
        {!isSystem && (
          <label className="flex items-center gap-2 text-body-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border"
              checked={inbound}
              onChange={(e) => setInbound(e.target.checked)}
            />
            تمكين استقبال الرسائل
          </label>
        )}
        {!isSystem && (
          <label className="flex items-center gap-2 text-body-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border"
              checked={syncEnabled}
              onChange={(e) => setSyncEnabled(e.target.checked)}
            />
            تمكين مزامنة IMAP
          </label>
        )}
      </div>
      <Btn size="sm" type="submit" loading={saving}>
        حفظ
      </Btn>
    </form>
  );
}

function LabelsManager({
  labels,
  saving,
  deleting,
  onSave,
  onDelete,
}: {
  labels: { id: string; name_ar: string; color: string }[];
  saving: boolean;
  deleting: boolean;
  onSave: (input: { id?: string; name_ar: string; color: string }) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState("");

  return (
    <div className="space-y-4">
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          onSave({ name_ar: name.trim(), color: "gold" });
          setName("");
        }}
      >
        <input
          className={inputCls}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="اسم التسمية"
          maxLength={40}
          aria-label="اسم التسمية"
        />
        <Btn type="submit" loading={saving} disabled={!name.trim()}>
          إضافة
        </Btn>
      </form>
      {labels.length === 0 ? (
        <EmptyState title="لا توجد تسميات" hint="أنشئ تسمية مثل «عاجل» أو «متابعة»." />
      ) : (
        <ul className="space-y-2">
          {labels.map((l) => (
            <li
              key={l.id}
              className="flex items-center justify-between rounded-[var(--radius-s)] border border-border px-3 py-2"
            >
              <span className="text-body-sm">{l.name_ar}</span>
              <IconBtn
                aria-label={`حذف ${l.name_ar}`}
                tone="danger"
                loading={deleting}
                onClick={() => onDelete(l.id)}
              >
                <Trash2 className="h-4 w-4 text-danger" aria-hidden />
              </IconBtn>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export { SectionCard };
