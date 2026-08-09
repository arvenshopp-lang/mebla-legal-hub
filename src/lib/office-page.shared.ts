/**
 * الصفحة العامة لمكتب المحاماة — النموذج المشترك بين الواجهة والخادم.
 *
 * قاعدة اللقطة الكاملة: كل ما يظهر للزائر يقع داخل لقطة واحدة (`draft` / `published`)،
 * بما فيها SEO وإعداد نموذج العملاء المحتملين وظهور الفريق، فلا يمكن لأي تعديل
 * غير منشور أن يغيّر الصفحة المنشورة.
 */
import { z } from "zod";

export const OFFICE_PAGE_STATUSES = ["draft", "published", "unpublished"] as const;
export type OfficePageStatus = (typeof OFFICE_PAGE_STATUSES)[number];

export const OFFICE_PAGE_STATUS_LABELS: Record<OfficePageStatus, string> = {
  draft: "مسودة",
  published: "منشورة",
  unpublished: "غير منشورة",
};

/** خدمات قانونية قياسية — قائمة مغلقة حتى تبقى الصفحة العامة قابلة للفهرسة والمقارنة. */
export const OFFICE_SERVICES = [
  { key: "litigation", label: "التقاضي والمرافعات" },
  { key: "execution", label: "التنفيذ والمطالبات" },
  { key: "commercial", label: "القضايا التجارية" },
  { key: "labor", label: "القضايا العمالية" },
  { key: "family", label: "الأحوال الشخصية" },
  { key: "real_estate", label: "العقار والإيجارات" },
  { key: "criminal", label: "القضايا الجزائية" },
  { key: "corporate", label: "تأسيس الشركات والحوكمة" },
  { key: "contracts", label: "صياغة ومراجعة العقود" },
  { key: "arbitration", label: "التحكيم وحل النزاعات" },
  { key: "ip", label: "الملكية الفكرية" },
  { key: "consulting", label: "الاستشارات القانونية" },
] as const;

export type OfficeServiceKey = (typeof OFFICE_SERVICES)[number]["key"];

export function serviceLabel(key: string | null | undefined) {
  if (!key) return "";
  return OFFICE_SERVICES.find((s) => s.key === key)?.label ?? key;
}

export const WEEK_DAYS = [
  { key: "sun", label: "الأحد" },
  { key: "mon", label: "الاثنين" },
  { key: "tue", label: "الثلاثاء" },
  { key: "wed", label: "الأربعاء" },
  { key: "thu", label: "الخميس" },
  { key: "fri", label: "الجمعة" },
  { key: "sat", label: "السبت" },
] as const;

export const RESERVED_SLUGS = [
  "app",
  "api",
  "www",
  "docs",
  "admin",
  "mehla",
  "mehla-admin",
  "office",
  "offices",
  "login",
  "register",
  "auth",
  "track",
  "upload",
  "status",
  "billing",
  "mail",
  "support",
  "privacy",
  "terms",
  "security",
  "contact",
  "about",
  "faq",
  "sitemap",
  "robots",
  "assets",
  "share",
  "new",
  "settings",
];

export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "الرابط قصير جداً — 3 أحرف على الأقل.")
  .max(40, "الرابط طويل — 40 حرفاً كحد أقصى.")
  .refine((v) => SLUG_PATTERN.test(v), "استخدم أحرفاً لاتينية صغيرة وأرقاماً وشرطة فقط.")
  .refine((v) => !v.includes("--"), "لا تستخدم شرطتين متتاليتين.")
  .refine((v) => !RESERVED_SLUGS.includes(v), "هذا الرابط محجوز، اختر رابطاً آخر.");

const ARABIC_TRANSLIT: Record<string, string> = {
  ا: "a",
  أ: "a",
  إ: "a",
  آ: "a",
  ء: "a",
  ب: "b",
  ت: "t",
  ث: "th",
  ج: "j",
  ح: "h",
  خ: "kh",
  د: "d",
  ذ: "dh",
  ر: "r",
  ز: "z",
  س: "s",
  ش: "sh",
  ص: "s",
  ض: "d",
  ط: "t",
  ظ: "z",
  ع: "a",
  غ: "gh",
  ف: "f",
  ق: "q",
  ك: "k",
  ل: "l",
  م: "m",
  ن: "n",
  ه: "h",
  و: "w",
  ي: "y",
  ى: "a",
  ة: "h",
  ئ: "e",
  ؤ: "o",
};

/** اقتراح رابط لاتيني من اسم عربي — للاقتراح فقط، والتحقق النهائي على الخادم. */
export function suggestSlug(name: string): string {
  const latin = Array.from(name.trim().toLowerCase())
    .map((ch) => {
      if (/[a-z0-9]/.test(ch)) return ch;
      if (ARABIC_TRANSLIT[ch]) return ARABIC_TRANSLIT[ch];
      if (/[\s._/\\-]/.test(ch)) return "-";
      return "";
    })
    .join("");
  const cleaned = latin.replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return cleaned.length >= 3 ? cleaned.replace(/-$/, "") : `office-${cleaned}`.slice(0, 40);
}

