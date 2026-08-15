/**
 * بطاقة "مؤشر الإنجاز التشغيلي" — نتيجة المكتب الخاصة فقط.
 * لا مقارنة ولا ترتيب ولا أي بيانات عن مكاتب أخرى.
 */

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Info } from "lucide-react";
import { getMyOperationalScore } from "@/lib/operational-score/score.functions";
import {
  INSUFFICIENT_DATA_LABEL,
  SCORE_DIMENSION_HINTS,
  type ScoreDimension,
  type ScoreDimensionKey,
} from "@/lib/operational-score/score.shared";
import { SectionCard, SectionLoader } from "@/lib/list-utils";
import { fmtPercent } from "@/lib/format";

const ORDER: ScoreDimensionKey[] = ["deadlines", "tasks", "hearings"];

function DimensionRow({ dimension, eligible }: { dimension: ScoreDimension; eligible: boolean }) {
  const isHearings = dimension.key === "hearings";
  const showValue = eligible && dimension.applied && dimension.value !== null;
  return (
    <li className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="truncate text-[14px] font-medium">{dimension.label}</span>
        {isHearings && (
          <span
            className="text-muted-foreground/70"
            title={SCORE_DIMENSION_HINTS.hearings}
            aria-label={SCORE_DIMENSION_HINTS.hearings}
            role="note"
          >
            <Info className="h-3.5 w-3.5" aria-hidden />
          </span>
        )}
      </span>
      {showValue ? (
        <span className="shrink-0 text-[14px] font-semibold tabular-nums">
          {fmtPercent(dimension.value * 100, 0)}
        </span>
      ) : (
        <span className="shrink-0 text-[12px] text-muted-foreground">
          {INSUFFICIENT_DATA_LABEL}
        </span>
      )}
    </li>
  );
}

export function OperationalScoreCard({ organizationId }: { organizationId: string | null }) {
  const fetchScore = useServerFn(getMyOperationalScore);
  const { data, isLoading, error } = useQuery({
    queryKey: ["operational-score", organizationId],
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
    queryFn: () => fetchScore({ data: { organizationId: organizationId! } }),
  });

  return (
    <SectionCard title="مؤشر الإنجاز التشغيلي">
      {isLoading ? (
        <SectionLoader label="جاري احتساب المؤشر…" />
      ) : error || !data ? (
        <p className="text-caption">تعذّر احتساب المؤشر التشغيلي حالياً.</p>
      ) : (
        <>
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              {data.eligible && data.score !== null ? (
                <p className="text-[34px] leading-none font-bold tabular-nums">{data.score}%</p>
              ) : (
                <p className="text-[18px] leading-tight font-semibold">{INSUFFICIENT_DATA_LABEL}</p>
              )}
              <p className="text-caption mt-2">{data.eligibilityMessage}</p>
            </div>
          </div>
          <ul className="mt-4 divide-y divide-border border-t border-border pt-1">
            {ORDER.map((key) => (
              <DimensionRow key={key} dimension={data.dimensions[key]} eligible={data.eligible} />
            ))}
          </ul>
        </>
      )}
    </SectionCard>
  );
}
