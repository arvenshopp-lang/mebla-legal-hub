import { queryOptions } from "@tanstack/react-query";
import { getPublicSiteInfo } from "@/lib/public-site.functions";
import { DEFAULT_PUBLIC_SITE, type PublicSiteInfo } from "@/lib/public-site.shared";

/** بيانات الظهور العام: مصدر واحد لكل الصفحات العامة، بكاش طويل لأنها نادرة التغيير. */
export function publicSiteQueryOptions() {
  return queryOptions<PublicSiteInfo>({
    queryKey: ["public-site-info"],
    queryFn: async () => {
      try {
        return await getPublicSiteInfo();
      } catch {
        return DEFAULT_PUBLIC_SITE;
      }
    },
    staleTime: 5 * 60 * 1000,
  });
}
