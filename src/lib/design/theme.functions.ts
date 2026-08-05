/**
 * دوال خادم محرر تصميم المنصة — الوصول لمالك المنصة (super_admin) فقط.
 * أي مستخدم آخر يُرفض على الخادم قبل أي عملية.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PAGE_KEYS } from "./pages";

const pageKeySchema = z.string().refine((k) => PAGE_KEYS.includes(k), "مفتاح صفحة غير معروف");

const draftSchema = z.object({
  pageKey: pageKeySchema,
  tokens: z.record(z.string().max(80), z.string().max(240)),
  customCss: z.string().max(120_000),
  meta: z
    .object({ direction: z.enum(["rtl", "ltr"]), mode: z.enum(["light", "dark", "auto"]) })
    .partial()
    .optional(),
});

/** حرس مالك المنصة — يرفض الموظفين والمشتركين. */
async function requireOwner(supabase: unknown, userId: string) {
  const guard = await import("@/lib/admin-guard.server");
  const staff = await guard.requireStaff(supabase, userId, "design.manage");
  if (staff.role !== "super_admin") {
    throw new Error("محرر تصميم المنصة متاح لمالك المنصة فقط.");
  }
  return staff;
}

export const getDesignStudio = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireOwner(context.supabase, context.userId);
    const svc = await import("./theme.server");
    const [state, drafts, versions, audit, active] = await Promise.all([
      svc.getPublishState(false),
      svc.listDrafts(),
      svc.listVersions(30),
      svc.listAudit(40),
      svc.getActiveTheme(),
    ]);
    return {
      state,
      drafts,
      versions,
      audit,
      active: active
        ? {
            id: active.id,
            version_number: active.version_number,
            design_tokens_json: active.design_tokens_json,
            page_tokens_json: active.page_tokens_json,
            sanitized_css: active.sanitized_css,
            page_css_json: active.page_css_json,
            published_at: active.published_at,
          }
        : null,
    };
  });

export const saveDesignDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => draftSchema.parse(data))
  .handler(async ({ data, context }) => {
    await requireOwner(context.supabase, context.userId);
    const svc = await import("./theme.server");
    const validation = svc.validateDraft(data.pageKey, data.tokens, data.customCss);
    const result = await svc.saveDraft({
      pageKey: data.pageKey,
      tokens: data.tokens,
      customCss: data.customCss,
      meta: data.meta,
      userId: context.userId,
    });
    await svc.writeDesignAudit({
      userId: context.userId,
      action: "save_draft",
      pageKey: data.pageKey,
      after: { revision: result.revision, css_bytes: validation.css.size_bytes },
    });
    return { ...result, validation };
  });

export const validateDesignDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => draftSchema.parse(data))
  .handler(async ({ data, context }) => {
    await requireOwner(context.supabase, context.userId);
    const svc = await import("./theme.server");
    return svc.validateDraft(data.pageKey, data.tokens, data.customCss);
  });

/** حزمة معاينة — لا تُحفظ ولا تُنشر ولا تلمس التصميم النشط. */
export const previewDesignCss = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        pageKey: pageKeySchema,
        tokens: z.record(z.string().max(80), z.string().max(240)),
        customCss: z.string().max(120_000),
        globalTokens: z.record(z.string().max(80), z.string().max(240)).optional(),
        globalCss: z.string().max(120_000).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await requireOwner(context.supabase, context.userId);
    const svc = await import("./theme.server");
    const { sanitizeTokens } = await import("./tokens");
    const { validateCustomCss } = await import("./css-guard");
    const page = validateCustomCss(data.customCss, data.pageKey);
    const global = data.globalCss ? validateCustomCss(data.globalCss, "global") : null;
    const css = svc.buildPreviewBundle({
      pageKey: data.pageKey,
      tokens: sanitizeTokens(data.tokens).tokens,
      sanitizedCss: page.valid ? page.normalized_css : "",
      globalTokens: data.globalTokens ? sanitizeTokens(data.globalTokens).tokens : undefined,
      globalCss: global?.valid ? global.normalized_css : "",
    });
    return { css, validation: page };
  });

export const publishDesign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ summary: z.string().trim().max(300).optional(), draft: draftSchema.optional() })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await requireOwner(context.supabase, context.userId);
    const svc = await import("./theme.server");
    // «تطبيق ونشر» يحفظ آخر تعديل تلقائياً قبل النشر
    if (data.draft) {
      await svc.saveDraft({
        pageKey: data.draft.pageKey,
        tokens: data.draft.tokens,
        customCss: data.draft.customCss,
        meta: data.draft.meta,
        userId: context.userId,
      });
    }
    return svc.publishTheme({ userId: context.userId, summary: data.summary });
  });

export const rollbackDesign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireOwner(context.supabase, context.userId);
    const svc = await import("./theme.server");
    return svc.rollbackTheme(context.userId);
  });

export const resetDesignPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ pageKey: pageKeySchema }).parse(data))
  .handler(async ({ data, context }) => {
    await requireOwner(context.supabase, context.userId);
    const svc = await import("./theme.server");
    const result = await svc.resetPageTheme(data.pageKey, context.userId);
    await svc.writeDesignAudit({
      userId: context.userId,
      action: "reset_page",
      pageKey: data.pageKey,
    });
    return result;
  });

/** رقم نسخة التصميم النشط — عام، يُستخدم كمفتاح Cache في رابط حزمة CSS. */
export const getThemeCacheVersion = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const svc = await import("./theme.server");
    const state = await svc.getPublishState();
    return { cacheVersion: state.cache_version, hasTheme: Boolean(state.active_version_id) };
  } catch {
    return { cacheVersion: 0, hasTheme: false };
  }
});
