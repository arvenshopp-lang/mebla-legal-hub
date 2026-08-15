/**
 * دعوة الظهور العام في «الأكثر إنجازاً على مِهلة» — B3C.
 * تظهر تلقائياً لمدير المكتب المخوّل فقط، وعند تحقق كل شروط الظهور الفعلي خادمياً.
 * لا تعرض أي بيانات مكاتب أخرى ولا ترتيباً ولا بيانات عملاء أو قضايا أو مالية.
 */

import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  acceptOperationalRankingPrompt,
  getOperationalRankingPromptState,
  snoozeOperationalRankingPrompt,
} from "@/lib/operational-score/ranking.functions";
import {
  OPT_IN_ACCEPT_TOAST,
  OPT_IN_PROMPT_ACCEPT_LABEL,
  OPT_IN_PROMPT_BODY,
  OPT_IN_PROMPT_DISCLAIMER,
  OPT_IN_PROMPT_SNOOZE_LABEL,
  OPT_IN_PROMPT_TITLE,
} from "@/lib/operational-score/optin.shared";
import { Btn, Modal } from "@/lib/list-utils";

export function OperationalScorePrompt({ organizationId }: { organizationId: string | null }) {
  const queryClient = useQueryClient();
  const fetchState = useServerFn(getOperationalRankingPromptState);
  const acceptFn = useServerFn(acceptOperationalRankingPrompt);
  const snoozeFn = useServerFn(snoozeOperationalRankingPrompt);
  const [open, setOpen] = useState(false);
  const [decided, setDecided] = useState(false);

  // استعلام واحد لكل جلسة عرض: الطابع الخادمي لا يتأثر بإعادة الرسم.
  const { data } = useQuery({
    queryKey: ["operational-ranking-prompt", organizationId],
    enabled: !!organizationId,
    staleTime: 60 * 60 * 1000,
    retry: false,
    queryFn: () => fetchState({ data: { organizationId: organizationId! } }),
  });

  useEffect(() => {
    if (data?.visible && !decided) setOpen(true);
  }, [data?.visible, decided]);

  const finish = useCallback(() => {
    setDecided(true);
    setOpen(false);
    void queryClient.invalidateQueries({
      queryKey: ["operational-ranking-prompt", organizationId],
    });
  }, [organizationId, queryClient]);

  const accept = useMutation({
    mutationFn: () => acceptFn({ data: { organizationId: organizationId! } }),
    onSuccess: () => {
      toast.success(OPT_IN_ACCEPT_TOAST);
      finish();
    },
    onError: (error: unknown) => {
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : "تعذّر تفعيل الظهور العام حالياً. حاول مرة أخرى.",
      );
    },
  });

  const snooze = useMutation({
    mutationFn: () => snoozeFn({ data: { organizationId: organizationId! } }),
    onSettled: finish,
  });

  const busy = accept.isPending || snooze.isPending;
  // الإغلاق أو Escape أو X = «ليس الآن» بالكامل: تأجيل خادمي 30 يوماً.
  const dismiss = useCallback(() => {
    if (busy) return;
    snooze.mutate();
  }, [busy, snooze]);

  if (!organizationId || !data?.visible) return null;

  return (
    <Modal
      open={open}
      onClose={dismiss}
      title={OPT_IN_PROMPT_TITLE}
      busy={busy}
      busyLabel="جاري الحفظ…"
    >
      <div className="space-y-3">
        {OPT_IN_PROMPT_BODY.map((line) => (
          <p key={line} className="text-body-sm leading-relaxed">
            {line}
          </p>
        ))}
        <p className="text-caption border-t border-border pt-3">{OPT_IN_PROMPT_DISCLAIMER}</p>
      </div>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
        <Btn
          className="min-h-11 w-full sm:w-auto"
          loading={accept.isPending}
          disabled={busy}
          onClick={() => accept.mutate()}
        >
          {OPT_IN_PROMPT_ACCEPT_LABEL}
        </Btn>
        <Btn
          variant="ghost"
          className="min-h-11 w-full sm:w-auto"
          loading={snooze.isPending}
          disabled={busy}
          onClick={dismiss}
        >
          {OPT_IN_PROMPT_SNOOZE_LABEL}
        </Btn>
      </div>
    </Modal>
  );
}
