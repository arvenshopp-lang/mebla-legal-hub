/**
 * عمليات الصفحة العامة للمكتب (خادمية فقط).
 * كل عملية تنفّذ بجلسة المستخدم لتطبيق RLS، مع بوابة استحقاق الباقة قبل النشر،
 * وتسجيل كل تغيير في سجل نشاط المكتب.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  OFFICE_EVENT_KINDS,
  emptySnapshot,
  officeSnapshotSchema,
  publishBlockers,
  officePageUrl,
  type OfficeEventKind,
  type OfficeLeadStatus,
  type OfficePageView,
  type OfficeSnapshot,
} from "@/lib/office-page.shared";
import {
  buildPublishedSnapshot,
  draftMediaUrl,
  ensureOfficePageRow,
  hasOfficePageEntitlement,
  pruneUnreferencedPublishedMedia,
  publishedMediaKeep,
  storeDraftMedia,
  toOfficePageView,
} from "@/lib/office-page.server";

type Client = SupabaseClient<Database>;

type PageRow = Database["public"]["Tables"]["office_public_pages"]["Row"];

async function requireManager(supabase: Client, userId: string, organizationId: string) {
  const { data } = await supabase
    .from("organization_members")
    .select("role, status")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data || data.status !== "active" || !["owner", "admin"].includes(data.role)) {
    throw new Error("إدارة الصفحة العامة متاحة لمالك المكتب أو مديره فقط.");
  }
}

async function readRow(supabase: Client, organizationId: string): Promise<PageRow> {
  const { data, error } = await supabase
    .from("office_public_pages")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error("تعذّر قراءة بيانات الصفحة العامة.");
  if (data) return data;
  return (await ensureOfficePageRow(organizationId)) as PageRow;
}

function parseSnapshot(value: unknown, fallbackName = ""): OfficeSnapshot {
  const parsed = officeSnapshotSchema.safeParse(value);
  return parsed.success ? parsed.data : emptySnapshot(fallbackName);
}

async function audit(
  supabase: Client,
  organizationId: string,
  userId: string,
  action: string,
  description: string,
  metadata: Record<string, unknown> = {},
) {
  await supabase.from("activity_logs").insert({
    organization_id: organizationId,
    user_id: userId,
    action,
    entity_type: "office_public_page",
    description,
    metadata: metadata as never,
  });
}

async function draftMediaUrls(snapshot: OfficeSnapshot) {
  const [logo, cover] = await Promise.all([
    draftMediaUrl(snapshot.logo_path),
    draftMediaUrl(snapshot.cover_path),
  ]);
  const team = await Promise.all(snapshot.team.map((m) => draftMediaUrl(m.photo_path)));
  return { logo, cover, team };
}

export type OfficePageState = {
  slug: string;
  status: string;
  version: number;
  suspended: boolean;
  suspensionReason: string | null;
  publishedAt: string | null;
  entitled: boolean;
  draft: OfficeSnapshot;
  hasPublished: boolean;
  dirty: boolean;
  blockers: string[];
  publicUrl: string;
  mediaUrls: { logo: string; cover: string; team: string[] };
};

export async function readState(
  supabase: Client,
  organizationId: string,
): Promise<OfficePageState> {
  const row = await readRow(supabase, organizationId);
  const draft = parseSnapshot(row.draft);
  const published = row.published ? parseSnapshot(row.published) : null;
  const entitled = await hasOfficePageEntitlement(organizationId);
  return {
    slug: row.slug,
    status: row.status,
    version: row.version,
    suspended: row.suspended_by_platform,
    suspensionReason: row.suspension_reason,
    publishedAt: row.published_at,
    entitled,
    draft,
    hasPublished: !!published,
    dirty: JSON.stringify(draft) !== JSON.stringify(published),
    blockers: publishBlockers(draft),
    publicUrl: officePageUrl(row.slug),
    mediaUrls: await draftMediaUrls(draft),
  };
}

export async function saveDraft(
  supabase: Client,
  userId: string,
  organizationId: string,
  draft: OfficeSnapshot,
) {
  await requireManager(supabase, userId, organizationId);
  await readRow(supabase, organizationId);
  const { error } = await supabase
    .from("office_public_pages")
    .update({ draft: draft as never, updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId);
  if (error) throw new Error("تعذّر حفظ المسودة، حاول مرة أخرى.");
  await audit(
    supabase,
    organizationId,
    userId,
    "office_page.draft.save",
    "حفظ مسودة الصفحة العامة",
  );
  return await readState(supabase, organizationId);
}

export async function changeSlug(
  supabase: Client,
  userId: string,
  organizationId: string,
  slug: string,
) {
  await requireManager(supabase, userId, organizationId);
  const row = await readRow(supabase, organizationId);
  if (row.slug === slug) return await readState(supabase, organizationId);

  const { data: taken } = await supabaseAdmin
    .from("office_public_pages")
    .select("organization_id")
    .eq("slug", slug)
    .maybeSingle();
  if (taken) throw new Error("هذا الرابط مستخدم من مكتب آخر، اختر رابطاً غيره.");

  const { error } = await supabase
    .from("office_public_pages")
    .update({ slug, updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId);
  if (error) {
    // الفهرس الفريد هو الفاصل الحقيقي عند التزامن؛ الفحص السابق لا يمنع التسابق.
    if (String(error.code) === "23505")
      throw new Error("هذا الرابط مستخدم من مكتب آخر، اختر رابطاً غيره.");
    throw new Error("تعذّر تحديث الرابط، حاول مرة أخرى.");
  }

  await audit(
    supabase,
    organizationId,
    userId,
    "office_page.slug.change",
    `تغيير رابط الصفحة العامة إلى ${slug}`,
    { from: row.slug, to: slug },
  );
  return await readState(supabase, organizationId);
}

export async function publish(supabase: Client, userId: string, organizationId: string) {
  await requireManager(supabase, userId, organizationId);
  const row = await readRow(supabase, organizationId);
  if (row.suspended_by_platform) throw new Error("الصفحة موقوفة من إدارة المنصة، تواصل مع الدعم.");

  const { assertEntitlement } = await import("@/lib/subscription.server");
  await assertEntitlement(supabase, organizationId, {
    feature: "public_office_page",
    requireLive: true,
  });

  const draft = parseSnapshot(row.draft);
  const blockers = publishBlockers(draft);
  if (blockers.length) throw new Error(blockers[0]);

  const version = row.version + 1;
  const { readPublicSiteInfo } = await import("@/lib/public-site.server");
  const info = await readPublicSiteInfo();
  // نسخة السياسة = تاريخ نفاذ سياسات المنصة، وهي المرجع الرسمي المعروض للزائر.
  const policyVersion = info.policies_effective_date || "unversioned";

  const stamped = officeSnapshotSchema.parse({ ...draft, consent_policy_version: policyVersion });
  const published = await buildPublishedSnapshot(organizationId, stamped, version);

  const { error } = await supabase
    .from("office_public_pages")
    .update({
      status: "published",
      version,
      draft: stamped as never,
      published: published as never,
      published_at: new Date().toISOString(),
      published_by: userId,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId);
  if (error) throw new Error("تعذّر نشر الصفحة، حاول مرة أخرى.");

  await pruneUnreferencedPublishedMedia(organizationId, publishedMediaKeep(published));
  await audit(
    supabase,
    organizationId,
    userId,
    "office_page.publish",
    `نشر الصفحة العامة (النسخة ${version})`,
    { version, slug: row.slug },
  );
  return await readState(supabase, organizationId);
}

export async function unpublish(supabase: Client, userId: string, organizationId: string) {
  await requireManager(supabase, userId, organizationId);
  const row = await readRow(supabase, organizationId);
  const { error } = await supabase
    .from("office_public_pages")
    .update({ status: "unpublished", updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId);
  if (error) throw new Error("تعذّر إيقاف النشر، حاول مرة أخرى.");
  await audit(
    supabase,
    organizationId,
    userId,
    "office_page.unpublish",
    "إيقاف نشر الصفحة العامة",
    { slug: row.slug },
  );
  return await readState(supabase, organizationId);
}

export async function uploadMedia(
  supabase: Client,
  userId: string,
  input: {
    organizationId: string;
    kind: "logo" | "cover" | "team";
    contentType: string;
    base64: string;
  },
) {
  await requireManager(supabase, userId, input.organizationId);
  const binary = atob(input.base64.replace(/^data:[^;]+;base64,/, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const path = await storeDraftMedia(input.organizationId, input.kind, bytes, input.contentType);
  await audit(
    supabase,
    input.organizationId,
    userId,
    "office_page.media.upload",
    "رفع صورة إلى مسودة الصفحة العامة",
    { kind: input.kind },
  );
  return { path, url: await draftMediaUrl(path) };
}

/** معاينة المسودة كما ستظهر للزائر — بروابط موقّعة قصيرة، بلا أي رمز في الرابط. */
export async function previewView(
  supabase: Client,
  organizationId: string,
): Promise<OfficePageView> {
  const row = await readRow(supabase, organizationId);
  const draft = parseSnapshot(row.draft);
  return await toOfficePageView(
    { organizationId, slug: row.slug, version: row.version, snapshot: draft },
    { isPreview: true },
  );
}