// ————————————————— اللقطة (Snapshot) —————————————————

const text = (max: number) => z.string().trim().max(max);
const optionalPhone = text(24).refine(
  (v) => v === "" || /^\+\d{8,15}$/.test(v),
  "أدخل الرقم بالصيغة الدولية، مثال: +9665XXXXXXXX",
);
const optionalEmail = text(160).refine(
  (v) => v === "" || z.string().email().safeParse(v).success,
  "أدخل بريداً إلكترونياً صحيحاً.",
);
const optionalHttps = text(400).refine(
  (v) => v === "" || /^https:\/\/[^\s]+\.[^\s]+$/.test(v),
  "أدخل رابطاً صحيحاً يبدأ بـ https://",
);
/** مسار كائن تخزين داخلي فقط — لا نقبل روابط خارجية للوسائط. */
const mediaPath = text(300).refine(
  (v) => v === "" || /^[0-9a-f-]{36}\/(draft|v\d+)\/[A-Za-z0-9._/-]+$/.test(v),
  "مسار وسائط غير صالح.",
);

export const officeHourSchema = z.object({
  day: z.enum(["sun", "mon", "tue", "wed", "thu", "fri", "sat"]),
  closed: z.boolean().default(false),
  from: text(5),
  to: text(5),
});

export const officeServiceSchema = z.object({
  key: text(40),
  title: text(80),
  description: text(300),
});

export const officeTeamMemberSchema = z.object({
  name: text(80),
  title: text(80),
  bio: text(400),
  photo_path: mediaPath,
  specialties: z.array(text(40)).max(6).default([]),
});

export const officeLeadFormSchema = z.object({
  enabled: z.boolean().default(true),
  require_phone: z.boolean().default(true),
  require_email: z.boolean().default(false),
  require_city: z.boolean().default(false),
  service_choice: z.boolean().default(true),
  thank_you: text(300).default("تم استلام طلبك، وسنتواصل معك في أقرب وقت."),
  consent_required: z.boolean().default(true),
  consent_text: text(400).default(
    "أوافق على معالجة بياناتي للتواصل معي بشأن طلبي وفق سياسة الخصوصية.",
  ),
});

export const officeSeoSchema = z.object({
  title: text(70),
  description: text(180),
});

export const officeSnapshotSchema = z.object({
  office_name: text(120),
  headline: text(120),
  tagline: text(200),
  about: text(2000),
  city: text(60),
  address: text(200),
  map_url: optionalHttps,
  phone: optionalPhone,
  whatsapp: optionalPhone,
  email: optionalEmail,
  website: optionalHttps,
  license_number: text(60),
  logo_path: mediaPath,
  cover_path: mediaPath,
  hours: z.array(officeHourSchema).max(7).default([]),
  services: z.array(officeServiceSchema).max(12).default([]),
  team_visible: z.boolean().default(false),
  team: z.array(officeTeamMemberSchema).max(12).default([]),
  socials: z
    .object({
      instagram: optionalHttps,
      x: optionalHttps,
      linkedin: optionalHttps,
      tiktok: optionalHttps,
      youtube: optionalHttps,
      snapchat: optionalHttps,
    })
    .default({ instagram: "", x: "", linkedin: "", tiktok: "", youtube: "", snapchat: "" }),
  lead_form: officeLeadFormSchema.default(officeLeadFormSchema.parse({})),
  seo: officeSeoSchema.default({ title: "", description: "" }),
  /** نسخة سياسة الخصوصية المعتمدة داخل هذه اللقطة (إثبات الإقرار). */
  consent_policy_version: text(40).default(""),
});

export type OfficeSnapshot = z.infer<typeof officeSnapshotSchema>;

export function emptySnapshot(officeName = "", city = ""): OfficeSnapshot {
  return officeSnapshotSchema.parse({
    office_name: officeName,
    headline: "",
    tagline: "",
    about: "",
    city,
    address: "",
    map_url: "",
    phone: "",
    whatsapp: "",
    email: "",
    website: "",
    license_number: "",
    logo_path: "",
    cover_path: "",
    hours: WEEK_DAYS.map((d) => ({
      day: d.key,
      closed: d.key === "fri" || d.key === "sat",
      from: "09:00",
      to: "17:00",
    })),
    services: [],
    team_visible: false,
    team: [],
  });
}

