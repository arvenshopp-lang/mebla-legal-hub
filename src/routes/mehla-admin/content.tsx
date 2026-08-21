import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { AdminShell } from "@/components/admin/shell";
import {
  Badge,
  Btn,
  ConfirmDialog,
  DataCard,
  EmptyState,
  ErrorBlock,
  FormField,
  IconBtn,
  LoadingBlock,
  Modal,
  Td,
  Th,
  inputCls,
} from "@/lib/list-utils";
import { fmtDateTime } from "@/lib/enums";
import {
  deleteContentPage,
  listContentPages,
  saveContentPage,
} from "@/lib/admin-console.functions";
import { CONTENT_KINDS, type ContentKind, type ContentPage } from "@/lib/admin-console.shared";
import { usePlatformAdmin } from "@/hooks/use-platform-admin";
import { NOINDEX_META } from "@/config/indexing";

export const Route = createFileRoute("/mehla-admin/content")({
  head: () => ({
    meta: [
      { title: "إدارة المحتوى · إدارة مِهلة" },
      NOINDEX_META,
    ],
  }),
  component: ContentPage_,
});

type Draft = {
  id: string | null;
  slug: string;
  kind: ContentKind;
  title: string;
  description: string;
  content: string;
  isPublished: boolean;
};

const emptyDraft: Draft = {
  id: null,
  slug: "",
  kind: "page",
  title: "",
  description: "",
  content: "{\n  \n}",
  isPublished: false,
};

