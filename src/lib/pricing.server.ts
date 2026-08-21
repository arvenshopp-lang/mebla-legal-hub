/**
 * قراءة كتالوج الباقات المنشور للزوار — خادمي فقط، قراءة فقط.
 * لا يلمس أي جدول اشتراكات أو فواتير، ويعرض الباقات العامة المفعّلة فقط.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { PublicPlan } from "@/lib/pricing.shared";
import { applyApprovedPricing } from "@/config/commercial-pricing";

const COLUMNS = [
  "code",
  "name_ar",
  "description",
  "price_monthly",
  "price_yearly",
  "currency",
  "max_users",
  "max_cases",
  "max_clients",
  "max_documents",
  "storage_gb",
  "ocr_pages_monthly",
  "support_level",
  "sla_hours",
  "sort_order",
  "ai_enabled",
  "esignature_enabled",
  "voice_enabled",
  "api_enabled",
  "pdf_search_enabled",
  "client_upload_enabled",
  "public_office_page",
].join(", ");

export async function listPublicPlans(): Promise<PublicPlan[]> {
  const { data, error } = await supabaseAdmin
    .from("platform_plans")
    .select(COLUMNS)
    .eq("is_active", true)
    .eq("is_public", true)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("[pricing] failed to load public plans", error.message);
    throw new Error("PLANS_UNAVAILABLE");
  }

  return (data ?? []).map((row) => {
    const plan = row as unknown as Record<string, unknown>;
    const num = (key: string): number => Number(plan[key] ?? 0);
    const nullableNum = (key: string): number | null =>
      plan[key] === null || plan[key] === undefined ? null : Number(plan[key]);
    const flag = (key: string): boolean => Boolean(plan[key]);

    const publicPlan = {
      code: String(plan.code),
      name_ar: String(plan.name_ar),
      description: (plan.description as string | null) ?? null,
      price_monthly: num("price_monthly"),
      price_yearly: num("price_yearly"),
      currency: String(plan.currency ?? "SAR"),
      max_users: nullableNum("max_users"),
      max_cases: nullableNum("max_cases"),
      max_clients: nullableNum("max_clients"),
      max_documents: nullableNum("max_documents"),
      storage_gb: nullableNum("storage_gb"),
      ocr_pages_monthly: nullableNum("ocr_pages_monthly"),
      support_level: (plan.support_level as string | null) ?? null,
      sla_hours: nullableNum("sla_hours"),
      sort_order: num("sort_order"),
      ai_enabled: flag("ai_enabled"),
      esignature_enabled: flag("esignature_enabled"),
      voice_enabled: flag("voice_enabled"),
      api_enabled: flag("api_enabled"),
      pdf_search_enabled: flag("pdf_search_enabled"),
      client_upload_enabled: flag("client_upload_enabled"),
      public_office_page: flag("public_office_page"),
    } satisfies PublicPlan;

    // العرض العام يعتمد السعر التجاري المعتمد؛ الفوترة تبقى على قيم الكتالوج.
    return applyApprovedPricing(publicPlan);
  });
}
