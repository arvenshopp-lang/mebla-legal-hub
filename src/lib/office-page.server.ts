/**
 * الصفحة العامة للمكتب — المنطق الخادمي فقط (لا يُستورد من الواجهة إطلاقاً).
 *
 * يضم: بوابة الحالة والاستحقاق، بناء العرض العام، دورة حياة الوسائط (مسودة خاصة →
 * منشور بعد التحقق)، النشر بلقطة كاملة، وإدراج العملاء المحتملين بمنع تكرار ذرّي.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  OFFICE_SERVICES,
  SOCIAL_LABELS,
  WEEK_DAYS,
  emptySnapshot,
  officeSnapshotSchema,
  serviceLabel,
  type OfficePageView,
  type OfficeSnapshot,
} from "@/lib/office-page.shared";

export const DRAFT_BUCKET = "office-media-draft";
export const PUBLIC_BUCKET = "office-public-media";

/** أسباب عدم توفر الصفحة — تُترجم لرسالة عربية واحدة للزائر بلا كشف تفاصيل. */
export type UnavailableReason =
  | "not_found"
  | "not_published"
  | "suspended"
  | "org_inactive"
  | "entitlement";

export type LoadedOfficePage = {
  organizationId: string;
  slug: string;
  version: number;
  snapshot: OfficeSnapshot;
};

type PageRow = {
  organization_id: string;
  slug: string;
  status: string;
  suspended_by_platform: boolean;
  version: number;
  published: unknown;
};

/**
 * بوابة واحدة: منشورة + غير موقوفة + مكتب نشط غير موقوف + استحقاق خطة سارٍ.
 * كل قراءة عامة وكل إرسال نموذج يمر من هنا، فلا يوجد مسار جانبي.
 */
export async function loadPublishedOfficePage(
  slug: string,
): Promise<{ page: LoadedOfficePage } | { reason: UnavailableReason }> {
  const { data } = await supabaseAdmin
    .from("office_public_pages")
    .select("organization_id, slug, status, suspended_by_platform, version, published")
    .eq("slug", slug.toLowerCase())
    .maybeSingle();
  const row = data as PageRow | null;
  if (!row) return { reason: "not_found" };
  if (row.status !== "published" || !row.published) return { reason: "not_published" };
  if (row.suspended_by_platform) return { reason: "suspended" };

  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select("id, is_active, suspended_at")
    .eq("id", row.organization_id)
    .maybeSingle();
  if (!org || !org.is_active || org.suspended_at) return { reason: "org_inactive" };

  if (!(await hasOfficePageEntitlement(row.organization_id))) return { reason: "entitlement" };

  const parsed = officeSnapshotSchema.safeParse(row.published);
  if (!parsed.success) return { reason: "not_published" };

  return {
    page: {
      organizationId: row.organization_id,
      slug: row.slug,
      version: row.version,
      snapshot: parsed.data,
    },
  };
}

