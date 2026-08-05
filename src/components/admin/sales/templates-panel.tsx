import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Badge,
  Btn,
  ConfirmDialog,
  DataCard,
  EmptyState,
  FormField,
  IconBtn,
  LoadingBlock,
  Modal,
  SectionCard,
  Td,
  Th,
  inputCls,
} from "@/lib/list-utils";
import { usePlatformAdmin } from "@/hooks/use-platform-admin";
import {
  salesDeleteTemplate,
  salesListTemplates,
  salesSaveTemplate,
} from "@/lib/sales-docs.functions";
import { KIND_LABELS, type SalesDocKind, type SalesDocTemplateRow } from "@/lib/sales-docs.shared";

type TemplateForm = {
  id?: string;
  kind: SalesDocKind;
  name: string;
  intro: string;
  terms: string;
  defaultTaxRate: number;
  defaultValidityDays: number;
  isActive: boolean;
  items: { description: string; quantity: number; unitPrice: number; discountAmount: number }[];
};

const emptyTemplate: TemplateForm = {
  kind: "quote",
  name: "",
  intro: "",
  terms: "",
  defaultTaxRate: 15,
  defaultValidityDays: 30,
  isActive: true,
  items: [],
};

const fromRow = (row: SalesDocTemplateRow): TemplateForm => ({
  id: row.id,
  kind: row.kind,
  name: row.name,
  intro: row.intro ?? "",
  terms: row.terms ?? "",
  defaultTaxRate: row.default_tax_rate,
  defaultValidityDays: row.default_validity_days,
  isActive: row.is_active,
  items: row.items.map((item) => ({
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unit_price,
    discountAmount: item.discount_amount,
  })),
});

