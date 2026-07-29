import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DashboardShell } from "@/components/dashboard/shell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, canEdit, canManage } from "@/hooks/use-auth";
import { fmtDate, fmtSize } from "@/lib/enums";
import {
  PageToolbar, EmptyState, LoadingBlock, ErrorBlock, DataCard, Th, Td,
  Modal, FormField, inputCls, Btn, Badge, useDebounced, ConfirmDialog, Pagination,
} from "@/lib/list-utils";
import { Download, Trash2, Upload, Lock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/documents")({
  component: Page,
});

const PAGE_SIZE = 20;
const MAX_SIZE = 25 * 1024 * 1024; // 25MB

function Page() {
  const { activeOrgId, activeRole, user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<any | null>(null);
  const q = useDebounced(search);

  const { data, isLoading, error } = useQuery({
    queryKey: ["documents", activeOrgId, q, page],
    enabled: !!activeOrgId,
    queryFn: async () => {
      let query = supabase.from("documents")
        .select("*, case:cases(case_title), client:clients(full_name), uploader:profiles!documents_uploaded_by_fkey(full_name)", { count: "exact" })
        .eq("organization_id", activeOrgId!).order("created_at", { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
      if (q) query = query.or(`file_name.ilike.%${q}%,description.ilike.%${q}%`);
      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: data ?? [], count: count ?? 0 };
    },
  });

  const download = async (d: any) => {
    const { data, error } = await supabase.storage.from("documents").createSignedUrl(d.file_path, 60);
    if (error) return toast.error("تعذّر التحميل", { description: error.message });
    window.open(data.signedUrl, "_blank");
  };

  const del = useMutation({
    mutationFn: async (d: any) => {
      await supabase.storage.from("documents").remove([d.file_path]);
      const { error } = await supabase.from("documents").delete().eq("id", d.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تم الحذف"); qc.invalidateQueries({ queryKey: ["documents"] }); setDeleting(null); },
    onError: (e: any) => toast.error("تعذّر الحذف", { description: e.message }),
  });

  return (
    <DashboardShell title="المستندات">
      <PageToolbar
        search={search} setSearch={(v) => { setSearch(v); setPage(1); }}
        canAdd={canEdit(activeRole)}
        onAdd={() => setOpen(true)}
        addLabel="رفع مستند"
      />
      {isLoading ? <LoadingBlock /> : error ? <ErrorBlock message={(error as any).message} /> :
        !data?.rows.length ? (
          <EmptyState title="لا توجد مستندات" hint="ارفع أول مستند لمكتبك" action={canEdit(activeRole) && <Btn onClick={() => setOpen(true)}><Upload className="inline h-4 w-4 me-1" /> رفع مستند</Btn>} />
        ) : (
          <>
            <DataCard>
              <table className="min-w-full">
                <thead className="bg-surface-muted/60">
                  <tr><Th>الملف</Th><Th>القضية</Th><Th>العميل</Th><Th>التصنيف</Th><Th>الحجم</Th><Th>التاريخ</Th><Th>الرافع</Th><Th>{" "}</Th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.rows.map((d: any) => (
                    <tr key={d.id} className="hover:bg-surface-muted/40">
                      <Td className="font-medium">
                        <div className="flex items-center gap-2">
                          {d.is_confidential && <Lock className="h-3.5 w-3.5 text-warning" />}
                          <span>{d.file_name}</span>
                        </div>
                        {d.description && <div className="text-xs text-muted-foreground">{d.description}</div>}
                      </Td>
                      <Td>{d.case?.case_title ?? "—"}</Td>
                      <Td>{d.client?.full_name ?? "—"}</Td>
                      <Td>{d.document_category ? <Badge tone="muted">{d.document_category}</Badge> : "—"}</Td>
                      <Td>{fmtSize(d.file_size)}</Td>
                      <Td>{fmtDate(d.created_at)}</Td>
                      <Td>{d.uploader?.full_name ?? "—"}</Td>
                      <Td>
                        <div className="flex justify-end gap-1">
                          <button onClick={() => download(d)} className="rounded-lg p-1.5 hover:bg-surface-muted"><Download className="h-4 w-4" /></button>
                          {canManage(activeRole) && <button onClick={() => setDeleting(d)} className="rounded-lg p-1.5 text-danger hover:bg-danger-soft"><Trash2 className="h-4 w-4" /></button>}
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataCard>
            <Pagination page={page} setPage={setPage} total={data.count} pageSize={PAGE_SIZE} />
          </>
        )}
      <UploadDialog open={open} onClose={() => setOpen(false)} orgId={activeOrgId!} userId={user?.id} />
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => deleting && del.mutate(deleting)} loading={del.isPending} title="حذف المستند" message={`سيتم حذف "${deleting?.file_name}" نهائياً.`} />
    </DashboardShell>
  );
}

function UploadDialog({ open, onClose, orgId, userId }: { open: boolean; onClose: () => void; orgId: string; userId?: string }) {
  const qc = useQueryClient();
  const { activeOrgId } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [caseId, setCaseId] = useState("");
  const [clientId, setClientId] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [confidential, setConfidential] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: cases } = useQuery({
    queryKey: ["cases-basic", activeOrgId], enabled: !!activeOrgId && open,
    queryFn: async () => (await supabase.from("cases").select("id, case_title").eq("organization_id", activeOrgId!)).data ?? [],
  });
  const { data: clients } = useQuery({
    queryKey: ["clients-basic", activeOrgId], enabled: !!activeOrgId && open,
    queryFn: async () => (await supabase.from("clients").select("id, full_name").eq("organization_id", activeOrgId!)).data ?? [],
  });

  const reset = () => {
    setFile(null); setCaseId(""); setClientId(""); setCategory("");
    setDescription(""); setConfidential(false); setProgress(0);
    if (fileRef.current) fileRef.current.value = "";
  };

  const upload = async () => {
    if (!file) return toast.error("اختر ملفاً");
    if (file.size > MAX_SIZE) return toast.error(`الحد الأقصى ${fmtSize(MAX_SIZE)}`);
    setUploading(true); setProgress(10);
    const ext = file.name.split(".").pop() ?? "bin";
    const path = `${orgId}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("documents").upload(path, file, { contentType: file.type });
    if (upErr) { setUploading(false); return toast.error("تعذّر الرفع", { description: upErr.message }); }
    setProgress(70);
    const { error: dbErr } = await supabase.from("documents").insert({
      organization_id: orgId,
      case_id: caseId || null,
      client_id: clientId || null,
      file_name: file.name,
      file_path: path,
      file_type: file.type || null,
      file_size: file.size,
      document_category: category || null,
      description: description || null,
      is_confidential: confidential,
      uploaded_by: userId,
    });
    setUploading(false); setProgress(100);
    if (dbErr) {
      await supabase.storage.from("documents").remove([path]);
      return toast.error("تعذّر الحفظ", { description: dbErr.message });
    }
    toast.success("تم الرفع");
    qc.invalidateQueries({ queryKey: ["documents"] });
    qc.invalidateQueries({ queryKey: ["case-documents"] });
    reset(); onClose();
  };

  return (
    <Modal open={open} onClose={() => { if (!uploading) { reset(); onClose(); } }} title="رفع مستند" size="lg">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2"><FormField label="الملف *">
          <input ref={fileRef} type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className={inputCls} />
          {file && <span className="mt-1 block text-xs text-muted-foreground">{file.name} · {fmtSize(file.size)}</span>}
        </FormField></div>
        <FormField label="القضية">
          <select value={caseId} onChange={(e) => setCaseId(e.target.value)} className={inputCls}>
            <option value="">— بدون —</option>
            {(cases ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.case_title}</option>)}
          </select>
        </FormField>
        <FormField label="العميل">
          <select value={clientId} onChange={(e) => setClientId(e.target.value)} className={inputCls}>
            <option value="">— بدون —</option>
            {(clients ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
          </select>
        </FormField>
        <FormField label="التصنيف"><input value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls} placeholder="عقد / محضر / حكم / ..." /></FormField>
        <FormField label="سرّي">
          <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={confidential} onChange={(e) => setConfidential(e.target.checked)} /> <span className="text-sm">تمييز كسرّي</span></label>
        </FormField>
        <div className="md:col-span-2"><FormField label="الوصف"><textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} /></FormField></div>
        {uploading && <div className="md:col-span-2 h-2 overflow-hidden rounded-full bg-surface-muted"><div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div>}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Btn variant="outline" onClick={() => { reset(); onClose(); }} disabled={uploading}>إلغاء</Btn>
        <Btn onClick={upload} disabled={uploading || !file}>{uploading ? "جاري الرفع…" : "رفع"}</Btn>
      </div>
    </Modal>
  );
}