/** استحقاق الميزة من الاشتراك النشط للمكتب. */
export async function hasOfficePageEntitlement(organizationId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("subscriptions")
    .select("status, ends_at, plan:platform_plans(public_office_page)")
    .eq("organization_id", organizationId)
    .in("status", ["active", "trial"])
    .order("ends_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return false;
  if (data.ends_at && new Date(data.ends_at) < new Date()) return false;
  const plan = data.plan as { public_office_page?: boolean } | null;
  return plan?.public_office_page !== false;
}

export function unavailableMessage(): string {
  return "هذه الصفحة غير متاحة حالياً.";
}

// ————————————————— الوسائط —————————————————

/** رابط وسائط منشورة يمر عبر مسار خادمي يتحقق من حالة الصفحة أولاً. */
export function publishedMediaUrl(slug: string, path: string): string {
  if (!path) return "";
  const rest = path.split("/").slice(1).join("/"); // بعد معرّف المكتب
  if (!rest) return "";
  return `/api/public/office/media/${slug}/${rest}`;
}

/** رابط موقّع قصير لوسائط المسودة — للمعاينة والإدارة فقط. */
export async function draftMediaUrl(path: string): Promise<string> {
  if (!path) return "";
  const { data } = await supabaseAdmin.storage.from(DRAFT_BUCKET).createSignedUrl(path, 300);
  return data?.signedUrl ?? "";
}

const MAX_MEDIA_BYTES = 2 * 1024 * 1024;

type SanitizedImage = { bytes: Uint8Array; contentType: string; extension: string };

function bytesStartWith(bytes: Uint8Array, signature: number[], offset = 0) {
  return signature.every((b, i) => bytes[offset + i] === b);
}

/** إزالة مقاطع APPn (تشمل EXIF/GPS و XMP) من صور JPEG. */
function stripJpegMetadata(bytes: Uint8Array): Uint8Array {
  const out: number[] = [0xff, 0xd8];
  let i = 2;
  while (i + 3 < bytes.length) {
    if (bytes[i] !== 0xff) break;
    const marker = bytes[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    if (marker === 0xda) {
      for (let k = i; k < bytes.length; k++) out.push(bytes[k]);
      return new Uint8Array(out);
    }
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    const isMetadata = (marker >= 0xe0 && marker <= 0xef) || marker === 0xfe;
    if (!isMetadata) {
      for (let k = i; k < i + 2 + length && k < bytes.length; k++) out.push(bytes[k]);
    }
    i += 2 + length;
  }
  return new Uint8Array(out);
}

/** إبقاء المقاطع الحرجة فقط في PNG وإسقاط النصية و eXIf. */
function stripPngMetadata(bytes: Uint8Array): Uint8Array {
  const keep = new Set([
    "IHDR",
    "PLTE",
    "IDAT",
    "IEND",
    "tRNS",
    "gAMA",
    "sRGB",
    "acTL",
    "fcTL",
    "fdAT",
  ]);
  const out: number[] = [];
  for (let k = 0; k < 8; k++) out.push(bytes[k]);
  let i = 8;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  while (i + 8 <= bytes.length) {
    const length = view.getUint32(i);
    const type = String.fromCharCode(bytes[i + 4], bytes[i + 5], bytes[i + 6], bytes[i + 7]);
    const end = i + 12 + length;
    if (end > bytes.length) break;
    if (keep.has(type)) {
      for (let k = i; k < end; k++) out.push(bytes[k]);
    }
    i = end;
    if (type === "IEND") break;
  }
  return new Uint8Array(out);
}

/** إسقاط مقاطع EXIF/XMP من WebP بصيغة RIFF مع إعادة حساب الطول. */
function stripWebpMetadata(bytes: Uint8Array): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: number[] = [];
  let i = 12;
  while (i + 8 <= bytes.length) {
    const type = String.fromCharCode(bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3]);
    const size = view.getUint32(i + 4, true);
    const padded = size + (size % 2);
    const end = i + 8 + padded;
    if (end > bytes.length) break;
    if (type !== "EXIF" && type !== "XMP ") {
      for (let k = i; k < end; k++) chunks.push(bytes[k]);
    }
    i = end;
  }
  const out = new Uint8Array(12 + chunks.length);
  out.set(bytes.slice(0, 12));
  out.set(chunks, 12);
  new DataView(out.buffer).setUint32(4, out.length - 8, true);
  return out;
}

/**
 * تحقق خادمي إلزامي قبل التخزين: الحجم، الامتداد، البايتات الفعلية (Magic bytes)،
 * ثم تجريد البيانات الوصفية. لا يصبح أي ملف قابلاً للنشر قبل اجتياز هذا التحقق.
 */
export function validateAndSanitizeImage(bytes: Uint8Array, declaredType: string): SanitizedImage {
  if (bytes.byteLength === 0) throw new Error("الملف فارغ.");
  if (bytes.byteLength > MAX_MEDIA_BYTES) throw new Error("حجم الصورة يتجاوز 2 ميجابايت.");

  const isJpeg = bytesStartWith(bytes, [0xff, 0xd8, 0xff]);
  const isPng = bytesStartWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const isWebp =
    bytesStartWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytesStartWith(bytes, [0x57, 0x45, 0x42, 0x50], 8);

  if (isJpeg) {
    if (declaredType && !/^image\/jpe?g$/.test(declaredType))
      throw new Error("نوع الملف لا يطابق محتواه.");
    return { bytes: stripJpegMetadata(bytes), contentType: "image/jpeg", extension: "jpg" };
  }
  if (isPng) {
    if (declaredType && declaredType !== "image/png") throw new Error("نوع الملف لا يطابق محتواه.");
    return { bytes: stripPngMetadata(bytes), contentType: "image/png", extension: "png" };
  }
  if (isWebp) {
    if (declaredType && declaredType !== "image/webp")
      throw new Error("نوع الملف لا يطابق محتواه.");
    return { bytes: stripWebpMetadata(bytes), contentType: "image/webp", extension: "webp" };
  }
  throw new Error("الصيغة غير مدعومة — استخدم JPG أو PNG أو WebP.");
}

