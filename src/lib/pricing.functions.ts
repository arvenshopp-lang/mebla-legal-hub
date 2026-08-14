import { createServerFn } from "@tanstack/react-start";
import type { PublicPlan } from "@/lib/pricing.shared";

/** كتالوج الباقات العام — متاح للزوار قبل إنشاء الحساب (قراءة فقط). */
export const getPublicPlans = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicPlan[]> => {
    const { listPublicPlans } = await import("@/lib/pricing.server");
    return await listPublicPlans();
  },
);
