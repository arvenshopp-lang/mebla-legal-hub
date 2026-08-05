/**
 * DesignThemeService — الخدمة المركزية لتصميم المنصة.
 * كل عمليات القراءة والكتابة والنشر والاسترجاع تمر من هنا بمفتاح الخدمة،
 * ولا تُخزَّن أي أنماط غير مفحوصة كنسخة منشورة.
 */
import { validateCustomCss, type CssValidation } from "./css-guard";
import {
  fontLinks,
  sanitizeMeta,
  sanitizeTokens,
  tokensToCss,
  type DesignTokens,
  type ThemeMeta,
} from "./tokens";
import { isDesignPageKey } from "./pages";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export type VersionSnapshot = {
  id: string;
  version_number: number;
  design_tokens_json: { tokens?: DesignTokens; meta?: ThemeMeta } | null;
  page_tokens_json: Record<string, DesignTokens> | null;
  sanitized_css: string;
  custom_css: string;
  page_css_json: Record<string, string> | null;
  change_summary: string | null;
  published_at: string | null;
  published_by: string | null;
  created_at: string;
  status: string;
};

export type PublishState = {
  id: string;
  theme_id: string | null;
  active_version_id: string | null;
  previous_version_id: string | null;
  rollback_available: boolean;
  rollback_used_at: string | null;
  cache_version: number;
  last_published_at: string | null;
  last_published_by: string | null;
};

async function db(): Promise<AnyClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as AnyClient;
}

/* ---------------------------- ذاكرة التخزين ---------------------------- */

type CacheEntry = { cacheVersion: number; css: string; builtAt: number };
let bundleCache: CacheEntry | null = null;
let stateCache: { state: PublishState; at: number } | null = null;
const STATE_TTL_MS = 15_000;

export function invalidateThemeCache() {
  bundleCache = null;
  stateCache = null;
}

/* ------------------------------- القراءة ------------------------------- */

export async function getPublishState(useCache = true): Promise<PublishState> {
  if (useCache && stateCache && Date.now() - stateCache.at < STATE_TTL_MS) return stateCache.state;
  const client = await db();
  const { data, error } = await client
    .from("design_publish_state")
    .select("*")
    .eq("singleton", true)
    .maybeSingle();
  if (error) throw new Error("تعذّر قراءة حالة نشر التصميم.");
  let state = data as PublishState | null;
  if (!state) {
    const { data: theme } = await client
      .from("design_themes")
      .select("id")
      .eq("is_active", true)
      .maybeSingle();
    const { data: created } = await client
      .from("design_publish_state")
      .insert({ theme_id: theme?.id ?? null, singleton: true })
      .select("*")
      .single();
    state = created as PublishState;
  }
  stateCache = { state, at: Date.now() };
  return state;
}

export async function getActiveTheme(): Promise<VersionSnapshot | null> {
  const state = await getPublishState();
  if (!state.active_version_id) return null;
  const client = await db();
  const { data } = await client
    .from("design_versions")
    .select("*")
    .eq("id", state.active_version_id)
    .maybeSingle();
  return (data as VersionSnapshot | null) ?? null;
}

/** تصميم صفحة محددة من النسخة النشطة. */
export async function getPageTheme(
  pageKey: string,
): Promise<{ tokens: DesignTokens; css: string }> {
  const active = await getActiveTheme();
  return {
    tokens: active?.page_tokens_json?.[pageKey] ?? {},
    css: active?.page_css_json?.[pageKey] ?? "",
  };
}

export async function activeThemeId(): Promise<string> {
  const state = await getPublishState();
  if (state.theme_id) return state.theme_id;
  const client = await db();
  const { data } = await client
    .from("design_themes")
    .select("id")
    .eq("is_active", true)
    .maybeSingle();
  if (!data?.id) throw new Error("لا يوجد تصميم نشط في المنصة.");
  return data.id as string;
}

export async function listDrafts() {
  const client = await db();
  const themeId = await activeThemeId();
  const { data } = await client
    .from("design_drafts")
    .select("page_key, design_tokens_json, custom_css, updated_at, updated_by, revision_number")
    .eq("theme_id", themeId);
  return (data ?? []) as DraftRow[];
}