/** رفع صورة مسودة إلى المستودع الخاص بعد التحقق والتجريد. */
export async function storeDraftMedia(
  organizationId: string,
  kind: "logo" | "cover" | "team",
  bytes: Uint8Array,
  declaredType: string,
): Promise<string> {
  const safe = validateAndSanitizeImage(bytes, declaredType);
  const name = `${kind}-${crypto.randomUUID()}.${safe.extension}`;
  const path = `${organizationId}/draft/${name}`;
  const { error } = await supabaseAdmin.storage
    .from(DRAFT_BUCKET)
    .upload(path, safe.bytes as unknown as ArrayBufferLike as BlobPart, {
      contentType: safe.contentType,
      upsert: false,
    });
  if (error) throw new Error("تعذّر رفع الصورة، حاول مرة أخرى.");
  return path;
}

function snapshotMediaPaths(snapshot: OfficeSnapshot): string[] {
  return [
    snapshot.logo_path,
    snapshot.cover_path,
    ...snapshot.team.map((m) => m.photo_path),
  ].filter(Boolean);
}

/**
 * النشر: نسخ الوسائط المرجعية من المسودة الخاصة إلى مسار النسخة المنشورة،
 * ثم كتابة لقطة `published` كاملة بالمسارات النهائية.
 */
export async function buildPublishedSnapshot(
  organizationId: string,
  draft: OfficeSnapshot,
  version: number,
): Promise<OfficeSnapshot> {
  const mapping = new Map<string, string>();
  for (const path of snapshotMediaPaths(draft)) {
    if (mapping.has(path)) continue;
    const fileName = path.split("/").pop()!;
    const target = `${organizationId}/v${version}/${fileName}`;
    // المصدر يُحدَّد من شكل المسار: مسودة خاصة، أو نسخة منشورة سابقة (إعادة نشر/استعادة).
    const sourceBucket = /\/v\d+\//.test(path) ? PUBLIC_BUCKET : DRAFT_BUCKET;
    if (sourceBucket === PUBLIC_BUCKET && path === target) {
      mapping.set(path, target);
      continue;
    }
    const { data: file, error } = await supabaseAdmin.storage.from(sourceBucket).download(path);
    if (error || !file) {
      console.error("[office-media] download failed", sourceBucket, path, error);
      throw new Error("تعذّر نشر إحدى الصور، أعد رفعها ثم انشر.");
    }
    const buffer = new Uint8Array(await file.arrayBuffer());
    const safe = validateAndSanitizeImage(buffer, file.type ?? "");
    const { error: upErr } = await supabaseAdmin.storage
      .from(PUBLIC_BUCKET)
      .upload(target, safe.bytes as unknown as BlobPart, {
        contentType: safe.contentType,
        upsert: true,
      });
    if (upErr) throw new Error("تعذّر نشر إحدى الصور، حاول مرة أخرى.");
    mapping.set(path, target);
  }

  return officeSnapshotSchema.parse({
    ...draft,
    logo_path: mapping.get(draft.logo_path) ?? "",
    cover_path: mapping.get(draft.cover_path) ?? "",
    team: draft.team.map((m) => ({ ...m, photo_path: mapping.get(m.photo_path) ?? "" })),
  });
}

/** حذف نسخ الوسائط المنشورة التي لم تعد مرجعية (بعد إعادة النشر أو الإلغاء). */
export async function pruneUnreferencedPublishedMedia(
  organizationId: string,
  keep: string[],
): Promise<void> {
  const keepSet = new Set(keep);
  const { data: folders } = await supabaseAdmin.storage.from(PUBLIC_BUCKET).list(organizationId);
  for (const folder of folders ?? []) {
    const prefix = `${organizationId}/${folder.name}`;
    const { data: files } = await supabaseAdmin.storage.from(PUBLIC_BUCKET).list(prefix);
    const stale = (files ?? []).map((f) => `${prefix}/${f.name}`).filter((p) => !keepSet.has(p));
    if (stale.length) await supabaseAdmin.storage.from(PUBLIC_BUCKET).remove(stale);
  }
}

