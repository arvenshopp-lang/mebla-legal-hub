import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  buildQuotaMessage,
  hasFeature,
  isLive,
  translateSubscriptionError,
  type QuotaMetric,
  type PlanFeatureKey,
  type SubscriptionOverview,
} from "./subscription.shared";

type Client = SupabaseClient<Database>;

/** Reads the authoritative snapshot for one office as the calling user. */
export async function loadOverview(
  supabase: Client,
  organizationId: string,
): Promise<SubscriptionOverview> {
  const { data, error } = await supabase.rpc("my_subscription_overview", {
    _organization_id: organizationId,
  });
  if (error) {
    throw new Error(
      translateSubscriptionError(error.message) ??
        "تعذّر قراءة بيانات الاشتراك أو لا تملك صلاحية الوصول.",
    );
  }
  return data as unknown as SubscriptionOverview;
}

/**
 * Server-side entitlement gate. Throws a user-safe Arabic error when the
 * office is not allowed to perform the action. Never trust the UI for this.
 */
export async function assertEntitlement(
  supabase: Client,
  organizationId: string,
  options: { feature?: PlanFeatureKey; requireLive?: boolean } = {},
): Promise<SubscriptionOverview> {
  const overview = await loadOverview(supabase, organizationId);

  if (overview.state === "suspended") {
    throw new Error("الاشتراك موقوف حالياً، لذلك لا يمكن تنفيذ هذه العملية.");
  }
  if (options.requireLive && !isLive(overview.state)) {
    throw new Error("هذه العملية تتطلب اشتراكاً نشطاً. جدّد باقتك للمتابعة.");
  }
  if (options.feature && !hasFeature(overview, options.feature)) {
    throw new Error("هذه الميزة غير متوفرة ضمن باقتك الحالية. ارفع الباقة للمتابعة.");
  }
  return overview;
}

/**
 * بوابة الحصص الخادمية الموحدة (Pre-flight). مشغّلات قاعدة البيانات تبقى خط
 * الدفاع النهائي؛ هذه الطبقة ترفض العملية مبكراً برسالة عربية تحمل أرقام الباقة
 * الحقيقية قبل أي رفع أو إنشاء أو إرسال دعوة.
 */
export async function assertQuota(
  supabase: Client,
  organizationId: string,
  metric: QuotaMetric,
  options: { amount?: number; overview?: SubscriptionOverview } = {},
): Promise<SubscriptionOverview> {
  const overview = options.overview ?? (await loadOverview(supabase, organizationId));

  if (overview.state === "suspended") {
    throw new Error("الاشتراك موقوف حالياً، لذلك لا يمكن إضافة بيانات جديدة.");
  }

  const amount = options.amount ?? 1;
  const message = buildQuotaMessage(overview, metric, amount);
  if (message) throw new Error(message);
  return overview;
}
