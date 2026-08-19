import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { ContractSigningView } from "@/components/contracts/contract-signing-view";

/**
 * نافذة توقيع مضغوطة داخل مساحة عمل المكتب: لا تغطي الشاشة ولا تحجب
 * القائمة الجانبية، فيبقى التنقل متاحاً للمشترك أثناء التوقيع.
 * على الجوال تتحول إلى Bottom Sheet مع طبقة تعتيم خفيفة.
 */
export function ContractSignModal({
  token,
  contractNumber,
  onClose,
  onSigned,
}: {
  token: string;
  contractNumber: string;
  onClose: () => void;
  onSigned?: () => void;
}) {
  return (
    <DialogPrimitive.Root open modal={false} onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        {/* تعتيم على الشاشات الصغيرة فقط — سطح المكتب يبقى القائمة الجانبية ظاهرة وقابلة للاستخدام */}
        <div
          className="fixed inset-0 z-[60] bg-black/40 lg:hidden"
          aria-hidden
          onClick={onClose}
        />
        <DialogPrimitive.Content
          dir="rtl"
          onInteractOutside={(event) => event.preventDefault()}
          className="fixed inset-x-0 bottom-0 z-[61] flex max-h-[85vh] flex-col rounded-t-2xl border bg-background shadow-2xl outline-none sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-[7vh] sm:w-[min(42rem,calc(100vw-3rem))] sm:-translate-x-1/2 sm:rounded-2xl lg:left-[calc(50%-132px)]"
        >
          <div className="flex items-center justify-between gap-3 border-b px-5 py-3.5">
            <div className="min-w-0">
              <DialogPrimitive.Title className="truncate text-base font-bold">
                توقيع العقد إلكترونياً
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="truncate text-xs text-muted-foreground">
                العقد رقم {contractNumber} — يمكنك التنقل في المنصة دون إغلاق النافذة.
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close
              aria-label="إغلاق نافذة التوقيع"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-4 w-4" aria-hidden />
            </DialogPrimitive.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <ContractSigningView token={token} compact onSigned={onSigned} />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