export function TemplatesPanel() {
  const { can } = usePlatformAdmin();
  const queryClient = useQueryClient();
  const listFn = useServerFn(salesListTemplates);
  const saveFn = useServerFn(salesSaveTemplate);
  const deleteFn = useServerFn(salesDeleteTemplate);
  const [form, setForm] = useState<TemplateForm | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SalesDocTemplateRow | null>(null);
  const canManage = can("sales_docs.manage_templates");

  const templates = useQuery({
    queryKey: ["sales-templates"],
    queryFn: () => listFn({ data: undefined as never }),
  });

  const save = useMutation({
    mutationFn: async (value: TemplateForm) =>
      saveFn({
        data: {
          id: value.id ?? null,
          kind: value.kind,
          name: value.name.trim(),
          intro: value.intro.trim() === "" ? null : value.intro.trim(),
          terms: value.terms.trim() === "" ? null : value.terms.trim(),
          defaultTaxRate: Number(value.defaultTaxRate) || 0,
          defaultValidityDays: Number(value.defaultValidityDays) || 0,
          isActive: value.isActive,
          items: value.items,
        },
      }),
    onSuccess: () => {
      toast.success("تم حفظ القالب.");
      setForm(null);
      void queryClient.invalidateQueries({ queryKey: ["sales-templates"] });
    },
    onError: (error: Error) => toast.error(error.message || "تعذّر حفظ القالب."),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("تم حذف القالب.");
      setPendingDelete(null);
      void queryClient.invalidateQueries({ queryKey: ["sales-templates"] });
    },
    onError: (error: Error) => toast.error(error.message || "تعذّر حذف القالب."),
  });

  return (
    <SectionCard
      title="قوالب العروض والعقود"
      description="القوالب تضبط المقدمة والشروط ونسبة الضريبة ومدة الصلاحية والبنود المبدئية."
      actions={
        canManage ? (
          <Btn size="sm" onClick={() => setForm(emptyTemplate)}>
            <Plus className="h-4 w-4" aria-hidden /> قالب جديد
          </Btn>
        ) : undefined
      }
    >
      {templates.isLoading ? (
        <LoadingBlock rows={4} cols={4} />
      ) : (templates.data?.templates.length ?? 0) === 0 ? (
        <EmptyState
          title="لا توجد قوالب بعد"
          hint="أنشئ قالباً لتسريع إعداد العروض والعقود المتكررة."
        />
      ) : (
        <DataCard>
          <table className="w-full text-body-sm">
            <thead>
              <tr>
                <Th>الاسم</Th>
                <Th>النوع</Th>
                <Th>الضريبة</Th>
                <Th>مدة الصلاحية</Th>
                <Th>الحالة</Th>
                <Th>—</Th>
              </tr>
            </thead>
            <tbody>
              {(templates.data?.templates ?? []).map((template) => (
                <tr key={template.id}>
                  <Td>{template.name}</Td>
                  <Td>{KIND_LABELS[template.kind]}</Td>
                  <Td>{template.default_tax_rate}%</Td>
                  <Td>{template.default_validity_days} يوم</Td>
                  <Td>
                    <Badge tone={template.is_active ? "green" : "muted"}>
                      {template.is_active ? "نشط" : "معطّل"}
                    </Badge>
                  </Td>
                  <Td>
                    {canManage && (
                      <div className="flex gap-1">
                        <Btn variant="outline" size="sm" onClick={() => setForm(fromRow(template))}>
                          تعديل
                        </Btn>
                        <IconBtn
                          aria-label="حذف القالب"
                          tone="danger"
                          onClick={() => setPendingDelete(template)}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </IconBtn>
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataCard>
      )}

      {form && (
        <Modal
          open
          onClose={() => setForm(null)}
          title={form.id ? "تعديل قالب" : "قالب جديد"}
          size="lg"
          busy={save.isPending}
          busyLabel="جاري الحفظ…"
        >
          <div className="grid gap-4">
            <FormField label="اسم القالب" required>
              <input
                className={inputCls}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                maxLength={150}
              />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField label="النوع">
                <select
                  className={inputCls}
                  value={form.kind}
                  onChange={(e) => setForm({ ...form, kind: e.target.value as SalesDocKind })}
                >
                  {(Object.keys(KIND_LABELS) as SalesDocKind[]).map((kind) => (
                    <option key={kind} value={kind}>
                      {KIND_LABELS[kind]}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="نسبة الضريبة %">
                <input
                  type="number"
                  min={0}
                  max={100}
                  className={inputCls}
                  value={form.defaultTaxRate}
                  onChange={(e) => setForm({ ...form, defaultTaxRate: Number(e.target.value) })}
                />
              </FormField>
              <FormField label="مدة الصلاحية (يوم)">
                <input
                  type="number"
                  min={0}
                  max={365}
                  className={inputCls}
                  value={form.defaultValidityDays}
                  onChange={(e) =>
                    setForm({ ...form, defaultValidityDays: Number(e.target.value) })
                  }
                />
              </FormField>
            </div>
            <FormField label="المقدمة">
              <textarea
                className={inputCls}
                rows={3}
                value={form.intro}
                onChange={(e) => setForm({ ...form, intro: e.target.value })}
                maxLength={2000}
              />
            </FormField>
            <FormField label="الشروط والأحكام">
              <textarea
                className={inputCls}
                rows={4}
                value={form.terms}
                onChange={(e) => setForm({ ...form, terms: e.target.value })}
                maxLength={4000}
              />
            </FormField>
            <label className="flex items-center gap-2 text-body-sm">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                className="h-4 w-4 rounded border-border"
              />
              قالب نشط ومتاح للاختيار
            </label>
            <div className="flex justify-end gap-2">
              <Btn variant="outline" onClick={() => setForm(null)}>
                إلغاء
              </Btn>
              <Btn
                loading={save.isPending}
                onClick={() => {
                  if (form.name.trim().length < 2) {
                    toast.error("اسم القالب مطلوب.");
                    return;
                  }
                  save.mutate(form);
                }}
              >
                حفظ
              </Btn>
            </div>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title="حذف القالب"
        message={`سيُحذف القالب «${pendingDelete?.name ?? ""}» نهائياً. المستندات المنشأة منه لا تتأثر.`}
        confirmLabel="حذف"
        loading={remove.isPending}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete.id)}
      />
    </SectionCard>
  );
}