function ContentPage_() {
  const { can } = usePlatformAdmin();
  const manage = can("content.manage");
  const queryClient = useQueryClient();

  const load = useServerFn(listContentPages);
  const save = useServerFn(saveContentPage);
  const remove = useServerFn(deleteContentPage);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toDelete, setToDelete] = useState<ContentPage | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-content-pages"],
    queryFn: () => load({ data: undefined }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin-content-pages"] });

  const saveMutation = useMutation({
    mutationFn: (d: Draft) =>
      save({
        data: {
          id: d.id,
          slug: d.slug,
          kind: d.kind,
          title: d.title,
          description: d.description,
          content: d.content,
          isPublished: d.isPublished,
        },
      }),
    onSuccess: () => {
      toast.success("تم حفظ المحتوى.");
      setDraft(null);
      setErrors({});
      void invalidate();
    },
    onError: (error: Error) => {
      setErrors({ form: error.message || "تعذّر الحفظ." });
      toast.error(error.message || "تعذّر الحفظ.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("تم حذف المحتوى.");
      setToDelete(null);
      void invalidate();
    },
    onError: (error: Error) => toast.error(error.message || "تعذّر الحذف."),
  });

  const openEdit = (page: ContentPage) =>
    setDraft({
      id: page.id,
      slug: page.slug,
      kind: page.kind,
      title: page.title,
      description: page.description ?? "",
      content: JSON.stringify(page.content ?? {}, null, 2),
      isPublished: page.is_published,
    });

  const submit = () => {
    if (!draft) return;
    const next: Record<string, string> = {};
    if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(draft.slug))
      next.slug = "المعرّف يقبل الحروف اللاتينية الصغيرة والأرقام والشرطة فقط.";
    if (draft.title.trim().length < 2) next.title = "العنوان مطلوب.";
    try {
      const parsed: unknown = JSON.parse(draft.content.trim() === "" ? "{}" : draft.content);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
        next.content = "يجب أن يكون المحتوى كائن JSON.";
    } catch {
      next.content = "صيغة JSON غير صحيحة.";
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    saveMutation.mutate(draft);
  };

  const pages = data ?? [];

  return (
    <AdminShell
      title="إدارة المحتوى"
      description="محتوى الصفحات التسويقية والنظامية والبنرات — يُنشر مباشرة عند التفعيل."
      actions={
        manage ? (
          <Btn size="sm" onClick={() => setDraft(emptyDraft)}>
            <Plus className="h-4 w-4" aria-hidden />
            محتوى جديد
          </Btn>
        ) : undefined
      }
    >
      {isLoading ? (
        <LoadingBlock rows={5} cols={4} />
      ) : isError ? (
        <ErrorBlock message="تعذّر قراءة المحتوى." />
      ) : pages.length === 0 ? (
        <EmptyState
          title="لا يوجد محتوى منشور"
          hint="أضف أول عنصر محتوى ليظهر في الصفحات العامة."
          action={
            manage ? (
              <Btn size="sm" onClick={() => setDraft(emptyDraft)}>
                إضافة محتوى
              </Btn>
            ) : undefined
          }
        />
      ) : (
        <DataCard>
          <table className="w-full text-right">
            <thead>
              <tr>
                <Th>العنوان</Th>
                <Th>النوع</Th>
                <Th className="hidden sm:table-cell">الحالة</Th>
                <Th className="hidden md:table-cell">آخر تحديث</Th>
                <Th>إجراءات</Th>
              </tr>
            </thead>
            <tbody>
              {pages.map((page) => (
                <tr key={page.id}>
                  <Td>
                    <span className="font-semibold">{page.title}</span>
                    <span className="text-caption block">{page.slug}</span>
                  </Td>
                  <Td>{CONTENT_KINDS[page.kind] ?? page.kind}</Td>
                  <Td className="hidden sm:table-cell">
                    <Badge tone={page.is_published ? "green" : "muted"}>
                      {page.is_published ? "منشور" : "مسودة"}
                    </Badge>
                  </Td>
                  <Td className="hidden md:table-cell">
                    <span className="text-caption">
                      {fmtDateTime(page.updated_at)} · نسخة {page.version}
                    </span>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-1">
                      <IconBtn
                        aria-label="تعديل"
                        title="تعديل"
                        onClick={() => openEdit(page)}
                        disabled={!manage}
                      >
                        <Pencil className="h-4 w-4" aria-hidden />
                      </IconBtn>
                      <IconBtn
                        aria-label="حذف"
                        title="حذف"
                        tone="danger"
                        onClick={() => setToDelete(page)}
                        disabled={!manage}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </IconBtn>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataCard>
      )}

      <Modal
        open={draft !== null}
        onClose={() => {
          setDraft(null);
          setErrors({});
        }}
        title={draft?.id ? "تعديل المحتوى" : "محتوى جديد"}
        description="المحتوى يُخزَّن ككائن JSON منظّم لتستخدمه الصفحات العامة."
        size="lg"
        busy={saveMutation.isPending}
        busyLabel="جاري الحفظ…"
      >
        {draft && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label="المعرّف (Slug)"
                required
                error={errors.slug}
                hint="مثال: pricing-hero"
              >
                <input
                  className={inputCls}
                  dir="ltr"
                  value={draft.slug}
                  onChange={(e) => setDraft({ ...draft, slug: e.target.value.toLowerCase() })}
                />
              </FormField>
              <FormField label="النوع" required>
                <select
                  className={inputCls}
                  value={draft.kind}
                  onChange={(e) => setDraft({ ...draft, kind: e.target.value as ContentKind })}
                >
                  {Object.entries(CONTENT_KINDS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>

            <FormField label="العنوان" required error={errors.title}>
              <input
                className={inputCls}
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </FormField>

            <FormField label="وصف مختصر" hint="يُستخدم في وصف الصفحة ومشاركتها.">
              <input
                className={inputCls}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </FormField>

            <FormField label="المحتوى (JSON)" required error={errors.content}>
              <textarea
                className={`${inputCls} min-h-[220px] font-mono text-[12px] leading-6`}
                dir="ltr"
                spellCheck={false}
                value={draft.content}
                onChange={(e) => setDraft({ ...draft, content: e.target.value })}
              />
            </FormField>

            <label className="flex items-center gap-2.5 text-body-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--color-primary)]"
                checked={draft.isPublished}
                onChange={(e) => setDraft({ ...draft, isPublished: e.target.checked })}
              />
              نشر المحتوى للزوار
            </label>

            {errors.form && (
              <p role="alert" className="text-[12px] text-danger">
                {errors.form}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <Btn
                variant="outline"
                onClick={() => {
                  setDraft(null);
                  setErrors({});
                }}
              >
                إلغاء
              </Btn>
              <Btn onClick={submit} loading={saveMutation.isPending} disabled={!manage}>
                <FileText className="h-4 w-4" aria-hidden />
                حفظ
              </Btn>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={toDelete !== null}
        title="حذف المحتوى"
        message={`سيُحذف «${toDelete?.title ?? ""}» نهائياً ولن يظهر للزوار.`}
        confirmLabel="حذف"
        danger
        loading={deleteMutation.isPending}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && deleteMutation.mutate(toDelete.id)}
      />

      {!isLoading && !isError && (
        <p className="text-caption mt-4">
          <button
            type="button"
            className="underline underline-offset-4"
            onClick={() => void refetch()}
          >
            تحديث القائمة
          </button>
        </p>
      )}
    </AdminShell>
  );
}