/* ------------------------------------------------------- العملاء المحتملون */

export type OfficeLeadRow = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  service_key: string | null;
  message: string | null;
  preferred_contact: string | null;
  status: OfficeLeadStatus;
  channel: string | null;
  source: string | null;
  internal_note: string | null;
  assigned_to: string | null;
  assigned_name: string | null;
  converted_client_id: string | null;
  consent_at: string | null;
  consent_policy_version: string | null;
  page_version: number | null;
  created_at: string;
};

export async function listLeads(
  supabase: Client,
  input: {
    organizationId: string;
    search: string;
    status: string;
    page: number;
    pageSize: number;
  },
) {
  let q = supabase
    .from("office_leads")
    .select(
      "id, full_name, phone, email, city, service_key, message, preferred_contact, status, channel, source, internal_note, assigned_to, converted_client_id, consent_at, consent_policy_version, page_version, created_at",
      { count: "exact" },
    )
    .eq("organization_id", input.organizationId)
    .order("created_at", { ascending: false });

  if (input.status !== "all") q = q.eq("status", input.status);
  if (input.search) {
    const s = input.search.replace(/[%,]/g, "");
    q = q.or(`full_name.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%,city.ilike.%${s}%`);
  }

  const from = (input.page - 1) * input.pageSize;
  const { data, error, count } = await q.range(from, from + input.pageSize - 1);
  if (error) throw new Error("تعذّر جلب قائمة الطلبات.");

  const assignees = [
    ...new Set((data ?? []).map((r) => r.assigned_to).filter(Boolean)),
  ] as string[];
  const names = new Map<string, string>();
  if (assignees.length) {
    const { data: people } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", assignees);
    for (const p of people ?? []) names.set(p.id, p.full_name ?? "");
  }

  const rows: OfficeLeadRow[] = (data ?? []).map((r) => ({
    ...r,
    status: r.status as OfficeLeadStatus,
    assigned_name: r.assigned_to ? (names.get(r.assigned_to) ?? null) : null,
  }));

  return { rows, total: count ?? 0 };
}