export function publishedMediaKeep(snapshot: OfficeSnapshot | null): string[] {
  return snapshot ? snapshotMediaPaths(snapshot) : [];
}

// ————————————————— العرض —————————————————

/** بناء العرض العام: حقول صريحة فقط، ولا يمر أي حقل غير منشور. */
export async function toOfficePageView(
  page: LoadedOfficePage,
  options: { isPreview: boolean },
): Promise<OfficePageView> {
  const s = page.snapshot;
  const resolve = async (path: string) =>
    options.isPreview ? await draftMediaUrl(path) : publishedMediaUrl(page.slug, path);

  const [logoUrl, coverUrl] = await Promise.all([resolve(s.logo_path), resolve(s.cover_path)]);
  const team = s.team_visible
    ? await Promise.all(
        s.team.map(async (m) => ({
          name: m.name,
          title: m.title,
          bio: m.bio,
          photoUrl: await resolve(m.photo_path),
          specialties: m.specialties.map((k) => serviceLabel(k) || k),
        })),
      )
    : [];

  return {
    slug: page.slug,
    version: page.version,
    isPreview: options.isPreview,
    officeName: s.office_name,
    headline: s.headline,
    tagline: s.tagline,
    about: s.about,
    city: s.city,
    address: s.address,
    mapUrl: s.map_url,
    phone: s.phone,
    whatsapp: s.whatsapp,
    email: s.email,
    website: s.website,
    licenseNumber: s.license_number,
    logoUrl,
    coverUrl,
    hours: s.hours.map((h) => ({
      day: h.day,
      label: WEEK_DAYS.find((d) => d.key === h.day)?.label ?? h.day,
      closed: h.closed,
      from: h.from,
      to: h.to,
    })),
    services: s.services.map((svc) => ({
      key: svc.key,
      title: svc.title || (OFFICE_SERVICES.find((o) => o.key === svc.key)?.label ?? svc.key),
      description: svc.description,
    })),
    team,
    socials: Object.entries(s.socials)
      .filter(([, href]) => !!href)
      .map(([key, href]) => ({ key, label: SOCIAL_LABELS[key] ?? key, href })),
    leadForm: s.lead_form,
    seo: {
      title: s.seo.title || `${s.office_name} | مِهلة`,
      description: s.seo.description || s.tagline || s.about.slice(0, 160),
      ogImageUrl: options.isPreview
        ? ""
        : s.cover_path
          ? `https://mehlalex.com${publishedMediaUrl(page.slug, s.cover_path)}`
          : "",
    },
    consentPolicyVersion: s.consent_policy_version,
  };
}

/** صف الصفحة كما يراه مالك المكتب (بإنشاء صف مسودة عند أول فتح). */
export async function ensureOfficePageRow(organizationId: string) {
  const { data: existing } = await supabaseAdmin
    .from("office_public_pages")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (existing) return existing;

  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select("name, city")
    .eq("id", organizationId)
    .maybeSingle();
  const base = emptySnapshot(org?.name ?? "", org?.city ?? "");
  const { data: created, error } = await supabaseAdmin
    .from("office_public_pages")
    .insert({
      organization_id: organizationId,
      slug: await allocateSlug(org?.name ?? "office"),
      status: "draft",
      draft: base as never,
    })
    .select("*")
    .single();
  if (error) throw new Error("تعذّر تهيئة الصفحة العامة، حاول مرة أخرى.");
  return created;
}

async function allocateSlug(name: string): Promise<string> {
  const { suggestSlug } = await import("@/lib/office-page.shared");
  const base = suggestSlug(name) || "office";
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`.slice(0, 40);
    const { data } = await supabaseAdmin
      .from("office_public_pages")
      .select("organization_id")
      .eq("slug", candidate)
      .maybeSingle();
    if (!data) return candidate;
  }
  return `office-${crypto.randomUUID().slice(0, 8)}`;
}

/** زيادة عدّاد التحليلات ذرّياً في القاعدة (بلا قراءة-ثم-كتابة). */
export async function bumpOfficeEvent(organizationId: string, kind: string, channel: string) {
  await supabaseAdmin.rpc("bump_office_page_event", {
    _organization_id: organizationId,
    _kind: kind,
    _channel: channel,
    _amount: 1,
  });
}
