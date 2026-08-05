/**
 * لوحة مراحل خط البيع: ترتيب، احتمالية، تعطيل، حذف.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Badge,
  Btn,
  ConfirmDialog,
  DataCard,
  EmptyState,
  ErrorBlock,
  IconBtn,
  LoadingBlock,
  SectionCard,
  Td,
  Th,
} from "@/lib/list-utils";
import { usePlatformAdmin } from "@/hooks/use-platform-admin";
import { deletePipelineStage, listPipelineStages } from "@/lib/crm.functions";
import type { CrmPipelineStageRow } from "@/lib/crm.shared";
import { StageFormModal, emptyStageDraft, stageDraftFromRow, type StageDraft } from "./stage-form";

type Dialog =
  | { kind: "none" }
  | { kind: "form"; initial: StageDraft; editId?: string }
  | { kind: "delete"; row: CrmPipelineStageRow };

export function StagesPanel() {
  const { can } = usePlatformAdmin();
  const queryClient = useQueryClient();
  const listFn = useServerFn(listPipelineStages);
  const removeFn = useServerFn(deletePipelineStage);
  const [dialog, setDialog] = useState<Dialog>({ kind: "none" });
  const [removing, setRemoving] = useState(false);

  const query = useQuery({ queryKey: ["crm-stages"], queryFn: () => listFn({ data: undefined }) });
  const stages = query.data?.stages ?? [];
  const canManage = can("crm.manage_pipeline");

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["crm-stages"] });
    void queryClient.invalidateQueries({ queryKey: ["crm-pipeline"] });
    setDialog({ kind: "none" });
  };

  const confirmDelete = async () => {
    if (dialog.kind !== "delete") return;
    setRemoving(true);
    try {
      await removeFn({ data: { id: dialog.row.id } });
      toast.success("تم حذف المرحلة.");
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر حذف المرحلة.");
    } finally {
      setRemoving(false);
    }
  };

  return (
    <SectionCard
      title="مراحل خط البيع"
      description="ترتيب المراحل واحتمالية الإغلاق المستخدمة في حساب التوقعات المرجّحة."
      actions={
        canManage ? (
          <Btn size="sm" onClick={() => setDialog({ kind: "form", initial: emptyStageDraft(stages.length + 1) })}>
            <Plus className="h-4 w-4" aria-hidden /> مرحلة
          </Btn>
        ) : undefined
      }
    >
      {query.isLoading ? (
        <LoadingBlock rows={4} cols={4} />
      ) : query.isError ? (
        <ErrorBlock message="تعذّر جلب مراحل خط البيع." />
      ) : stages.length === 0 ? (
        <EmptyState title="لا توجد مراحل" hint="أضف مراحل خط البيع لتتمكن من إنشاء الصفقات." />
      ) : (
        <DataCard>
          <table className="w-full min-w-[34rem] text-body-sm">
            <thead>
              <tr>
                <Th>الترتيب</Th>
                <Th>المرحلة</Th>
                <Th>الاحتمالية</Th>
                <Th>النوع</Th>
                <Th className="text-left">إجراءات</Th>
              </tr>
            </thead>
            <tbody>
              {stages.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <Td>{row.sort_order}</Td>
                  <Td>
                    <span className="font-semibold">{row.name}</span>
                    {!row.is_active && (
                      <Badge tone="muted">
                        معطّلة
                      </Badge>
                    )}
                  </Td>
                  <Td>{row.probability}%</Td>
                  <Td>
                    {row.is_won ? (
                      <Badge tone="green">مرحلة فوز</Badge>
                    ) : row.is_lost ? (
                      <Badge tone="red">مرحلة خسارة</Badge>
                    ) : (
                      <Badge tone="info">مرحلة تقدّم</Badge>
                    )}
                  </Td>
                  <Td className="text-left">
                    <div className="flex items-center justify-end gap-1">
                      {canManage && (
                        <>
                          <IconBtn
                            aria-label="تعديل"
                            title="تعديل"
                            onClick={() => setDialog({ kind: "form", initial: stageDraftFromRow(row), editId: row.id })}
                          >
                            <Pencil className="h-4 w-4" aria-hidden />
                          </IconBtn>
                          <IconBtn aria-label="حذف" title="حذف" tone="danger" onClick={() => setDialog({ kind: "delete", row })}>
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </IconBtn>
                        </>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataCard>
      )}

      {dialog.kind === "form" && (
        <StageFormModal
          open
          onClose={() => setDialog({ kind: "none" })}
          onSaved={refresh}
          initial={dialog.initial}
          editId={dialog.editId}
        />
      )}
      <ConfirmDialog
        open={dialog.kind === "delete"}
        onClose={() => setDialog({ kind: "none" })}
        onConfirm={() => void confirmDelete()}
        title="حذف مرحلة"
        message={dialog.kind === "delete" ? `سيتم حذف مرحلة «${dialog.row.name}».` : ""}
        loading={removing}
      />
    </SectionCard>
  );
}
