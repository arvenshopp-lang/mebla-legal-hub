/**
 * دوال خادم وحدة التسويق — لوحة إدارة المنصة.
 * تدير الحملات وأحداث التحويل وبرامج الإحالة، وتقرأ حالة مزوّدي القياس/الإعلانات
 * من مركز التكاملات الحالي دون إنشاء نظام تكامل موازٍ.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { MARKETING_CAMPAIGN_STATUS, type MarketingCampaignRow } from "@/lib/marketing.shared";

/* ------------------------------------------------------------------ الحملات */

export const listMarketingCampaigns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        search: z.string().trim().max(120).default(""),
        status: z.enum(["all", ...MARKETING_CAMPAIGN_STATUS]).default("all"),
        channel: z.string().trim().max(60).default(""),
        page: z.number().int().min(1).max(500).default(1),
        pageSize: z.number().int().min(5).max(100).default(20),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    await g.requireStaff(context.supabase, context.userId, "marketing.read");
    const db = await g.admin();

    let q = db
      .from("marketing_campaigns")
      .select(
        "id, name, channel, objective, status, budget_amount, spend_amount, currency, starts_on, ends_on, utm_source, utm_medium, utm_campaign, landing_page_slug, coupon_id, owner_staff_id, notes, created_at, updated_at, platform_coupons(code), owner:owner_staff_id(full_name)",
        { count: "exact" },
      )
      .order("created_at", { ascending: false });

    if (data.search) {
      const s = data.search.replace(/[%,]/g, "");
      q = q.or(`name.ilike.%${s}%,utm_campaign.ilike.%${s}%,utm_source.ilike.%${s}%`);
    }
    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.channel) q = q.eq("channel", data.channel);

    const from = (data.page - 1) * data.pageSize;
    const { data: rows, error, count } = await q.range(from, from + data.pageSize - 1);
    if (error) throw new Error("تعذّر جلب قائمة الحملات.");

    const list = (rows ?? []).map((r: any) => ({
      id: r.id,
      name: r.name,
      channel: r.channel,
      objective: r.objective,
      status: r.status,
      budget_amount: Number(r.budget_amount),
      spend_amount: Number(r.spend_amount),
      currency: r.currency,
      starts_on: r.starts_on,
      ends_on: r.ends_on,
      utm_source: r.utm_source,
      utm_medium: r.utm_medium,
      utm_campaign: r.utm_campaign,
      landing_page_slug: r.landing_page_slug,
      coupon_id: r.coupon_id,
      coupon_code: r.platform_coupons?.code ?? null,
      owner_staff_id: r.owner_staff_id,
      owner_name: r.owner?.full_name ?? null,
      notes: r.notes,
      created_at: r.created_at,
      updated_at: r.updated_at,
    })) satisfies MarketingCampaignRow[];

    return { rows: list, total: count ?? 0 };
  });

const campaignInput = z.object({
  name: z.string().trim().min(2, "اسم الحملة مطلوب").max(160),
  channel: z.string().trim().min(2, "القناة مطلوبة").max(60),
  objective: z.string().trim().max(200).optional().or(z.literal("")),
  status: z.enum(MARKETING_CAMPAIGN_STATUS).default("draft"),
  budgetAmount: z.number().min(0).default(0),
  spendAmount: z.number().min(0).default(0),
  currency: z.string().trim().min(2).max(8).default("SAR"),
  startsOn: z.string().trim().max(10).optional().or(z.literal("")),
  endsOn: z.string().trim().max(10).optional().or(z.literal("")),
  utmSource: z.string().trim().max(80).optional().or(z.literal("")),
  utmMedium: z.string().trim().max(80).optional().or(z.literal("")),
  utmCampaign: z.string().trim().max(80).optional().or(z.literal("")),
  landingPageSlug: z.string().trim().max(160).optional().or(z.literal("")),
  couponId: z.string().uuid().optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

function n(fields: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(fields).map(([k, v]) => [
      k,
      typeof v === "string" && v.trim() === "" ? null : v,
    ]),
  );
}

export const createMarketingCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => campaignInput.parse(input))
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    const staff = await g.requireStaff(context.supabase, context.userId, "marketing.manage");
    const db = await g.admin();
    const patch = n({
      name: data.name,
      channel: data.channel,
      objective: data.objective,
      status: data.status,
      budget_amount: data.budgetAmount,
      spend_amount: data.spendAmount,
      currency: data.currency,
      starts_on: data.startsOn,
      ends_on: data.endsOn,
      utm_source: data.utmSource,
      utm_medium: data.utmMedium,
      utm_campaign: data.utmCampaign,
      landing_page_slug: data.landingPageSlug,
      coupon_id: data.couponId,
      notes: data.notes,
      owner_staff_id: staff.id,
    });
    const { data: created, error } = await db
      .from("marketing_campaigns")
      .insert(patch)
      .select("id")
      .single();
    if (error) throw new Error("تعذّر إنشاء الحملة.");
    await g.writeAudit(db, staff, {
      action: "marketing.campaign.create",
      entity_type: "marketing_campaign",
      entity_id: created.id,
      description: `إنشاء حملة «${data.name}»`,
      after: patch,
    });
    return { ok: true as const, id: created.id as string };
  });