export type DraftRow = {
  page_key: string;
  design_tokens_json: { tokens?: Record<string, string>; meta?: Partial<ThemeMeta> } | null;
  custom_css: string;
  updated_at: string;
  updated_by: string | null;
  revision_number: number;
};

export async function listVersions(limit = 30) {
  const client = await db();
  const themeId = await activeThemeId();
  const { data } = await client
    .from("design_versions")
    .select(
      "id, version_number, scope, page_key, status, change_summary, published_at, published_by, created_at",
    )
    .eq("theme_id", themeId)
    .order("version_number", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function listAudit(limit = 40) {
  const client = await db();
  const { data } = await client
    .from("design_audit_logs")
    .select(
      "id, actor_email, action, page_key, version_id, before_summary, after_summary, trace_id, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

/* ------------------------------- المسودات ------------------------------- */

export async function saveDraft(args: {
  pageKey: string;
  tokens: Record<string, unknown>;
  customCss: string;
  meta?: unknown;
  userId: string;
}) {
  if (!isDesignPageKey(args.pageKey)) throw new Error("مفتاح الصفحة غير معروف.");
  const client = await db();
  const themeId = await activeThemeId();
  const { tokens, rejected } = sanitizeTokens(args.tokens);
  const payload: Record<string, unknown> = { tokens };
  if (args.pageKey === "global") payload.meta = sanitizeMeta(args.meta);

  const { data: existing } = await client
    .from("design_drafts")
    .select("id, revision_number")
    .eq("theme_id", themeId)
    .eq("page_key", args.pageKey)
    .maybeSingle();

  const row = {
    theme_id: themeId,
    page_key: args.pageKey,
    design_tokens_json: payload,
    custom_css: String(args.customCss ?? "").slice(0, MAX_DRAFT_CSS),
    updated_by: args.userId,
    updated_at: new Date().toISOString(),
    revision_number: (existing?.revision_number ?? 0) + 1,
  };

  if (existing?.id) {
    const { error } = await client.from("design_drafts").update(row).eq("id", existing.id);
    if (error) throw new Error("تعذّر حفظ المسودة.");
  } else {
    const { error } = await client.from("design_drafts").insert(row);
    if (error) throw new Error("تعذّر حفظ المسودة.");
  }

  return { revision: row.revision_number, savedAt: row.updated_at, rejectedTokens: rejected };
}

const MAX_DRAFT_CSS = 120 * 1024;

export function validateDraft(pageKey: string, tokens: Record<string, unknown>, customCss: string) {
  const { rejected } = sanitizeTokens(tokens);
  const css: CssValidation = validateCustomCss(customCss ?? "", pageKey);
  return {
    valid: css.valid && rejected.length === 0,
    css,
    rejectedTokens: rejected,
  };
}

export async function resetPageTheme(pageKey: string, userId: string) {
  const client = await db();
  const themeId = await activeThemeId();
  await client.from("design_drafts").delete().eq("theme_id", themeId).eq("page_key", pageKey);
  return saveDraft({ pageKey, tokens: {}, customCss: "", meta: {}, userId });
}

/* -------------------------------- النشر -------------------------------- */

export type PublishResult =
  | { ok: true; versionNumber: number; cacheVersion: number }
  | { ok: false; traceId: string; reason: string; blocked: { pageKey: string; rules: string[] }[] };

export async function publishTheme(args: {
  userId: string;
  summary?: string;
}): Promise<PublishResult> {
  const traceId = `DS-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const client = await db();
  const themeId = await activeThemeId();
  const drafts = await listDrafts();

  const blocked: { pageKey: string; rules: string[] }[] = [];
  let globalTokens: DesignTokens = {};
  let meta: ThemeMeta = sanitizeMeta({});
  let globalRawCss = "";
  let globalSanitized = "";
  const pageTokens: Record<string, DesignTokens> = {};
  const pageCss: Record<string, string> = {};

  for (const draft of drafts) {
    const payload = (draft.design_tokens_json ?? {}) as {
      tokens?: Record<string, unknown>;
      meta?: unknown;
    };
    const { tokens } = sanitizeTokens(payload.tokens ?? {});
    const validation = validateCustomCss(draft.custom_css ?? "", draft.page_key);
    if (!validation.valid) {
      blocked.push({ pageKey: draft.page_key, rules: validation.blocked_rules });
      continue;
    }
    if (draft.page_key === "global") {
      globalTokens = tokens;
      meta = sanitizeMeta(payload.meta);
      globalRawCss = draft.custom_css ?? "";
      globalSanitized = validation.normalized_css;
    } else {
      if (Object.keys(tokens).length) pageTokens[draft.page_key] = tokens;
      if (validation.normalized_css) pageCss[draft.page_key] = validation.normalized_css;
    }
  }

  if (blocked.length) {
    await writeDesignAudit({
      userId: args.userId,
      action: "publish_blocked",
      pageKey: blocked[0]?.pageKey ?? null,
      after: { blocked, traceId },
      traceId,
    });
    return { ok: false, traceId, reason: "يحتوي CSS على قواعد محظورة — تم إيقاف النشر.", blocked };
  }

  const state = await getPublishState(false);

  try {
    const { data: last } = await client
      .from("design_versions")
      .select("version_number")
      .eq("theme_id", themeId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    const versionNumber = (last?.version_number ?? 0) + 1;

    const { data: version, error } = await client
      .from("design_versions")
      .insert({
        theme_id: themeId,
        version_number: versionNumber,
        scope: Object.keys(pageCss).length || Object.keys(pageTokens).length ? "mixed" : "global",
        page_key: "global",
        design_tokens_json: { tokens: globalTokens, meta },
        page_tokens_json: pageTokens,
        custom_css: globalRawCss,
        sanitized_css: globalSanitized,
        page_css_json: pageCss,
        status: "published",
        change_summary: args.summary ?? null,
        published_at: new Date().toISOString(),
        published_by: args.userId,
        created_by: args.userId,
      })
      .select("id, version_number")
      .single();
    if (error || !version) throw new Error(error?.message ?? "insert failed");

    const cacheVersion = (state.cache_version ?? 1) + 1;
    const { error: stateError } = await client
      .from("design_publish_state")
      .update({
        theme_id: themeId,
        active_version_id: version.id,
        previous_version_id: state.active_version_id,
        rollback_available: Boolean(state.active_version_id),
        rollback_used_at: null,
        rollback_used_by: null,
        cache_version: cacheVersion,
        last_published_at: new Date().toISOString(),
        last_published_by: args.userId,
      })
      .eq("id", state.id);
    if (stateError) throw new Error(stateError.message);

    invalidateThemeCache();
    await writeDesignAudit({
      userId: args.userId,
      action: "publish",
      pageKey: null,
      versionId: version.id,
      before: { active_version_id: state.active_version_id, cache_version: state.cache_version },
      after: {
        version_number: version.version_number,
        cache_version: cacheVersion,
        pages: Object.keys(pageCss),
      },
      traceId,
    });

    return { ok: true, versionNumber: version.version_number, cacheVersion };
  } catch (error) {
    await writeDesignAudit({
      userId: args.userId,
      action: "publish_failed",
      pageKey: null,
      after: { traceId, error: error instanceof Error ? error.message.slice(0, 200) : "unknown" },
      traceId,
    });
    return {
      ok: false,
      traceId,
      reason: "فشل النشر ولم يتغيّر التصميم النشط. حاول مرة أخرى.",
      blocked: [],
    };
  }
}

/* ------------------------------ الاسترجاع ------------------------------ */

export async function rollbackTheme(userId: string) {
  const client = await db();
  const state = await getPublishState(false);
  if (!state.rollback_available || !state.previous_version_id) {
    throw new Error("الاسترجاع غير متاح — يتطلب عملية نشر جديدة.");
  }
  const cacheVersion = (state.cache_version ?? 1) + 1;
  const { error } = await client
    .from("design_publish_state")
    .update({
      active_version_id: state.previous_version_id,
      previous_version_id: null,
      rollback_available: false,
      rollback_used_at: new Date().toISOString(),
      rollback_used_by: userId,
      cache_version: cacheVersion,
    })
    .eq("id", state.id)
    .eq("rollback_available", true);
  if (error) throw new Error("تعذّر تنفيذ الاسترجاع.");
  invalidateThemeCache();
  await writeDesignAudit({
    userId,
    action: "rollback",
    pageKey: null,
    versionId: state.previous_version_id,
    before: { active_version_id: state.active_version_id },
    after: { active_version_id: state.previous_version_id, cache_version: cacheVersion },
  });
  return { activeVersionId: state.previous_version_id, cacheVersion };
}

/* ---------------------------- حزمة CSS ---------------------------- */

export function buildCssBundle(version: VersionSnapshot | null): string {
  if (!version) return "/* mehla: default theme */\n";
  const payload = (version.design_tokens_json ?? {}) as { tokens?: DesignTokens; meta?: ThemeMeta };
  const tokens = payload.tokens ?? {};
  const parts: string[] = [];

  for (const link of fontLinks(tokens)) parts.push(`@import url("${link}");`);
  parts.push(`/* mehla theme v${version.version_number} */`);

  const globalCss = tokensToCss(tokens, ":root");
  if (globalCss) parts.push(globalCss);
  if (version.sanitized_css) parts.push(version.sanitized_css);

  for (const [pageKey, pageTokens] of Object.entries(version.page_tokens_json ?? {})) {
    const css = tokensToCss(pageTokens, `[data-page="${pageKey}"]`);
    if (css) parts.push(css);
  }
  for (const css of Object.values(version.page_css_json ?? {})) {
    if (css) parts.push(css);
  }

  return parts.join("\n");
}

/** حزمة CSS النشطة مع تخزين مؤقت بمفتاح الإصدار — لا استعلام قاعدة بيانات لكل طلب. */
export async function generateCssBundle(): Promise<{ css: string; cacheVersion: number }> {
  const state = await getPublishState();
  if (bundleCache && bundleCache.cacheVersion === state.cache_version) {
    return { css: bundleCache.css, cacheVersion: state.cache_version };
  }
  const active = await getActiveTheme();
  const css = buildCssBundle(active);
  bundleCache = { cacheVersion: state.cache_version, css, builtAt: Date.now() };
  return { css, cacheVersion: state.cache_version };
}

/** معاينة: حزمة مبنية من مسودة دون أي حفظ أو نشر. */
export function buildPreviewBundle(args: {
  pageKey: string;
  tokens: DesignTokens;
  sanitizedCss: string;
  globalTokens?: DesignTokens;
  globalCss?: string;
}): string {
  const parts: string[] = [];
  for (const link of fontLinks({ ...(args.globalTokens ?? {}), ...args.tokens }))
    parts.push(`@import url("${link}");`);
  if (args.globalTokens) {
    const css = tokensToCss(args.globalTokens, ":root");
    if (css) parts.push(css);
  }
  if (args.globalCss) parts.push(args.globalCss);
  if (args.pageKey === "global") {
    const css = tokensToCss(args.tokens, ":root");
    if (css) parts.push(css);
  } else {
    const css = tokensToCss(args.tokens, `[data-page="${args.pageKey}"]`);
    if (css) parts.push(css);
  }
  if (args.sanitizedCss) parts.push(args.sanitizedCss);
  return parts.join("\n");
}

/* ------------------------------ التدقيق ------------------------------ */

export async function writeDesignAudit(entry: {
  userId: string;
  action: string;
  pageKey?: string | null;
  versionId?: string | null;
  before?: unknown;
  after?: unknown;
  traceId?: string;
}) {
  const client = await db();
  let ip = "";
  let userAgent = "";
  let email: string | null = null;
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    const req = getRequest();
    ip =
      req.headers.get("cf-connecting-ip") ??
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "";
    userAgent = req.headers.get("user-agent") ?? "";
  } catch {
    /* لا سياق طلب */
  }
  try {
    const { data } = await client
      .from("platform_staff")
      .select("email")
      .eq("user_id", entry.userId)
      .maybeSingle();
    email = data?.email ?? null;
  } catch {
    email = null;
  }
  await client.from("design_audit_logs").insert({
    actor_id: entry.userId,
    actor_email: email,
    action: entry.action,
    page_key: entry.pageKey ?? null,
    version_id: entry.versionId ?? null,
    before_summary: entry.before ?? null,
    after_summary: entry.after ?? null,
    ip_address: ip.slice(0, 60),
    user_agent: userAgent.slice(0, 300),
    trace_id: entry.traceId ?? null,
  });
}
