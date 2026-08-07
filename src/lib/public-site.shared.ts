/**
 * بيانات التواصل والظهور العام — مصدر الحقيقة الوحيد للصفحات العامة (مركز الثقة).
 * تُدار من لوحة إدارة المنصة فقط، وتُقرأ في الموقع العام عبر مفتاح إعدادات عام واحد.
 * قاعدة صارمة: لا تُعرض أي قيمة اختيارية في الواجهة إلا إذا أدخلها مدير المنصة فعلياً.
 */
import { z } from "zod";

export const PUBLIC_SITE_SETTINGS_KEY = "public_site";

/** حالة نشر السياسات النظامية. */
export const POLICY_STATUSES = ["draft", "review", "published"] as const;
export type PolicyStatus = (typeof POLICY_STATUSES)[number];

export const POLICY_STATUS_LABELS: Record<PolicyStatus, string> = {
  draft: "مسودة",
  review: "جاهزة للمراجعة",
  published: "منشورة",
};

const optionalEmail = z
  .string()
  .trim()
  .max(160)
  .refine((v) => v === "" || z.string().email().safeParse(v).success, {
    message: "أدخل بريداً إلكترونياً صحيحاً.",
  });

const optionalUrl = z
  .string()
  .trim()
  .max(400)
  .refine((v) => v === "" || /^https:\/\/[^\s]+\.[^\s]+$/.test(v), {
    message: "أدخل رابطاً صحيحاً يبدأ بـ https://",
  });

/** أرقام دولية: + ثم 8 إلى 15 رقماً، بدون فواصل أو حروف. */
const optionalPhone = z
  .string()
  .trim()
  .max(24)
  .refine((v) => v === "" || /^\+\d{8,15}$/.test(v), {
    message: "أدخل الرقم بالصيغة الدولية، مثال: +9665XXXXXXXX",
  });

const optionalText = (max: number) => z.string().trim().max(max);

/** تاريخ ميلادي ISO — لا نقبل نصاً حراً حتى لا يظهر تاريخ غير صحيح للزائر. */
const isoDate = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), {
    message: "أدخل التاريخ بالصيغة YYYY-MM-DD",
  });

export const publicSiteSchema = z.object({
  public_email: optionalEmail,
  support_email: optionalEmail,
  privacy_email: optionalEmail,
  phone: optionalPhone,
  whatsapp: optionalPhone,
  address: optionalText(200),
  maps_url: optionalUrl,
  instagram_url: optionalUrl,
  x_url: optionalUrl,
  linkedin_url: optionalUrl,
  tiktok_url: optionalUrl,
  youtube_url: optionalUrl,
  support_center_url: optionalUrl,
  legal_name: optionalText(160),
  commercial_registration: optionalText(40),
  tax_number: optionalText(40),
  legal_address: optionalText(200),
  policies_effective_date: isoDate,
  policies_status: z.enum(POLICY_STATUSES),
});

export type PublicSiteInfo = z.infer<typeof publicSiteSchema>;

/** القيم المعتمدة حالياً للظهور العام. البريدان أدناه مفعّلان فعلياً. */
export const DEFAULT_PUBLIC_SITE: PublicSiteInfo = {
  public_email: "info@mehlalex.com",
  support_email: "support@mehlalex.com",
  privacy_email: "",
  phone: "",
  whatsapp: "",
  address: "",
  maps_url: "",
  instagram_url: "",
  x_url: "",
  linkedin_url: "",
  tiktok_url: "",
  youtube_url: "",
  support_center_url: "",
  legal_name: "",
  commercial_registration: "",
  tax_number: "",
  legal_address: "",
  policies_effective_date: "2026-08-06",
  policies_status: "review",
};

/** يدمج المحفوظ مع القيم المعتمدة، ويتجاهل أي مفتاح غير معروف. */
export function normalizePublicSite(raw: unknown): PublicSiteInfo {
  if (!raw || typeof raw !== "object") return DEFAULT_PUBLIC_SITE;
  const merged = { ...DEFAULT_PUBLIC_SITE, ...(raw as Record<string, unknown>) };
  const parsed = publicSiteSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_PUBLIC_SITE;
}

/** البريد المستخدم لطلبات الخصوصية: البريد المخصص إن وُجد، وإلا البريد العام. */
export function privacyContactEmail(info: PublicSiteInfo): string {
  return info.privacy_email || info.public_email || DEFAULT_PUBLIC_SITE.public_email;
}

export function supportContactEmail(info: PublicSiteInfo): string {
  return info.support_email || DEFAULT_PUBLIC_SITE.support_email;
}

export function publicContactEmail(info: PublicSiteInfo): string {
  return info.public_email || DEFAULT_PUBLIC_SITE.public_email;
}

/** روابط التواصل الاجتماعي المفعّلة فقط — لا Placeholder ولا روابط فارغة. */
export function activeSocialLinks(info: PublicSiteInfo): Array<{ label: string; href: string }> {
  return (
    [
      { label: "Instagram", href: info.instagram_url },
      { label: "X", href: info.x_url },
      { label: "LinkedIn", href: info.linkedin_url },
      { label: "TikTok", href: info.tiktok_url },
      { label: "YouTube", href: info.youtube_url },
    ] as const
  )
    .filter((item) => Boolean(item.href))
    .map((item) => ({ label: item.label, href: item.href }));
}

const AR_DATE = new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** تاريخ آخر تحديث للسياسات بصيغة عربية واضحة، أو null إذا لم يُعتمد تاريخ. */
export function formatPolicyDate(info: PublicSiteInfo): string | null {
  if (!info.policies_effective_date) return null;
  const date = new Date(`${info.policies_effective_date}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return AR_DATE.format(date);
}