export const updateMarketingCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    campaignInput.extend({ campaignId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    const staff = await g.requireStaff(context.supabase, context.userId, "marketing.manage");
    const db = await g.admin();
    const { campaignId, ...fields } = data;
    const { data: before } = await db
      .from("marketing_campaigns")
      .select("*")
      .eq("id", campaignId)
      .maybeSingle();
    if (!before) throw new Error("الحملة غير موجودة.");
    const patch = n({
      name: fields.name,
      channel: fields.channel,
      objective: fields.objective,
      status: fields.status,
      budget_amount: fields.budgetAmount,
      spend_amount: fields.spendAmount,
      currency: fields.currency,
      starts_on: fields.startsOn,
      ends_on: fields.endsOn,
      utm_source: fields.utmSource,
      utm_medium: fields.utmMedium,
      utm_campaign: fields.utmCampaign,
      landing_page_slug: fields.landingPageSlug,
      coupon_id: fields.couponId,
      notes: fields.notes,
    });
    const { error } = await db.from("marketing_campaigns").update(patch).eq("id", campaignId);
    if (error) throw new Error("تعذّر تحديث الحملة.");
    await g.writeAudit(db, staff, {
      action: "marketing.campaign.update",
      entity_type: "marketing_campaign",
      entity_id: campaignId,
      description: `تعديل حملة «${fields.name}»`,
      before: { status: before.status, budget_amount: before.budget_amount },
      after: patch,
    });
    return { ok: true as const };
  });

export const deleteMarketingCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ campaignId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    const staff = await g.requireStaff(context.supabase, context.userId, "marketing.manage");
    const db = await g.admin();
    const { data: before } = await db
      .from("marketing_campaigns")
      .select("id, name")
      .eq("id", data.campaignId)
      .maybeSingle();
    if (!before) throw new Error("الحملة غير موجودة.");
    const { error } = await db.from("marketing_campaigns").delete().eq("id", data.campaignId);
    if (error) throw new Error("تعذّر حذف الحملة. تحقق من عدم وجود أحداث تحويل مرتبطة.");
    await g.writeAudit(db, staff, {
      action: "marketing.campaign.delete",
      entity_type: "marketing_campaign",
      entity_id: data.campaignId,
      description: `حذف حملة «${before.name}»`,
      before,
    });
    return { ok: true as const };
  });

/* ------------------------------------------------------------------ أحداث التحويل */