/** الحد الأدنى للنشر — يمنع نشر صفحة فارغة تُضر بسمعة المكتب. */
export function publishBlockers(snapshot: OfficeSnapshot): string[] {
  const blockers: string[] = [];
  if (!snapshot.office_name) blockers.push("اسم المكتب مطلوب.");
  if (!snapshot.headline) blockers.push("العنوان الرئيسي مطلوب.");
  if (snapshot.about.trim().length < 40) blockers.push("نبذة المكتب قصيرة — 40 حرفاً على الأقل.");
  if (!snapshot.city) blockers.push("المدينة مطلوبة.");
  if (!snapshot.phone && !snapshot.whatsapp && !snapshot.email)
    blockers.push("أضف وسيلة تواصل واحدة على الأقل (جوال أو واتساب أو بريد).");
  if (snapshot.services.length === 0) blockers.push("أضف خدمة واحدة على الأقل.");
  if (snapshot.team_visible && snapshot.team.length === 0)
    blockers.push("ظهور الفريق مُفعّل بلا أعضاء — أضف عضواً أو أوقف الظهور.");
  return blockers;
}

// ————————————————— العرض العام (Projection) —————————————————

export type OfficeMediaRef = { url: string; alt: string };

export type OfficePageView = {
  slug: string;
  version: number;
  isPreview: boolean;
  officeName: string;
  headline: string;
  tagline: string;
  about: string;
  city: string;
  address: string;
  mapUrl: string;
  phone: string;
  whatsapp: string;
  email: string;
  website: string;
  licenseNumber: string;
  logoUrl: string;
  coverUrl: string;
  hours: Array<{ day: string; label: string; closed: boolean; from: string; to: string }>;
  services: Array<{ key: string; title: string; description: string }>;
  team: Array<{
    name: string;
    title: string;
    bio: string;
    photoUrl: string;
    specialties: string[];
  }>;
  socials: Array<{ key: string; label: string; href: string }>;
  leadForm: z.infer<typeof officeLeadFormSchema>;
  seo: { title: string; description: string; ogImageUrl: string };
  consentPolicyVersion: string;
};

export const SOCIAL_LABELS: Record<string, string> = {
  instagram: "إنستقرام",
  x: "منصة X",
  linkedin: "لينكدإن",
  tiktok: "تيك توك",
  youtube: "يوتيوب",
  snapchat: "سناب شات",
};

// ————————————————— العملاء المحتملون —————————————————

export const OFFICE_LEAD_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "unqualified",
  "converted",
  "archived",
] as const;
export type OfficeLeadStatus = (typeof OFFICE_LEAD_STATUSES)[number];

export const OFFICE_LEAD_STATUS_LABELS: Record<OfficeLeadStatus, string> = {
  new: "جديد",
  contacted: "تم التواصل",
  qualified: "مؤهل",
  unqualified: "غير مؤهل",
  converted: "تحوّل إلى عميل",
  archived: "مؤرشف",
};

export const PREFERRED_CONTACT_LABELS: Record<string, string> = {
  phone: "اتصال هاتفي",
  whatsapp: "واتساب",
  email: "بريد إلكتروني",
};

export const officeLeadInputSchema = z.object({
  slug: slugSchema,
  full_name: z.string().trim().min(3, "أدخل الاسم الكامل.").max(80),
  phone: text(24).refine(
    (v) => v === "" || /^\+?\d{9,15}$/.test(v.replace(/\s/g, "")),
    "أدخل رقم جوال صحيح.",
  ),
  email: optionalEmail,
  city: text(60),
  service_key: text(40),
  message: z.string().trim().max(1500, "الرسالة طويلة — 1500 حرف كحد أقصى."),
  preferred_contact: z.enum(["phone", "whatsapp", "email"]).optional(),
  consent: z.boolean().default(false),
  channel: text(20),
  utm: z.record(z.string().trim().max(120)).default({}),
});

export type OfficeLeadInput = z.infer<typeof officeLeadInputSchema>;

export const OFFICE_EVENT_KINDS = [
  "view",
  "whatsapp",
  "call",
  "email",
  "map",
  "lead",
  "service_click",
] as const;
export type OfficeEventKind = (typeof OFFICE_EVENT_KINDS)[number];

export const OFFICE_EVENT_LABELS: Record<OfficeEventKind, string> = {
  view: "مشاهدات الصفحة",
  whatsapp: "نقرات واتساب",
  call: "نقرات الاتصال",
  email: "نقرات البريد",
  map: "نقرات الموقع",
  lead: "طلبات مُرسلة",
  service_click: "نقرات الخدمات",
};

/** قنوات معروفة فقط — يمنع تلويث التحليلات بقيم حرة من الزائر. */
export const OFFICE_CHANNELS = [
  "direct",
  "instagram",
  "tiktok",
  "x",
  "google",
  "qr",
  "campaign",
] as const;

export function normalizeChannel(value: string | null | undefined): string {
  const v = (value ?? "").trim().toLowerCase();
  return (OFFICE_CHANNELS as readonly string[]).includes(v) ? v : "direct";
}

export const OFFICE_PAGE_BASE_URL = "https://mehlalex.com";

export function officePageUrl(slug: string) {
  return `${OFFICE_PAGE_BASE_URL}/office/${slug}`;
}