export async function updateLead(
  supabase: Client,
  userId: string,
  input: {
    organizationId: string;
    leadId: string;
    status?: OfficeLeadStatus;
    internalNote?: string;
    assignedTo?: string | null;
  },
) {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.status) patch.status = input.status;
  if (input.internalNote !== undefined) patch.internal_note = input.internalNote || null;
  if (input.assignedTo !== undefined) patch.assigned_to = input.assignedTo;

  const { error } = await supabase
    .from("office_leads")
    .update(patch as never)
    .eq("id", input.leadId)
    .eq("organization_id", input.organizationId);
  if (error) throw new Error("تعذّر تحديث الطلب، تحقّق من صلاحيتك ثم حاول مجدداً.");

  await audit(
    supabase,
    input.organizationId,
    userId,
    "office_page.lead.update",
    "تحديث طلب قادم من الصفحة العامة",
    { lead_id: input.leadId, status: input.status ?? null },
  );
  return { ok: true as const };
}

/** تحويل يدوي إلى عميل — لا يحدث تلقائياً حتى لا تتلوث قاعدة العملاء. */
export async function convertLead(
  supabase: Client,
  userId: string,
  organizationId: string,
  leadId: string,
) {
  const { data: lead, error } = await supabase
    .from("office_leads")
    .select("id, full_name, phone, email, city, message, converted_client_id")
    .eq("id", leadId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error || !lead) throw new Error("الطلب غير موجود أو لا تملك صلاحية الوصول إليه.");
  if (lead.converted_client_id)
    return { clientId: lead.converted_client_id, alreadyConverted: true as const };

  const { data: client, error: clientErr } = await supabase
    .from("clients")
    .insert({
      organization_id: organizationId,
      client_type: "individual",
      full_name: lead.full_name,
      phone: lead.phone,
      email: lead.email,
      city: lead.city,
      notes: lead.message ? `طلب من الصفحة العامة:\n${lead.message}` : null,
      created_by: userId,
    })
    .select("id")
    .single();
  if (clientErr || !client) throw new Error("تعذّر إنشاء العميل من الطلب، حاول مرة أخرى.");

  // مطالبة ذرّية بالطلب: أول تحويل فقط يربط العميل، فلا ينشأ عميلان عند التزامن.
  const { data: claimed } = await supabase
    .from("office_leads")
    .update({
      status: "converted",
      converted_client_id: client.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId)
    .eq("organization_id", organizationId)
    .is("converted_client_id", null)
    .select("id, converted_client_id");

  if (!claimed || claimed.length === 0) {
    // سبقنا تحويل آخر: نتراجع عن العميل المُنشأ ونعيد العميل المعتمد.
    await supabase.from("clients").delete().eq("id", client.id).eq("organization_id", organizationId);
    const { data: winner } = await supabase
      .from("office_leads")
      .select("converted_client_id")
      .eq("id", leadId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    return {
      clientId: (winner?.converted_client_id as string | null) ?? client.id,
      alreadyConverted: true as const,
    };
  }

  await audit(
    supabase,
    organizationId,
    userId,
    "office_page.lead.convert",
    "تحويل طلب من الصفحة العامة إلى عميل",
    { lead_id: leadId, client_id: client.id },
  );
  return { clientId: client.id, alreadyConverted: false as const };
}

/* ------------------------------------------------------------- التحليلات */

export type OfficePageAnalytics = {
  days: number;
  totals: Record<string, number>;
  byChannel: Array<{ channel: string; count: number }>;
  daily: Array<{ day: string; views: number; leads: number }>;
  leadsTotal: number;
  convertedTotal: number;
};

export async function analytics(
  supabase: Client,
  organizationId: string,
  days: number,
): Promise<OfficePageAnalytics> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("office_page_events")
    .select("day, kind, channel, count")
    .eq("organization_id", organizationId)
    .gte("day", since)
    .order("day", { ascending: true });
  if (error) throw new Error("تعذّر جلب إحصاءات الصفحة العامة.");

  const totals: Record<string, number> = {};
  for (const kind of OFFICE_EVENT_KINDS) totals[kind] = 0;
  const channelMap = new Map<string, number>();
  const dailyMap = new Map<string, { views: number; leads: number }>();

  for (const row of data ?? []) {
    const kind = row.kind as OfficeEventKind;
    totals[kind] = (totals[kind] ?? 0) + row.count;
    channelMap.set(row.channel, (channelMap.get(row.channel) ?? 0) + row.count);
    const bucket = dailyMap.get(row.day) ?? { views: 0, leads: 0 };
    if (kind === "view") bucket.views += row.count;
    if (kind === "lead") bucket.leads += row.count;
    dailyMap.set(row.day, bucket);
  }

  const { count: leadsTotal } = await supabase
    .from("office_leads")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);
  const { count: convertedTotal } = await supabase
    .from("office_leads")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("status", "converted");

  return {
    days,
    totals,
    byChannel: [...channelMap.entries()]
      .map(([channel, count]) => ({ channel, count }))
      .sort((a, b) => b.count - a.count),
    daily: [...dailyMap.entries()]
      .map(([day, v]) => ({ day, ...v }))
      .sort((a, b) => a.day.localeCompare(b.day)),
    leadsTotal: leadsTotal ?? 0,
    convertedTotal: convertedTotal ?? 0,
  };
}