export const listConversionEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        campaignId: z.string().uuid().optional(),
        page: z.number().int().min(1).max(500).default(1),
        pageSize: z.number().int().min(5).max(100).default(20),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    await g.requireStaff(context.supabase, context.userId, "marketing.read");
    const db = await g.admin();
    let q = db
      .from("marketing_conversion_events")
      .select(
        "id, campaign_id, lead_id, organization_id, event_key, label, value_amount, source, utm, occurred_at, created_at, marketing_campaigns(name)",
        { count: "exact" },
      )
      .order("occurred_at", { ascending: false });
    if (data.campaignId) q = q.eq("campaign_id", data.campaignId);
    const from = (data.page - 1) * data.pageSize;
    const { data: rows, error, count } = await q.range(from, from + data.pageSize - 1);
    if (error) throw new Error("تعذّر جلب أحداث التحويل.");
    return {
      rows: (rows ?? []).map((r: any) => ({
        id: r.id,
        campaign_id: r.campaign_id,
        campaign_name: r.marketing_campaigns?.name ?? null,
        lead_id: r.lead_id,
        organization_id: r.organization_id,
        event_key: r.event_key,
        label: r.label,
        value_amount: Number(r.value_amount),
        source: r.source,
        utm: r.utm,
        occurred_at: r.occurred_at,
        created_at: r.created_at,
      })),
      total: count ?? 0,
    };
  });

export const createConversionEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        campaignId: z.string().uuid().optional().or(z.literal("")),
        leadId: z.string().uuid().optional().or(z.literal("")),
        eventKey: z.string().trim().min(2).max(80),
        label: z.string().trim().max(160).optional().or(z.literal("")),
        valueAmount: z.number().min(0).default(0),
        source: z.string().trim().max(80).optional().or(z.literal("")),
        occurredAt: z.string().trim().min(4).max(30).optional().or(z.literal("")),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    const staff = await g.requireStaff(context.supabase, context.userId, "marketing.manage");
    const db = await g.admin();
    const patch = n({
      campaign_id: data.campaignId,
      lead_id: data.leadId,
      event_key: data.eventKey,
      label: data.label,
      value_amount: data.valueAmount,
      source: data.source,
      occurred_at: data.occurredAt || new Date().toISOString(),
    });
    const { data: created, error } = await db
      .from("marketing_conversion_events")
      .insert(patch)
      .select("id")
      .single();
    if (error) throw new Error("تعذّر تسجيل حدث التحويل.");
    await g.writeAudit(db, staff, {
      action: "marketing.conversion.create",
      entity_type: "marketing_conversion_event",
      entity_id: created.id,
      description: `تسجيل حدث تحويل «${data.eventKey}»`,
      after: patch,
    });
    return { ok: true as const };
  });

/* ------------------------------------------------------------------ برامج الإحالة */

export const listMarketingReferrals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ search: z.string().trim().max(120).default("") }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    await g.requireStaff(context.supabase, context.userId, "marketing.read");
    const db = await g.admin();
    let q = db
      .from("marketing_referrals")
      .select(
        "id, code, referrer_kind, referrer_name, referrer_email, coupon_id, reward_note, max_uses, uses_count, is_active, label, created_at, updated_at, platform_coupons(code)",
      )
      .order("created_at", { ascending: false });
    if (data.search) {
      const s = data.search.replace(/[%,]/g, "");
      q = q.or(`code.ilike.%${s}%,referrer_name.ilike.%${s}%,referrer_email.ilike.%${s}%`);
    }
    const { data: rows, error } = await q.limit(200);
    if (error) throw new Error("تعذّر جلب برامج الإحالة.");
    return {
      rows: (rows ?? []).map((r: any) => ({
        id: r.id,
        code: r.code,
        referrer_kind: r.referrer_kind,
        referrer_name: r.referrer_name,
        referrer_email: r.referrer_email,
        coupon_id: r.coupon_id,
        coupon_code: r.platform_coupons?.code ?? null,
        reward_note: r.reward_note,
        max_uses: r.max_uses,
        uses_count: r.uses_count,
        is_active: r.is_active,
        label: r.label,
        created_at: r.created_at,
        updated_at: r.updated_at,
      })),
    };
  });

const referralInput = z.object({
  code: z.string().trim().min(2, "رمز الإحالة مطلوب").max(40),
  referrerKind: z.string().trim().min(2).max(40),
  referrerName: z.string().trim().max(160).optional().or(z.literal("")),
  referrerEmail: z.string().trim().max(160).optional().or(z.literal("")),
  couponId: z.string().uuid().optional().or(z.literal("")),
  rewardNote: z.string().trim().max(300).optional().or(z.literal("")),
  maxUses: z.number().int().min(0).optional(),
  label: z.string().trim().max(160).optional().or(z.literal("")),
  isActive: z.boolean().default(true),
});

