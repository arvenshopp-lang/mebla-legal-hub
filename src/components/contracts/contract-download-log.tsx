import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { History, Clock, AlertCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { getContractDownloadLogFn } from "@/lib/contracts/contracts.functions";

const CHANNEL_LABELS: Record<string, string> = {
  public_sign_link: "رابط التوقيع (الموكل)",
  office_workspace: "مساحة عمل المكتب",
};

/** نافذة قراءة فقط لسجل تنزيلات نسخة العقد — سجل غير قابل للتعديل أو الحذف. */
export function ContractDownloadLogDialog({
  contractId,
  contractNumber,
  onClose,
}: {
  contractId: string;
  contractNumber: string;
  onClose: () => void;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["contract-download-log", contractId],
    queryFn: () => getContractDownloadLogFn({ data: { contractId } }),
  });

  const entries = data?.entries ?? [];

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader className="text-right">
          <DialogTitle className="flex items-center gap-2 text-base">
            <History className="w-4 h-4 text-primary shrink-0" />
            سجل تنزيلات العقد {contractNumber}
          </DialogTitle>
          <DialogDescription className="text-xs">
            سجل تدقيق محصّن لعمليات تنزيل النسخة النهائية، يشمل وقت التنزيل والجهة والقناة ورقم
            التحقق. لا يمكن تعديل هذا السجل أو حذفه.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="p-8 text-center text-xs text-slate-500" role="status" aria-live="polite">
            <Clock className="w-5 h-5 animate-spin mx-auto mb-2 text-primary" />
            جارٍ تحميل سجل التنزيلات...
          </div>
        ) : isError ? (
          <div className="p-8 text-center text-xs text-rose-600">
            <AlertCircle className="w-5 h-5 mx-auto mb-2" />
            تعذّر جلب سجل التنزيلات حالياً، يرجى المحاولة بعد قليل.
          </div>
        ) : entries.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            لم يُنزَّل هذا العقد بعد من أي جهة.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[60vh] overflow-y-auto text-xs">
            {entries.map((entry) => (
              <li key={entry.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
                <div className="space-y-1 min-w-0">
                  <div className="font-semibold text-slate-800 dark:text-slate-200">
                    {new Date(entry.downloadedAt).toLocaleString("ar-SA", {
                      timeZone: "Asia/Riyadh",
                    })}
                  </div>
                  <div className="text-slate-500">
                    {entry.actorLabel || "غير محدد"}
                    {entry.verificationId ? ` • رقم التحقق: ${entry.verificationId}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {entry.ipAddress ? (
                    <span className="font-mono text-[10px] text-slate-400">{entry.ipAddress}</span>
                  ) : null}
                  <Badge variant="outline" className="text-[10px] font-semibold">
                    {CHANNEL_LABELS[entry.channel] ?? entry.channel}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
