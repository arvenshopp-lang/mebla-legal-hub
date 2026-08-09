/**
 * الصفحة العامة للمكتب — المسار العام (زائر غير مسجّل). خادمي فقط.
 *
 * كل قراءة عامة تمر من بوابة واحدة (`loadPublishedOfficePage`)، ولا يلمس الزائر
 * أي جدول تشغيلي. الطلبات تُدرج بدور الخدمة بعد تحقق كامل ومنع تكرار ذرّي،
 * والأحداث تُجمّع بعدّادات ذرّية بلا أي بيانات تعريف للزائر.
 */
import { createHash } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  OFFICE_EVENT_KINDS,
  OFFICE_SERVICES,
  normalizeChannel,
  officeLeadInputSchema,
  type OfficeEventKind,
  type OfficePageView,
} from "@/lib/office-page.shared";
import {
  PUBLIC_BUCKET,
  bumpOfficeEvent,
  loadPublishedOfficePage,
  toOfficePageView,
} from "@/lib/office-page.server";

export const UNAVAILABLE = "هذه الصفحة غير متاحة حالياً.";

/**
 * روابط الصفحات القابلة للعرض العام فقط — لخريطة الموقع. لا يُرجع أي بيانات مكتب.
 * كل رابط يمر ببوابة العرض العام نفسها، فلا تُنشر صفحة مكتب موقوف أو منتهي الاستحقاق.
 */
export async function listPublishedOfficeSlugs(): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("office_public_pages")
    .select("slug")
    .eq("status", "published")
    .eq("suspended_by_platform", false)
    .order("published_at", { ascending: false })
    .limit(1000);
  if (error || !data) return [];
  const candidates = data
    .map((row) => row.slug)
    .filter((slug): slug is string => Boolean(slug));

  const allowed: string[] = [];
  for (let i = 0; i < candidates.length; i += 20) {
    const batch = candidates.slice(i, i + 20);
    const gated = await Promise.all(
      batch.map(async (slug) => (("reason" in (await loadPublishedOfficePage(slug))) ? null : slug)),
    );
    for (const slug of gated) if (slug) allowed.push(slug);
  }
  return allowed;
}

/** عرض عام جاهز للصفحة المنشورة فقط — يُرجع null لأي حالة غير متاحة. */
export async function readPublicOfficeView(slug: string): Promise<OfficePageView | null> {
  const result = await loadPublishedOfficePage(slug);
  if ("reason" in result) return null;
  return await toOfficePageView(result.page, { isPreview: false });
}

/* ------------------------------------------------------------- الأحداث */

export async function recordPublicEvent(slug: string, kind: string, channel: string) {
  if (!(OFFICE_EVENT_KINDS as readonly string[]).includes(kind)) return;
  const result = await loadPublishedOfficePage(slug);
  if ("reason" in result) return;
  await bumpOfficeEvent(
    result.page.organizationId,
    kind as OfficeEventKind,
    normalizeChannel(channel),
  );
}

/* -------------------------------------------------------------- الوسائط */

/** وسائط منشورة فقط: المسار يجب أن يكون مرجعياً داخل اللقطة المنشورة الحالية. */
export async function readPublishedMedia(
  slug: string,
  rest: string,
): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  if (!/^v\d+\/[A-Za-z0-9._-]+$/.test(rest)) return null;
  const result = await loadPublishedOfficePage(slug);
  if ("reason" in result) return null;
  const { organizationId, snapshot } = result.page;
  const path = `${organizationId}/${rest}`;
  const referenced = [
    snapshot.logo_path,
    snapshot.cover_path,
    ...snapshot.team.map((m) => m.photo_path),
  ];
  if (!referenced.includes(path)) return null;

  const { data, error } = await supabaseAdmin.storage.from(PUBLIC_BUCKET).download(path);
  if (error || !data) return null;
  return { bytes: await data.arrayBuffer(), contentType: data.type || "image/jpeg" };
}

/* ---------------------------------------------------------- طلب استشارة */

const HTML_PATTERN = /<[^>]*>|javascript:|data:text\/html|on\w+\s*=/i;

function assertSafeText(values: Array<string | undefined>) {
  for (const value of values) {
    if (value && HTML_PATTERN.test(value)) throw new LeadError("النص يحتوي رموزاً غير مسموحة.");
  }
}

export class LeadError extends Error {}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "");
  if (!digits) return "";
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  if (digits.startsWith("05") && digits.length === 10) return `+966${digits.slice(1)}`;
  if (digits.startsWith("966")) return `+${digits}`;
  return `+${digits}`;
}

function boundedUtm(utm: Record<string, string>): Record<string, string> {
  const allow = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];
  const out: Record<string, string> = {};
  for (const key of allow) {
    const value = (utm[key] ?? "").trim().slice(0, 80);
    if (value && !HTML_PATTERN.test(value)) out[key] = value;
  }
  return out;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export type LeadOutcome = { ok: true; duplicate: boolean; message: string };

/**
 * الإدراج العام: يستقبل `slug` فقط ويستنتج المكتب على الخادم.
 * التفرّد المنطقي مضمون بفهرس فريد (المكتب + بصمة الطلب + نافذة زمنية من القاعدة).
 */