export const createMarketingReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => referralInput.parse(input))
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    const staff = await g.requireStaff(context.supabase, context.userId, "marketing.manage");
    const db = await g.admin();
    const { data: dup } = await db
      .from("marketing_referrals")
      .select("id")
      .eq("code", data.code)
      .maybeSingle();
    if (dup) throw new Error("رمز الإحالة مستخدم مسبقاً.");
    const patch = n({
      code: data.code,
      referrer_kind: data.referrerKind,
      referrer_name: data.referrerName,
      referrer_email: data.referrerEmail,
      coupon_id: data.couponId,
      reward_note: data.rewardNote,
      max_uses: data.maxUses ?? null,
      label: data.label,
      is_active: data.isActive,
      created_by: staff.user_id,
    });
    const { data: created, error } = await db
      .from("marketing_referrals")
      .insert(patch)
      .select("id")
      .single();
    if (error) throw new Error("تعذّر إنشاء برنامج الإحالة.");
    await g.writeAudit(db, staff, {
      action: "marketing.referral.create",
      entity_type: "marketing_referral",
      entity_id: created.id,
      description: `إنشاء برنامج إحالة «${data.code}»`,
      after: patch,
    });
    return { ok: true as const };
  });

export const updateMarketingReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    referralInput.extend({ referralId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    const staff = await g.requireStaff(context.supabase, context.userId, "marketing.manage");
    const db = await g.admin();
    const { referralId, ...fields } = data;
    const { data: before } = await db
      .from("marketing_referrals")
      .select("id, code")
      .eq("id", referralId)
      .maybeSingle();
    if (!before) throw new Error("برنامج الإحالة غير موجود.");
    const patch = n({
      referrer_kind: fields.referrerKind,
      referrer_name: fields.referrerName,
      referrer_email: fields.referrerEmail,
      coupon_id: fields.couponId,
      reward_note: fields.rewardNote,
      max_uses: fields.maxUses ?? null,
      label: fields.label,
      is_active: fields.isActive,
    });
    const { error } = await db.from("marketing_referrals").update(patch).eq("id", referralId);
    if (error) throw new Error("تعذّر تحديث برنامج الإحالة.");
    await g.writeAudit(db, staff, {
      action: "marketing.referral.update",
      entity_type: "marketing_referral",
      entity_id: referralId,
      description: `تعديل برنامج إحالة «${before.code}»`,
      after: patch,
    });
    return { ok: true as const };
  });

/* ------------------------------------------------------------------ الكوبونات (لربط الحملات) */

export const listCouponsForMarketing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({}).parse(input ?? {}))
  .handler(async ({ context }) => {
    const g = await import("@/lib/admin-guard.server");
    await g.requireStaff(context.supabase, context.userId, "marketing.read");
    const db = await g.admin();
    const { data } = await db
      .from("platform_coupons")
      .select("id, code, discount_type, discount_value, is_active")
      .order("code");
    return { coupons: data ?? [] };
  });

/* ------------------------------------------------------------------ ملخص الأداء */

