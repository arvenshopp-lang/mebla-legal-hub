import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DashboardShell } from "@/components/dashboard/shell";
import { supabase } from "@/integrations/supabase/client";
import { track } from "@/lib/product-analytics";
import { useAuth, canEdit, canManage } from "@/hooks/use-auth";
import { fmtDate, fmtSize } from "@/lib/enums";
import { audit } from "@/lib/audit";
import {
  validateClientFile,
  ACCEPT_ATTR,
  MAX_UPLOAD_SIZE,
  SUPPORTED_FORMATS_LABEL,
} from "@/lib/client-portal.shared";
import {
  PageToolbar,
  EmptyState,
  LoadingBlock,
  ErrorBlock,
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
  sanitizeSearchTerm,
} from "@/lib/list-utils";
import { DataView, type Column } from "@/components/data/data-view";
import { Trash2, Upload, Lock, ScanText } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import {
  prepareDocumentUpload,
  finalizeDocumentUpload,
  deleteDocument,
} from "@/lib/documents/intake.functions";
import {
  SecureDocActions,
  SecureDocumentViewer,
  ShareDocumentDialog,
  useSecureDocument,
  type SecureDoc,
} from "@/components/documents/secure-document";
import { normalizedMime } from "@/lib/documents/file-signature";
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
  const { activeOrgId, activeRole } = useAuth();
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
  const q = sanitizeSearchTerm(useDebounced(search));
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
        // مفتاح فرز ثانوي ثابت يمنع تكرار الصفوف بين صفحات الترقيم
        .order("id", { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
      if (q) query = query.or(`file_name.ilike.%${q}%,description.ilike.%${q}%`);
      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: data ?? [], count: count ?? 0 };
    },
  });

  const jobs = useProcessingJobs((data?.rows ?? []).map((d) => d.id));
  const jobFor = (id: string) => (jobs.data ?? []).find((j) => j.document_id === id);
  const removeDocument = useServerFn(deleteDocument);

  const del = useMutation({
    mutationFn: async (d: DocumentListRow) => {
      // الحذف خادمي بالكامل: يُزال ملف المخزن أولاً ثم السجل، ولا يُتجاهل أي خطأ.
      await removeDocument({ data: { documentId: d.id } });
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

  const columns: Column<DocumentListRow>[] = [
    {
      id: "file",
      header: "الملف",
      mobile: "title",
      wrap: true,
      cell: (d) => (
        <>
          <div className="flex items-center gap-2">
            {d.is_confidential && <Lock className="h-3.5 w-3.5 shrink-0 text-warning" />}
            <span className="min-w-0 break-words">{d.file_name}</span>
          </div>
          {d.description && <div className="text-xs text-muted-foreground">{d.description}</div>}
          {d.file_status === "FILE_MISSING" && (
            <Badge tone="red">الملف مفقود — يلزم إعادة الرفع</Badge>
          )}
          {d.file_status === "INVALID_FILE" && <Badge tone="red">ملف غير صالح</Badge>}
        </>
      ),
    },
    { id: "case", header: "القضية", cell: (d) => d.case?.case_title ?? "—" },
    { id: "client", header: "العميل", cell: (d) => d.client?.full_name ?? "—" },
    {
      id: "category",
      header: "التصنيف",
      cell: (d) => (d.document_category ? <Badge tone="muted">{d.document_category}</Badge> : "—"),
    },
    {
      id: "processing",
      header: "المعالجة",
      cell: (d) => (
        <ProcessingBadge job={jobFor(d.id)} fileName={d.file_name} fileType={d.file_type} />
      ),
    },
    { id: "size", header: "الحجم", cell: (d) => fmtSize(d.file_size) },
    {
      id: "date",
      header: "التاريخ",
      cell: (d) => <span className="whitespace-nowrap tabular-nums">{fmtDate(d.created_at)}</span>,
    },
    { id: "uploader", header: "الرافع", cell: (d) => d.uploader?.full_name ?? "—" },
    {
      id: "actions",
      header: " ",
      mobile: "actions",
      cell: (d) => (
        <div className="cell-actions flex flex-nowrap items-center justify-end gap-1">
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
      ),
    },
  ];

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
            <DataView
              label="جدول المستندات"
              rows={data.rows as DocumentListRow[]}
              rowKey={(d) => d.id}
              columns={columns}
            />
          </BusyOverlay>
          <Pagination page={page} setPage={setPage} total={data.count} pageSize={PAGE_SIZE} />
        </>
      )}
      <UploadDialog open={open} onClose={() => setOpen(false)} orgId={activeOrgId!} />
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
}: {
  open: boolean;
  onClose: () => void;
  orgId: string;
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
  const prepare = useServerFn(prepareDocumentUpload);
  const finalize = useServerFn(finalizeDocumentUpload);

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
    let documentId: string | null = null;
    try {
      // الخادم يوقّع فتحة الرفع، ثم يتحقق من البايتات قبل ربطها بأي سجل.
      const slot = await prepare({
        data: { organizationId: orgId, fileName: file.name, fileSize: file.size },
      });
      setProgress(35);
      const { error: upErr } = await supabase.storage
        .from("documents")
        .uploadToSignedUrl(slot.path, slot.uploadToken, file, {
          contentType: normalizedMime(file.name) ?? slot.contentType,
        });
      if (upErr) throw new Error("تعذّر رفع الملف إلى المخزن. أعد المحاولة.");
      setProgress(70);
      const saved = await finalize({
        data: {
          organizationId: orgId,
          path: slot.path,
          fileName: file.name,
          caseId: caseId || null,
          clientId: clientId || null,
          category: category || "",
          description: description || "",
          isConfidential: confidential,
        },
      });
      documentId = saved.documentId;
    } catch (e: unknown) {
      setUploading(false);
      setProgress(0);
      return toast.error("تعذّر الرفع", { description: errMsg(e) });
    }
    setUploading(false);
    setProgress(100);
    toast.success("تم الرفع");
    track("document_uploaded", { action_source: "dashboard" });
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
    if (documentId) {
      void indexUploaded({ organizationId: orgId, documentId, file });
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
          <FormField label="الملف" required>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT_ATTR}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className={inputCls}
            />
            <span className="mt-1 block text-[11px] text-muted-foreground">
              {SUPPORTED_FORMATS_LABEL} · حتى 20 ميجابايت
            </span>
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
          <p className="rounded-xl border border-border/60 bg-muted/40 p-3 text-xs leading-6 text-muted-foreground">
            يُحفظ المستند في خزينة مِهلة المشفّرة الخاصة بمكتبك: تشفير AES-256-GCM، حاوية تخزين
            خاصة غير عامة، روابط عرض موقّعة قصيرة الصلاحية، وسجل تدقيق لكل عرض وتنزيل وطباعة.
          </p>
        </div>
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
