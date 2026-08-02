import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { getSubscriptionOverview } from "@/lib/subscription.functions";
import { hasFeature, type PlanFeatureKey, type SubscriptionOverview } from "@/lib/subscription.shared";

/** Read-only view of the office subscription. Enforcement lives on the server. */
export function useSubscription() {
  const { activeOrgId } = useAuth();
  const fetchOverview = useServerFn(getSubscriptionOverview);

  const query = useQuery<SubscriptionOverview>({
    queryKey: ["subscription-overview", activeOrgId],
    enabled: !!activeOrgId,
    staleTime: 60_000,
    queryFn: () => fetchOverview({ data: { organizationId: activeOrgId! } }),
  });

  return {
    ...query,
    overview: query.data ?? null,
    can: (feature: PlanFeatureKey) => hasFeature(query.data, feature),
  };
}