export const getMarketingPerformanceSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({}).parse(input ?? {}))
  .handler(async ({ context }) => {
    const g = await import("@/lib/admin-guard.server");
    await g.requireStaff(context.supabase, context.userId, "marketing.read");
    const db = await g.admin();

    const { data: campaigns } = await db
      .from("marketing_campaigns")
      .select(
        "id, name, utm_source, utm_medium, utm_campaign, budget_amount, spend_amount, currency, status",
      );

    const { data: leads } = await db
      .from("crm_leads")
      .select("id, utm, status")
      .not("utm", "eq", "{}");
    const { data: deals } = await db
      .from("crm_deals")
      .select("id, utm, amount, status")
      .not("utm", "eq", "{}");
    const { data: events } = await db
      .from("marketing_conversion_events")
      .select("campaign_id, value_amount");

    const eventsByCampaign = new Map<string, { count: number; value: number }>();
    for (const e of events ?? []) {
      if (!e.campaign_id) continue;
      const cur = eventsByCampaign.get(e.campaign_id) ?? { count: 0, value: 0 };
      cur.count += 1;
      cur.value += Number(e.value_amount ?? 0);
      eventsByCampaign.set(e.campaign_id, cur);
    }

    function matches(campaign: any, utm: any) {
      if (!utm || typeof utm !== "object") return false;
      const c = campaign.utm_campaign,
        s = campaign.utm_source,
        m = campaign.utm_medium;
      if (!c && !s && !m) return false;
      const uc = utm.utm_campaign ?? utm.campaign ?? null;
      const us = utm.utm_source ?? utm.source ?? null;
      const um = utm.utm_medium ?? utm.medium ?? null;
      if (c && uc !== c) return false;
      if (s && us !== s) return false;
      if (m && um !== m) return false;
      return true;
    }

    const summary = (campaigns ?? []).map((c: any) => {
      const leadsMatched = (leads ?? []).filter((l: any) => matches(c, l.utm));
      const dealsMatched = (deals ?? []).filter((d: any) => matches(c, d.utm));
      const wonDeals = dealsMatched.filter((d: any) => d.status === "won");
      const ev = eventsByCampaign.get(c.id) ?? { count: 0, value: 0 };
      return {
        campaign_id: c.id,
        campaign_name: c.name,
        status: c.status,
        budget_amount: Number(c.budget_amount),
        spend_amount: Number(c.spend_amount),
        currency: c.currency,
        leads_count: leadsMatched.length,
        deals_count: dealsMatched.length,
        won_deals_count: wonDeals.length,
        won_amount: wonDeals.reduce((s: number, d: any) => s + Number(d.amount ?? 0), 0),
        conversion_events_count: ev.count,
        conversion_events_value: ev.value,
      };
    });

    return { summary };
  });

/* ------------------------------------------------------------------ مزوّدو القياس والإعلانات */

const MARKETING_PROVIDER_KEYS = [
  "google_analytics",
  "google_ads",
  "meta_ads",
  "tiktok_ads",
  "snapchat_ads",
  "linkedin_ads",
];

export const listMarketingProviders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({}).parse(input ?? {}))
  .handler(async ({ context }) => {
    const g = await import("@/lib/admin-guard.server");
    await g.requireStaff(context.supabase, context.userId, "marketing.read");
    const db = await g.admin();
    const { data: defs } = await db
      .from("integration_definitions")
      .select("provider_key, display_name_ar, category_label")
      .in("provider_key", MARKETING_PROVIDER_KEYS);
    const { data: configured } = await db
      .from("platform_integrations")
      .select("provider_key, is_enabled, status, last_checked_at, environment")
      .in("provider_key", MARKETING_PROVIDER_KEYS);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const byKey = new Map<string, any>((configured ?? []).map((c: any) => [c.provider_key, c]));
    const providers = (defs ?? []).map((d: any) => {
      const cfg = byKey.get(d.provider_key);
      return {
        provider_key: d.provider_key,
        display_name_ar: d.display_name_ar,
        category_label: d.category_label,
        configured: Boolean(cfg),
        is_enabled: cfg?.is_enabled ?? false,
        status: cfg?.status ?? "غير مربوط",
        last_checked_at: cfg?.last_checked_at ?? null,
        environment: cfg?.environment ?? null,
      };
    });
    return { providers };
  });

/* ------------------------------------------------------------------ تصدير CSV */

export const exportMarketingCampaigns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({}).parse(input ?? {}))
  .handler(async ({ context }) => {
    const g = await import("@/lib/admin-guard.server");
    await g.requireStaff(context.supabase, context.userId, "marketing.export");
    const db = await g.admin();
    const { data: rows } = await db
      .from("marketing_campaigns")
      .select(
        "name, channel, status, budget_amount, spend_amount, currency, starts_on, ends_on, utm_source, utm_medium, utm_campaign",
      )
      .order("created_at", { ascending: false });
    return { rows: rows ?? [] };
  });
