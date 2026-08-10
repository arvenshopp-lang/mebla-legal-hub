import { useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getWorkItemCaptureIssueFn } from "@/lib/work-items/timeline.functions";
import { WORK_EVENT_LABELS } from "@/lib/work-items/timeline.shared";

type ItemType = "task" | "deadline";

const ITEM_LABEL: Record<ItemType, string> = { task: "المهمة", deadline: "المهلة" };

/**
 * تنبيه غير معيق: إذا فشل تسجيل الحدث في سجل الأحداث بعد نجاح الحفظ، نُظهر
 * تحذيراً واضحاً يؤكد أن الحفظ تم فعلياً ويربط المستخدم بمرجع التتبع WIE-XXXX.
 * فشل الفحص نفسه لا يُظهر شيئاً ولا يعطّل أي عملية.
 */
export function useWorkItemCaptureNotice(organizationId: string | null | undefined) {
  const check = useServerFn(getWorkItemCaptureIssueFn);

  return useCallback(
    async (itemType: ItemType, itemId: string | null | undefined, since: string) => {
      if (!organizationId || !itemId) return;
      try {
        const issue = await check({ data: { organizationId, itemType, itemId, since } });
        if (!issue) return;
        const label = ITEM_LABEL[itemType];
        const eventLabel = issue.event
          ? (WORK_EVENT_LABELS[issue.event as keyof typeof WORK_EVENT_LABELS] ?? null)
          : null;
        toast.warning(`تم حفظ ${label}، لكن تعذّر تسجيل الحدث في السجل`, {
          description: `${label} محفوظة ولم يتأثر أي بيان${eventLabel ? ` — الحدث المتعذّر: ${eventLabel}` : ""}. مرجع التتبع: ${issue.ref} (يمكن لمالك المكتب مراجعته في سجل الأعطال).`,
          duration: 10_000,
        });
      } catch {
        // التنبيه ثانوي بطبيعته: لا نعرض خطأً إضافياً للمستخدم إذا تعذّر الفحص
      }
    },
    [check, organizationId],
  );
}
