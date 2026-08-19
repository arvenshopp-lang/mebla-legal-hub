/**
 * العملاء المحتملون من الموقع التسويقي العام (المحامية بيان) — خادمي فقط.
 *
 * يُخزّن الطلب في CRM المنصة (`crm_leads`) بدور الخدمة بعد تحقق كامل من المدخلات،
 * مع منع التكرار خلال نافذة قصيرة وحد لعدد المحاولات لكل رقم.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

export class MarketingLeadError extends Error {}

const HTML_PATTERN = /<[^>]*>|javascript:|data:text\/html|on\w+\s*=/i;

const safeText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((value) => !HTML_PATTERN.test(value), "النص يحتوي رموزاً غير مسموحة.");

export const marketingLeadSchema = z.object({
  fullName: safeText(120).min(2, "أدخل الاسم الكريم."),
  phone: safeText(20).min(9, "أدخل رقم جوال صحيح."),
  firmName: safeText(160).optional().default(""),
  message: safeText(1000).optional().default(""),
  source: safeText(60).optional().default("public_site"),
});

function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "");
  if (!digits) return "";
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  if (digits.startsWith("05") && digits.length === 10) return `+966${digits.slice(1)}`;
  if (digits.startsWith("966")) return `+${digits}`;
  return `+${digits}`;
}

const ALLOWED_SOURCES = new Set(["bayan_public_copilot", "public_site", "pricing_page"]);

export type MarketingLeadOutcome = { ok: true; duplicate: boolean; message: string };

/** إدراج عميل محتمل من الموقع العام — لا يقبل أي معرّف أو حالة من الزائر. */
export async function submitMarketingLead(raw: unknown): Promise<MarketingLeadOutcome> {
  const parsed = marketingLeadSchema.safeParse(raw);
  if (!parsed.success)
    throw new MarketingLeadError(parsed.error.issues[0]?.message ?? "تحقق من الحقول المدخلة.");
  const input = parsed.data;

  const phone = normalizePhone(input.phone);
  if (!/^\+\d{9,15}$/.test(phone)) throw new MarketingLeadError("أدخل رقم جوال صحيح.");

  const source = ALLOWED_SOURCES.has(input.source) ? input.source : "public_site";
  const since = new Date(Date.now() - 30 * 60_000).toISOString();

  const { data: recent, error: recentError } = await supabaseAdmin
    .from("crm_leads")
    .select("id")
    .eq("phone", phone)
    .gte("created_at", since)
    .limit(1);

  if (!recentError && recent && recent.length > 0) {
    return {
      ok: true,
      duplicate: true,
      message: "طلبك مسجّل مسبقاً، وسيتواصل معك فريق المبيعات قريباً.",
    };
  }

  const { error } = await supabaseAdmin.from("crm_leads").insert({
    full_name: input.fullName,
    phone,
    company_name: input.firmName || null,
    notes: input.message || null,
    source,
    status: "new",
  });

  if (error) {
    const { logFailure } = await import("@/lib/observability/failure-log.server");
    const ref = await logFailure({
      surface: "public_site",
      action: "marketing_lead_insert",
      error,
      metadata: { source },
    });
    throw new MarketingLeadError(`تعذّر إرسال بياناتك حالياً. المرجع: ${ref}`);
  }

  return {
    ok: true,
    duplicate: false,
    message: "تم إرسال بياناتك لفريق المبيعات، وسنتواصل معك قريباً.",
  };
}
