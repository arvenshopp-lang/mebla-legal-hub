import { queryOptions } from "@tanstack/react-query";
import { getPublicOperationalRanking } from "@/lib/operational-score/ranking.functions";
import type { PublicOperationalRanking } from "@/lib/operational-score/score.shared";

const DISABLED_RANKING: PublicOperationalRanking = { enabled: false, computedAt: null, items: [] };

/**
 * الترتيب العام (Top 5) للصفحة التسويقية — العقد الخادمي هو المصدر الوحيد.
 * أي فشل في الطلب يعيد حالة معطّلة (Fail closed) فلا يظهر القسم للعامة.
 */
export function publicRankingQueryOptions() {
  return queryOptions<PublicOperationalRanking>({
    queryKey: ["public-operational-ranking"],
    queryFn: async () => {
      try {
        return await getPublicOperationalRanking();
      } catch {
        return DISABLED_RANKING;
      }
    },
    staleTime: 10 * 60_000,
    retry: false,
  });
}
