import { queryOptions } from "@tanstack/react-query";
import { getPublicPlans } from "@/lib/pricing.functions";
import type { PublicPlan } from "@/lib/pricing.shared";

export function publicPlansQueryOptions() {
  return queryOptions<PublicPlan[]>({
    queryKey: ["public-plans"],
    queryFn: () => getPublicPlans(),
    staleTime: 10 * 60_000,
  });
}