export async function submitPublicLead(
  raw: unknown,
  meta: { ip?: string | null; referer?: string | null },
): Promise<LeadOutcome> {
  const parsed = officeLeadInputSchema.safeParse(raw);
  if (!parsed.success)
    throw new LeadError(parsed.error.issues[0]?.message ?? "تحقق من الحقول المدخلة.");
  const input = parsed.data;

  assertSafeText([input.full_name, input.message, input.city, input.email]);

  const result = await loadPublishedOfficePage(input.slug);
  if ("reason" in result) throw new LeadError(UNAVAILABLE);
  const { organizationId, snapshot, version } = result.page;

  const form = snapshot.lead_form;
  if (!form.enabled) throw new LeadError("نموذج طلب الاستشارة غير مُفعّل لهذا المكتب.");

  const phone = input.phone ? normalizePhone(input.phone) : "";
  if (phone && !/^\+\d{9,15}$/.test(phone)) throw new LeadError("أدخل رقم جوال صحيح.");
  if (form.require_phone && !phone) throw new LeadError("رقم الجوال مطلوب.");
  if (form.require_email && !input.email) throw new LeadError("البريد الإلكتروني مطلوب.");
  if (form.require_city && !input.city) throw new LeadError("المدينة مطلوبة.");
  if (!phone && !input.email) throw new LeadError("أضف رقم جوال أو بريداً إلكترونياً للتواصل معك.");
  if (form.consent_required && !input.consent)
    throw new LeadError("الموافقة على معالجة البيانات مطلوبة.");

  const serviceKey =
    input.service_key && snapshot.services.some((s) => s.key === input.service_key)
      ? input.service_key
      : input.service_key && OFFICE_SERVICES.some((s) => s.key === input.service_key)
        ? input.service_key
        : "";

  const ipHash = meta.ip ? hash(`office-lead:${meta.ip}`) : null;
  if (ipHash) {
    const since = new Date(Date.now() - 10 * 60_000).toISOString();
    const { count } = await supabaseAdmin
      .from("office_leads")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .gte("created_at", since);
    if ((count ?? 0) >= 5) throw new LeadError("تم تجاوز عدد المحاولات المسموح، حاول بعد قليل.");
  }

  let refererHost: string | null = null;
  try {
    refererHost = meta.referer ? new URL(meta.referer).hostname.slice(0, 120) : null;
  } catch {
    refererHost = null;
  }

  const dedupeHash = hash(
    [
      organizationId,
      input.full_name.trim().toLowerCase(),
      phone,
      input.email.toLowerCase(),
      input.message.trim().slice(0, 200),
    ].join("|"),
  );

  const { data: inserted, error } = await supabaseAdmin
    .from("office_leads")
    .insert({
      organization_id: organizationId,
      full_name: input.full_name,
      phone: phone || null,
      email: input.email || null,
      city: input.city || null,
      service_key: serviceKey || null,
      message: input.message || null,
      preferred_contact: input.preferred_contact ?? null,
      consent_at: input.consent ? new Date().toISOString() : null,
      consent_policy_version: snapshot.consent_policy_version || null,
      consent_text_hash: form.consent_required ? hash(form.consent_text) : null,
      page_version: version,
      channel: normalizeChannel(input.channel),
      utm: boundedUtm(input.utm) as never,
      referrer_host: refererHost,
      dedupe_hash: dedupeHash,
      ip_hash: ipHash,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    if (String(error.code) === "23505") {
      return { ok: true, duplicate: true, message: "تم إرسال طلبك مسبقاً، وسنتواصل معك قريباً." };
    }
    const { logFailure } = await import("@/lib/observability/failure-log.server");
    const ref = await logFailure({
      surface: "office_page",
      action: "lead_insert",
      error,
      organizationId,
      metadata: { slug: input.slug },
    });
    throw new LeadError(`تعذّر إرسال الطلب حالياً. المرجع: ${ref}`);
  }

  await bumpOfficeEvent(organizationId, "lead", normalizeChannel(input.channel));
  if (inserted?.id) {
    await notifyOfficeOfLead(organizationId, inserted.id, {
      officeName: snapshot.office_name,
      leadName: input.full_name,
      channel: normalizeChannel(input.channel),
      serviceKey,
      officeEmail: snapshot.email,
    });
  }

  return {
    ok: true,
    duplicate: false,
    message: form.thank_you || "تم استلام طلبك، وسنتواصل معك في أقرب وقت.",
  };
}

/**
 * إشعار المكتب: إشعار داخلي لمالك المكتب ومديريه بمفتاح تفرّد يمنع التكرار،
 * وبريد ملخّص واحد (بلا نص الرسالة) عبر خدمة بريد المنصة القائمة.
 */
async function notifyOfficeOfLead(
  organizationId: string,
  leadId: string,
  context: {
    officeName: string;
    leadName: string;
    channel: string;
    serviceKey: string;
    officeEmail: string;
  },
) {
  try {
    const { data: managers } = await supabaseAdmin
      .from("organization_members")
      .select("user_id, role")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .in("role", ["owner", "admin"]);

    const rows = (managers ?? []).map((m) => ({
      organization_id: organizationId,
      user_id: m.user_id,
      type: "office_lead_created",
      title: "طلب استشارة جديد",
      message: `وصلك طلب جديد من الصفحة العامة باسم ${context.leadName}.`,
      link: "/settings?tab=public-page&section=leads",
      dedup_key: `office_lead:${leadId}:${m.user_id}`,
      sent_at: new Date().toISOString(),
    }));
    if (rows.length) await supabaseAdmin.from("notifications").insert(rows as never);

    if (context.officeEmail) {
      const { sendOfficeLeadEmail } = await import("@/lib/office-lead-email.server");
      await sendOfficeLeadEmail({
        to: context.officeEmail,
        officeName: context.officeName,
        leadName: context.leadName,
        channel: context.channel,
        serviceKey: context.serviceKey,
        idempotencyKey: `office-lead:${leadId}`,
        organizationId,
      });
    }
  } catch {
    // فشل الإشعار لا يُبطل الطلب المحفوظ؛ الطلب هو مصدر الحقيقة.
  }
}
