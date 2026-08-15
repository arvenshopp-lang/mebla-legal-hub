/**
 * إعداد «الظهور في مؤشر الإنجاز» في إعدادات المكتب.
 * يقرأ ويكتب نفس مصدر الحقيقة الخادمي (`public_opt_in`) المستخدم في نافذة الدعوة،
 * ولا يعرض أي سبب تقني لبوابة منع التلاعب ولا مكوّنات النتيجة الخام.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getOperationalRankingConsent,
  setOperationalRankingOptIn,
} from "@/lib/operational-score/ranking.functions";
import {
  CONSENT_DISABLE_TOAST,
  CONSENT_DISCLAIMER,
  CONSENT_ENABLE_TOAST,
  CONSENT_MANAGER_ONLY_NOTE,
  CONSENT_PUBLIC_FIELDS,
  CONSENT_SECTION_BODY,
  CONSENT_SECTION_TITLE,
  CONSENT_STATUS_HINTS,
  CONSENT_STATUS_LABELS,
  CONSENT_TOGGLE_LABEL,
} from "@/lib/operational-score/optin.shared";
import { LoadingBlock } from "@/lib/list-utils";

const STATUS_TONE: Record<string, string> = {
  enabled: "bg-primary/10 text-primary",
  eligible_off: "bg-surface-muted text-foreground",
  under_review: "bg-surface-muted text-muted-foreground",
  not_eligible: "bg-surface-muted text-muted-foreground",
};

export function PublicRankingConsentCard({ orgId }: { orgId: string | null }) {
  const qc = useQueryClient();
  const fetchConsent = useServerFn(getOperationalRankingConsent);
  const saveConsent = useServerFn(setOperationalRankingOptIn);

  const queryKey = ["operational-ranking-consent", orgId] as const;
  const { data, isLoading, isError } = useQuery({
    queryKey,
    enabled: !!orgId,
    retry: false,
    staleTime: 5 * 60 * 1000,
    queryFn: () => fetchConsent({ data: { organizationId: orgId! } }),
  });

  const mutation = useMutation({
    mutationFn: (optIn: boolean) => saveConsent({ data: { organizationId: orgId!, optIn } }),
    onSuccess: (_result, optIn) => {
      toast.success(optIn ? CONSENT_ENABLE_TOAST : CONSENT_DISABLE_TOAST);
      void qc.invalidateQueries({ queryKey });
      void qc.invalidateQueries({ queryKey: ["operational-ranking-prompt", orgId] });
    },
    onError: () => toast.error("تعذّر تحديث إعداد الظهور العام حالياً. حاول مرة أخرى."),
  });

  if (!orgId) return null;

  const busy = mutation.isPending;
  const checked = data?.publicOptIn === true;
  const canToggle = !!data && (checked ? data.canDisable : data.canEnable) && !busy;

  return (
    <section className="max-w-3xl rounded-[var(--radius-l)] border border-border bg-surface p-6">
      <h2 className="text-title-sm font-semibold text-foreground">{CONSENT_SECTION_TITLE}</h2>
      <div className="mt-3 space-y-2">
        {CONSENT_SECTION_BODY.map((line) => (
          <p key={line} className="text-body-sm leading-relaxed text-muted-foreground">
            {line}
          </p>
        ))}
      </div>

      {isLoading ? (
        <div className="mt-4">
          <LoadingBlock />
        </div>
      ) : isError || !data ? (
        <p className="mt-4 rounded-[var(--radius-m)] bg-surface-muted p-3 text-xs text-muted-foreground">
          تعذّر تحميل حالة الظهور العام حالياً.
        </p>
      ) : (
        <>
          <div className="mt-5 rounded-[var(--radius-m)] border border-border p-4">
            <span
              className={`inline-flex min-h-7 items-center rounded-full px-3 py-1 text-xs font-medium ${STATUS_TONE[data.status]}`}
            >
              {CONSENT_STATUS_LABELS[data.status]}
            </span>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {CONSENT_STATUS_HINTS[data.status]}
            </p>
          </div>

          <div className="mt-4 flex flex-col gap-3 rounded-[var(--radius-m)] bg-surface-muted p-4 sm:flex-row sm:items-center sm:justify-between">
            <label
              htmlFor="public-ranking-consent"
              className="text-body-sm font-medium text-foreground"
            >
              {CONSENT_TOGGLE_LABEL}
            </label>
            <button
              id="public-ranking-consent"
              type="button"
              role="switch"
              aria-checked={checked}
              aria-describedby="public-ranking-consent-hint"
              disabled={!canToggle}
              onClick={() => mutation.mutate(!checked)}
              className={`relative inline-flex h-7 w-14 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 ${checked ? "bg-primary" : "bg-border"}`}
            >
              <span
                className={`absolute h-5 w-5 rounded-full bg-surface transition-[inset-inline-start] duration-200 ${checked ? "start-8" : "start-1"}`}
              />
            </button>
          </div>
          <p id="public-ranking-consent-hint" className="mt-2 text-xs text-muted-foreground">
            {!data.isManager
              ? CONSENT_MANAGER_ONLY_NOTE
              : checked
                ? "إيقاف الظهور العام يخرج مكتبك من القائمة العامة بلا أي أثر على بيانات مكتبك أو مؤشره الخاص."
                : data.canEnable
                  ? "التفعيل اختياري ويمكن إيقافه في أي وقت."
                  : CONSENT_STATUS_HINTS[data.status]}
          </p>

          <div className="mt-5 border-t border-border pt-4">
            <p className="text-xs font-medium text-foreground">
              البيانات التي قد تظهر للعامة عند التفعيل:
            </p>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {CONSENT_PUBLIC_FIELDS.map((field) => (
                <li key={field} className="flex items-start gap-2">
                  <span aria-hidden="true" className="mt-1.5 size-1.5 rounded-full bg-primary" />
                  <span>{field}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="mt-4 text-caption leading-relaxed">{CONSENT_DISCLAIMER}</p>
        </>
      )}
    </section>
  );
}
