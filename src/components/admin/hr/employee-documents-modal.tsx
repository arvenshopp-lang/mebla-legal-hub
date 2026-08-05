import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileText, Plus, Trash2 } from "lucide-react";
import {
  Btn,
  ConfirmDialog,
  EmptyState,
  ErrorBlock,
  FormField,
  IconBtn,
  inputCls,
  Modal,
  SectionLoader,
} from "@/lib/list-utils";
import { fmtDate } from "@/lib/enums";
import { createHrDocument, deleteHrDocument, listHrDocuments } from "@/lib/hr.functions";
import type { HrDocumentRow } from "@/lib/hr.shared";

type DocForm = {
  kind: string;
  title: string;
  storagePath: string;
  issuedOn: string;
  expiresOn: string;
  notes: string;
};
const EMPTY_DOC: DocForm = {
  kind: "",
  title: "",
  storagePath: "",
  issuedOn: "",
  expiresOn: "",
  notes: "",
};

export function EmployeeDocumentsModal({
  open,
  onClose,
  employeeId,
  employeeName,
  canManage,
}: {
  open: boolean;
  onClose: () => void;
  employeeId: string | null;
  employeeName: string;
  canManage: boolean;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listHrDocuments);
  const createFn = useServerFn(createHrDocument);
  const deleteFn = useServerFn(deleteHrDocument);

  const [form, setForm] = useState<DocForm | null>(null);
  const [toDelete, setToDelete] = useState<HrDocumentRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["hr-employee-documents", employeeId],
    queryFn: () => listFn({ data: { employeeId: employeeId as string } }),
    enabled: open && !!employeeId,
  });

  const create = useMutation({
    mutationFn: (f: DocForm) =>
      createFn({
        data: {
          employeeId: employeeId as string,
          kind: f.kind.trim(),
          title: f.title.trim(),
          storagePath: f.storagePath.trim() || "",
          issuedOn: f.issuedOn || "",
          expiresOn: f.expiresOn || "",
          notes: f.notes.trim() || "",
        },
      }),
    onSuccess: () => {
      toast.success("تمت إضافة المستند");
      void qc.invalidateQueries({ queryKey: ["hr-employee-documents", employeeId] });
      setForm(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: (documentId: string) => deleteFn({ data: { documentId } }),
    onSuccess: () => {
      toast.success("تم حذف المستند");
      void qc.invalidateQueries({ queryKey: ["hr-employee-documents", employeeId] });
      setToDelete(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const documents = (query.data?.documents ?? []) as HrDocumentRow[];

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="مستندات الموظف"
      description={employeeName ? `المستندات الوظيفية لـ ${employeeName}` : undefined}
    >
      {canManage && (
        <div className="mb-4 flex justify-end">
          <Btn
            size="sm"
            onClick={() => {
              setError(null);
              setForm(EMPTY_DOC);
            }}
          >
            <Plus className="h-4 w-4" aria-hidden /> مستند جديد
          </Btn>
        </div>
      )}

      {query.isLoading ? (
        <SectionLoader label="جاري تحميل المستندات…" />
      ) : query.isError ? (
        <ErrorBlock message="تعذّر تحميل مستندات الموظف." />
      ) : documents.length === 0 ? (
        <EmptyState
          title="لا توجد مستندات"
          hint="أضف مستندات العقد أو الهوية أو الشهادات الخاصة بالموظف."
        />
      ) : (
        <ul className="divide-y divide-border rounded-[var(--radius-m)] border border-border">
          {documents.map((d) => (
            <li key={d.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 items-start gap-2.5">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold">{d.title}</p>
                  <p className="text-caption mt-0.5">
                    {d.kind}
                    {d.issued_on && ` · صدر في ${fmtDate(d.issued_on)}`}
                    {d.expires_on && ` · ينتهي في ${fmtDate(d.expires_on)}`}
                  </p>
                  {d.notes && <p className="text-caption mt-0.5">{d.notes}</p>}
                </div>
              </div>
              {canManage && (
                <IconBtn
                  tone="danger"
                  title="حذف المستند"
                  aria-label={`حذف مستند ${d.title}`}
                  onClick={() => setToDelete(d)}
                >
                  <Trash2 className="h-4 w-4" />
                </IconBtn>
              )}
            </li>
          ))}
        </ul>
      )}

      <Modal open={!!form} onClose={() => setForm(null)} title="مستند جديد">
        {form && (
          <div className="space-y-4">
            <FormField label="نوع المستند" required hint="مثال: عقد عمل، هوية، شهادة">
              <input
                className={inputCls}
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value })}
              />
            </FormField>
            <FormField label="عنوان المستند" required>
              <input
                className={inputCls}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </FormField>
            <FormField label="مسار التخزين" hint="اختياري">
              <input
                dir="ltr"
                className={`${inputCls} text-left`}
                value={form.storagePath}
                onChange={(e) => setForm({ ...form, storagePath: e.target.value })}
              />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="تاريخ الإصدار">
                <input
                  type="date"
                  className={inputCls}
                  value={form.issuedOn}
                  onChange={(e) => setForm({ ...form, issuedOn: e.target.value })}
                />
              </FormField>
              <FormField label="تاريخ الانتهاء">
                <input
                  type="date"
                  className={inputCls}
                  value={form.expiresOn}
                  onChange={(e) => setForm({ ...form, expiresOn: e.target.value })}
                />
              </FormField>
            </div>
            <FormField label="ملاحظات">
              <textarea
                className={inputCls}
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </FormField>
            {error && (
              <p
                role="alert"
                className="rounded-[var(--radius-m)] bg-danger-soft px-3 py-2.5 text-[12px] text-danger"
              >
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Btn variant="ghost" onClick={() => setForm(null)}>
                إلغاء
              </Btn>
              <Btn
                loading={create.isPending}
                onClick={() => {
                  setError(null);
                  if (!form.kind.trim() || !form.title.trim()) {
                    setError("نوع المستند وعنوانه حقلان مطلوبان.");
                    return;
                  }
                  create.mutate(form);
                }}
              >
                حفظ
              </Btn>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
        title="حذف المستند"
        message={`هل تريد حذف مستند «${toDelete?.title ?? ""}»؟ لا يمكن التراجع عن هذا الإجراء.`}
        loading={remove.isPending}
      />
    </Modal>
  );
}
