import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DashboardShell } from "@/components/dashboard/shell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, canEdit, canManage } from "@/hooks/use-auth";
import { fmtDate, fmtSize } from "@/lib/enums";
import { audit } from "@/lib/audit";
import {
  validateClientFile,
  fileExtension,
  ACCEPT_ATTR,
  MAX_UPLOAD_SIZE,
} from "@/lib/client-portal.shared";
import {
  PageToolbar,
  EmptyState,
  LoadingBlock,
  ErrorBlock,
  DataCard,
  Th,
  Td,
  BusyOverlay,
  IconBtn,
  Modal,
  FormField,
  inputCls,
  Btn,
  Badge,
  useDebounced,
  ConfirmDialog,
  Pagination,
} from "@/lib/list-utils";
import { Trash2, Upload, Lock, ScanText } from "lucide-react";
import {
  SecureDocActions,
  SecureDocumentViewer,
  ShareDocumentDialog,
  useSecureDocument,
  type SecureDoc,
} from "@/components/documents/secure-document";
import { describeMutationError } from "@/lib/subscription.shared";
import {
  ExtractedTextDialog,
  ProcessingBadge,
  RetryButton,
  useDocumentIndexing,
  useProcessingJobs,
  type DocumentRow,
} from "@/components/documents/text-intel";
import { extractableKind } from "@/lib/document-ai.shared";
import { DocumentRepairButton } from "@/components/documents/repair-panel";
import type { Tables } from "@/integrations/supabase/types";
import { errMsg } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/documents")({
  component: Page,
  head: () => ({
    meta: [
      { title: "المستندات | مِهلة" },
      {
        name: "description",
        content: "أرشيف مستندات القضايا مع رفع آمن ومعاينة محمية بعلامة مائية وفهرسة نصية.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "المستندات | مِهلة" },
      {
        property: "og:description",
        content: "أرشيف مستندات القضايا مع رفع آمن ومعاينة محمية بعلامة مائية وفهرسة نصية.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const PAGE_SIZE = 20;
const MAX_SIZE = MAX_UPLOAD_SIZE;

function Page() {
  const { activeOrgId, activeRole, user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  type DocumentListRow = Tables<"documents"> & {
    case: { case_title: string } | null;
    client: { full_name: string } | null;
    uploader: { full_name: string } | null;
  };
  const [deleting, setDeleting] = useState<DocumentListRow | null>(null);
  const [sharing, setSharing] = useState<SecureDoc | null>(null);
  const [viewingText, setViewingText] = useState<DocumentRow | null>(null);
  const q = useDebounced(search);
  const secure = useSecureDocument();

  const { data, isLoading, isFetching, error } = useQuery({
    placeholderData: keepPreviousData,
    queryKey: ["documents", activeOrgId, q, page],
    enabled: !!activeOrgId,
    queryFn: async () => {
      let query = supabase
        .from("documents")
        .select(
          "*, case:cases(case_title), client:clients(full_name), uploader:profiles!documents_uploaded_by_fkey(full_name)",
          { count: "exact" },
        )
        .eq("organization_id", activeOrgId!)
        .order("created_at", { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
      if (q) query = query.or(`file_name.ilike.%${q}%,description.ilike.%${q}%`);
      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: data ?? [], count: count ?? 0 };
    },
  });

  const jobs = useProcessingJobs((data?.rows ?? []).map((d) => d.id));
  const jobFor = (id: string) => (jobs.data ?? []).find((j) => j.document_id === id);

  const del = useMutation({
    mutationFn: async (d: DocumentListRow) => {
      await supabase.storage.from("documents").remove([d.file_path]);
      const { error } = await supabase.from("documents").delete().eq("id", d.id);
      if (error) throw error;
      await audit({
        organizationId: d.organization_id,
        action: "document.delete",
        entityType: "document",
        entityId: d.id,
        description: `حذف المستند: ${d.file_name}`,
      });
    },
    onSuccess: () => {
      toast.success("تم الحذف");
      qc.invalidateQueries({ queryKey: ["documents"] });
      setDeleting(null);
    },
    onError: (e: unknown) => toast.error("تعذّر الحذف", { description: errMsg(e) }),
  });

  return (
    <DashboardShell title="المستندات">
      <PageToolbar
        searching={isFetching && !isLoading}
        search={search}
        setSearch={(v) => {
          setSearch(v);
          setPage(1);
        }}
        canAdd={canEdit(activeRole)}
        onAdd={() => setOpen(true)}
        addLabel="رفع مستند"
        filters={<DocumentRepairButton />}
      />
      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock message={errMsg(error)} />
      ) : !data?.rows.length ? (
        <EmptyState
          title="لا توجد مستندات"
          hint="ارفع أول مستند لمكتبك"
          action={
            canEdit(activeRole) && (
              <Btn onClick={() => setOpen(true)}>
                <Upload className="inline h-4 w-4 me-1" /> رفع مستند
              </Btn>
            )
          }
        />
      ) : (
        <>
          <BusyOverlay busy={isFetching && !isLoading}>
            <DataCard>
              <table className="min-w-full">
                <thead className="bg-surface-muted/60">
                  <tr>
                    <Th>الملف</Th>
                    <Th>القضية</Th>
                    <Th>العميل</Th>
                    <Th>التصنيف</Th>
                    <Th>المعالجة</Th>
                    <Th>الحجم</Th>
                    <Th>التاريخ</Th>
                    <Th>الرافع</Th>
                    <Th> </Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.rows.map((d: DocumentListRow) => (
                    <tr key={d.id} className="hover:bg-surface-muted/40">
                      <Td className="font-medium">
                        <div className="flex items-center gap-2">
                          {d.is_confidential && <Lock className="h-3.5 w-3.5 text-warning" />}
                          <span>{d.file_name}</span>
                        </div>
                        {d.description && (
                          <div className="text-xs text-muted-foreground">{d.description}</div>
                        )}
                        {d.file_status === "FILE_MISSING" && (
                          <Badge tone="red">الملف مفقود — يلزم إعادة الرفع</Badge>
                        )}
                        {d.file_status === "INVALID_FILE" && <Badge tone="red">ملف غير صالح</Badge>}
                      </Td>
                      <Td>{d.case?.case_title ?? "—"}</Td>
                      <Td>{d.client?.full_name ?? "—"}</Td>
                      <Td>
                        {d.document_category ? (
                          <Badge tone="muted">{d.document_category}</Badge>
                        ) : (
                          "—"
                        )}
                      </Td>
                      <Td>
                        <ProcessingBadge
                          job={jobFor(d.id)}
                          fileName={d.file_name}
                          fileType={d.file_type}
                        />
                      </Td>
                      <Td>{fmtSize(d.file_size)}</Td>
                      <Td>{fmtDate(d.created_at)}</Td>
                      <Td>{d.uploader?.full_name ?? "—"}</Td>
                      <Td>
                        <div className="flex justify-end gap-1">
                          {extractableKind(d.file_name, d.file_type) && (
                            <>
                              <IconBtn
                                aria-label="النص المستخرج"
                                title="عرض النص المستخرج"
                                disabled={jobFor(d.id)?.status !== "completed"}
                                onClick={() => setViewingText(d as DocumentRow)}
                              >
                                <ScanText className="h-4 w-4" />
                              </IconBtn>
                              <RetryButton doc={d as DocumentRow} />
                            </>
                          )}
                          {d.file_status !== "FILE_MISSING" && d.file_status !== "INVALID_FILE" && (
                            <SecureDocActions
                              doc={d as SecureDoc}
                              engine={secure}
                              onShare={(target) => setSharing(target)}
                            />
                          )}
                          {canManage(activeRole) && (
                            <IconBtn
                              tone="danger"
                              aria-label="حذف"
                              title="حذف"
                              loading={del.isPending && deleting?.id === d.id}
                              onClick={() => setDeleting(d)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </IconBtn>
                          )}
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataCard>
          </BusyOverlay>
          <Pagination page={page} setPage={setPage} total={data.count} pageSize={PAGE_SIZE} />
        </>
      )}
      <UploadDialog
        open={open}
        onClose={() => setOpen(false)}
        orgId={activeOrgId!}
        userId={user?.id}
      />
      <ExtractedTextDialog doc={viewingText} onClose={() => setViewingText(null)} />
      {secure.viewing && (
        <SecureDocumentViewer
          doc={secure.viewing.doc}
          url={secure.viewing.url}
          onClose={secure.closeViewer}
        />
      )}
      <ShareDocumentDialog doc={sharing} onClose={() => setSharing(null)} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && del.mutate(deleting)}
        loading={del.isPending}
        title="حذف المستند"
        message={`سيتم حذف "${deleting?.file_name}" نهائياً.`}
      />
    </DashboardShell>
  );
}

function UploadDialog({
  open,
  onClose,
  orgId,
  userId,
}: {
  open: boolean;
  onClose: () => void;
  orgId: string;
  userId?: string;
}) {
  const qc = useQueryClient();
  const { activeOrgId } = useAuth();
  const { indexUploaded } = useDocumentIndexing();
  const [file, setFile] = useState<File | null>(null);
  const [caseId, setCaseId] = useState("");
  const [clientId, setClientId] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [confidential, setConfidential] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: cases, isLoading: loadingCases } = useQuery({
    queryKey: ["cases-basic", activeOrgId],
    enabled: !!activeOrgId && open,
    queryFn: async () =>
      (await supabase.from("cases").select("id, case_title").eq("organization_id", activeOrgId!))
        .data ?? [],
  });
  const { data: clients, isLoading: loadingClients } = useQuery({
    queryKey: ["clients-basic", activeOrgId],
    enabled: !!activeOrgId && open,
    queryFn: async () =>
      (await supabase.from("clients").select("id, full_name").eq("organization_id", activeOrgId!))
        .data ?? [],
  });

  const reset = () => {
    setFile(null);
    setCaseId("");
    setClientId("");
    setCategory("");
    setDescription("");
    setConfidential(false);
    setProgress(0);
    if (fileRef.current) fileRef.current.value = "";
  };

  const upload = async () => {
    if (!file) return toast.error("اختر ملفاً");
    if (file.size > MAX_SIZE) return toast.error(`الحد الأقصى ${fmtSize(MAX_SIZE)}`);
    const typeError = validateClientFile({
      name: file.name,
      size: file.size,
      type: file.type || "",
    });
    if (typeError) return toast.error("ملف غير مسموح به", { description: typeError });
    setUploading(true);
    setProgress(10);
    const ext = fileExtension(file.name) || "bin";
    const path = `${orgId}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("documents")
      .upload(path, file, { contentType: file.type });
    if (upErr) {
      setUploading(false);
      return toast.error("تعذّر الرفع", { description: upErr.message });
    }
    setProgress(70);
    const { data: inserted, error: dbErr } = await supabase
      .from("documents")
      .insert({
        organization_id: orgId,
        case_id: caseId || null,
        client_id: clientId || null,
        file_name: file.name,
        file_path: path,
        file_type: file.type || null,
        file_size: file.size,
        file_status: "AVAILABLE",
        storage_verified_at: new Date().toISOString(),
        document_category: category || null,
        description: description || null,
        is_confidential: confidential,
        uploaded_by: userId,
      })
      .select("id")
      .single();
    setUploading(false);
    setProgress(100);
    if (dbErr) {
      await supabase.storage.from("documents").remove([path]);
      return toast.error("تعذّر الحفظ", { description: describeMutationError(dbErr.message) });
    }
    toast.success("تم الرفع");
    await audit({
      organizationId: orgId,
      action: "document.upload",
      entityType: "document",
      description: `رفع المستند: ${file.name}`,
      metadata: { size: file.size, type: file.type || null, confidential },
    });
    qc.invalidateQueries({ queryKey: ["documents"] });
    qc.invalidateQueries({ queryKey: ["case-documents"] });
    // الفهرسة تعمل في الخلفية بعد إغلاق النافذة حتى لا تُعطّل المستخدم.
    if (inserted?.id) {
      void indexUploaded({ organizationId: orgId, documentId: inserted.id, file });
    }
    reset();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!uploading) {
          reset();
          onClose();
        }
      }}
      title="رفع مستند"
      size="lg"
      busy={loadingCases || loadingClients}
      busyLabel="جاري تجهيز النموذج…"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <FormField label="الملف *">
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT_ATTR}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className={inputCls}
            />
            {file && (
              <span className="mt-1 block text-xs text-muted-foreground">
                {file.name} · {fmtSize(file.size)}
              </span>
            )}
          </FormField>
        </div>
        <FormField label="القضية">
          <select value={caseId} onChange={(e) => setCaseId(e.target.value)} className={inputCls}>
            <option value="">— بدون —</option>
            {(cases ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.case_title}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="العميل">
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className={inputCls}
          >
            <option value="">— بدون —</option>
            {(clients ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="التصنيف">
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={inputCls}
            placeholder="عقد / محضر / حكم / ..."
          />
        </FormField>
        <FormField label="سرّي">
          <label className="mt-2 flex items-center gap-2">
            <input
              type="checkbox"
              checked={confidential}
              onChange={(e) => setConfidential(e.target.checked)}
            />{" "}
            <span className="text-sm">تمييز كسرّي</span>
          </label>
        </FormField>
        <div className="md:col-span-2">
          <FormField label="الوصف">
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={inputCls}
            />
          </FormField>
        </div>
        {uploading && (
          <div className="md:col-span-2 h-2 overflow-hidden rounded-full bg-surface-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Btn
          variant="outline"
          onClick={() => {
            reset();
            onClose();
          }}
          disabled={uploading}
        >
          إلغاء
        </Btn>
        <Btn onClick={upload} loading={uploading} disabled={!file}>
          {uploading ? "جاري الرفع…" : "رفع"}
        </Btn>
      </div>
    </Modal>
  );
}
