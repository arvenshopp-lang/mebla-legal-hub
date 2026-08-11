import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import {
  Btn,
  DataCard,
  EmptyState,
  ErrorBlock,
  FormField,
  LoadingBlock,
  Modal,
  Pagination,
  Td,
  Th,
  inputCls,
} from "@/lib/list-utils";
import { fmtDateTime } from "@/lib/enums";
import {
  createConversionEvent,
  listConversionEvents,
  listMarketingCampaigns,
} from "@/lib/marketing.functions";
import type { MarketingConversionEventRow } from "@/lib/marketing.shared";
import { fmtNumber } from "@/lib/format";

export function ConversionsPanel({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const pageSize = 20;

  const listFn = useServerFn(listConversionEvents);
  const query = useQuery({
    queryKey: ["marketing-conversion-events", page],
    queryFn: () => listFn({ data: { page, pageSize } }),
  });

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <Btn onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden /> تسجيل حدث تحويل
          </Btn>
        </div>
      )}

      {query.isLoading ? (
        <LoadingBlock rows={6} cols={5} />
      ) : query.isError ? (
        <ErrorBlock message="تعذّر تحميل أحداث التحويل." />
      ) : (query.data?.rows.length ?? 0) === 0 ? (
        <EmptyState
          title="لا توجد أحداث تحويل"
          hint="سجّل أول حدث تحويل لربط الحملات بالنتائج الفعلية."
        />
      ) : (
        <>
          <DataCard>
            <table className="w-full min-w-[760px] text-right">
              <thead>
                <tr>
                  <Th>الحملة</Th>
                  <Th>نوع الحدث</Th>
                  <Th>الوصف</Th>
                  <Th>القيمة</Th>
                  <Th>المصدر</Th>
                  <Th>تاريخ الحدوث</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {query.data!.rows.map((e: MarketingConversionEventRow) => (
                  <tr key={e.id} className="hover:bg-surface-muted/60">
                    <Td>{e.campaign_name ?? "—"}</Td>
                    <Td>{e.event_key}</Td>
                    <Td>{e.label ?? "—"}</Td>
                    <Td className="tabular-nums">{fmtNumber(e.value_amount)}</Td>
                    <Td>{e.source ?? "—"}</Td>
                    <Td>{fmtDateTime(e.occurred_at)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataCard>
          <Pagination page={page} setPage={setPage} total={query.data!.total} pageSize={pageSize} />
        </>
      )}

      <ConversionDialog
        open={open}
        onClose={() => setOpen(false)}
        onSaved={() => {
          setOpen(false);
          qc.invalidateQueries({ queryKey: ["marketing-conversion-events"] });
          qc.invalidateQueries({ queryKey: ["marketing-performance"] });
        }}
      />
    </div>
  );
}

function ConversionDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const createFn = useServerFn(createConversionEvent);
  const campaignsFn = useServerFn(listMarketingCampaigns);
  const { data: campaigns } = useQuery({
    queryKey: ["marketing-campaigns-options"],
    queryFn: () => campaignsFn({ data: { page: 1, pageSize: 100 } }),
    enabled: open,
  });

  const [campaignId, setCampaignId] = useState("");
  const [eventKey, setEventKey] = useState("");
  const [label, setLabel] = useState("");
  const [valueAmount, setValueAmount] = useState("0");
  const [source, setSource] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setCampaignId("");
    setEventKey("");
    setLabel("");
    setValueAmount("0");
    setSource("");
    setError(null);
  };

  const save = useMutation({
    mutationFn: async () =>
      createFn({
        data: {
          campaignId,
          eventKey: eventKey.trim(),
          label,
          valueAmount: Number(valueAmount) || 0,
          source,
        },
      }),
    onSuccess: () => {
      toast.success("تم تسجيل حدث التحويل");
      reset();
      onSaved();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="تسجيل حدث تحويل"
      description="يُستخدم لربط نتيجة فعلية (تسجيل، اتصال، توقيع) بحملة تسويقية."
    >
      <div className="space-y-4">
        <FormField label="الحملة">
          <select
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
            className={inputCls}
          >
            <option value="">بدون حملة محددة</option>
            {(campaigns?.rows ?? []).map((c: { id: string; name: string }) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="نوع الحدث" required hint="مثال: lead_created، demo_booked، deal_won">
          <input
            value={eventKey}
            onChange={(e) => setEventKey(e.target.value)}
            className={inputCls}
          />
        </FormField>
        <FormField label="الوصف">
          <input value={label} onChange={(e) => setLabel(e.target.value)} className={inputCls} />
        </FormField>
        <FormField label="القيمة">
          <input
            type="number"
            min={0}
            value={valueAmount}
            onChange={(e) => setValueAmount(e.target.value)}
            className={inputCls}
          />
        </FormField>
        <FormField label="المصدر">
          <input value={source} onChange={(e) => setSource(e.target.value)} className={inputCls} />
        </FormField>
        {error && (
          <p
            role="alert"
            className="rounded-[var(--radius-m)] bg-danger-soft px-3 py-2.5 text-[12px] text-danger"
          >
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Btn variant="outline" onClick={onClose} disabled={save.isPending}>
            إلغاء
          </Btn>
          <Btn
            onClick={() => {
              setError(null);
              if (eventKey.trim().length < 2) return setError("نوع الحدث مطلوب.");
              save.mutate();
            }}
            loading={save.isPending}
          >
            تسجيل الحدث
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
