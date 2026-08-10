/**
 * دوال خادم محرر تصميم المنصة — الوصول لمالك المنصة (super_admin) فقط.
 * أي مستخدم آخر يُرفض على الخادم قبل أي عملية.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AdminPermission } from "@/lib/admin-permissions";
import type { Database } from "@/integrations/supabase/types";
import { PAGE_KEYS } from "./pages";

const pageKeySchema = z.string().refine((k) => PAGE_KEYS.includes(k), "مفتاح صفحة غير معروف");

const draftSchema = z.object({
  pageKey: pageKeySchema,
  tokens: z.record(z.string().max(80), z.string().max(240)),
  customCss: z.string().max(120_000),
  expectedRevision: z.number().int().min(0).optional(),
  meta: z
    .object({ direction: z.enum(["rtl", "ltr"]), mode: z.enum(["light", "dark", "auto"]) })
    .partial()
    .optional(),
});

/**
 * حرس عمليات التصميم — تحقق خادمي لكل عملية بصلاحيتها الدقيقة.
 * مالك المنصة (super_admin) غير مقيّد؛ وأي موظف آخر يحتاج الصلاحية الصريحة.
 * إخفاء الأزرار في الواجهة ليس حماية: المنع الحقيقي هنا.
 */
async function requireDesign(
  supabase: SupabaseClient<Database>,
  userId: string,
  permission: AdminPermission,
) {
  const guard = await import("@/lib/admin-guard.server");
  return guard.requireStaff(supabase, userId, permission);
}

export const getDesignStudio = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const staff = await requireDesign(context.supabase, context.userId, "design.read");
    const { hasPermission } = await import("@/lib/admin-permissions");
    const canHistory = hasPermission(
      { role: staff.role, permissions: staff.permissions, rolePermissions: staff.platform_roles?.permissions ?? null },
      "design.history.read",
    );
    const canPublish = hasPermission(
      { role: staff.role, permissions: staff.permissions, rolePermissions: staff.platform_roles?.permissions ?? null },
      "design.publish",
    );
    const canRollback = hasPermission(
      { role: staff.role, permissions: staff.permissions, rolePermissions: staff.platform_roles?.permissions ?? null },
      "design.rollback",
    );
    const canDraft = hasPermission(
      { role: staff.role, permissions: staff.permissions, rolePermissions: staff.platform_roles?.permissions ?? null },
      "design.draft.write",
    );
    const svc = await import("./theme.server");
    const [state, drafts, versions, audit, active] = await Promise.all([
      svc.getPublishState(false),
      svc.listDrafts(),
      canHistory ? svc.listVersions(30) : Promise.resolve([]),
      canHistory ? svc.listAudit(40) : Promise.resolve([]),
      svc.getActiveTheme(),
    ]);
    return {
      state,
      drafts,
      versions,
      audit,
      // الصلاحيات الفعلية للمستخدم — تُستخدم لتعطيل الأزرار فقط، والمنع الحقيقي على الخادم.
      can: { draft: canDraft, history: canHistory, publish: canPublish, rollback: canRollback },
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
    await requireDesign(context.supabase, context.userId, "design.draft.write");
    const svc = await import("./theme.server");
    const validation = svc.validateDraft(data.pageKey, data.tokens, data.customCss);
    const result = await svc.saveDraft({
      pageKey: data.pageKey,
      tokens: data.tokens,
      customCss: data.customCss,
      meta: data.meta,
      userId: context.userId,
      expectedRevision: data.expectedRevision,
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
    await requireDesign(context.supabase, context.userId, "design.draft.write");
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
    await requireDesign(context.supabase, context.userId, "design.preview");
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
    await requireDesign(context.supabase, context.userId, "design.publish");
    const svc = await import("./theme.server");
    // «تطبيق ونشر» يحفظ آخر تعديل تلقائياً قبل النشر
    if (data.draft) {
      await svc.saveDraft({
        pageKey: data.draft.pageKey,
        tokens: data.draft.tokens,
        customCss: data.draft.customCss,
        meta: data.draft.meta,
        userId: context.userId,
        expectedRevision: data.draft.expectedRevision,
      });
    }
    return svc.publishTheme({ userId: context.userId, summary: data.summary });
  });

/** استعادة إصدار محدد من السجل — تُنشئ إصداراً جديداً ولا تحذف التاريخ. */
export const restoreDesignVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ versionId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await requireDesign(context.supabase, context.userId, "design.rollback");
    const svc = await import("./theme.server");
    return svc.restoreVersion(data.versionId, context.userId);
  });

export const rollbackDesign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireDesign(context.supabase, context.userId, "design.rollback");
    const svc = await import("./theme.server");
    return svc.rollbackTheme(context.userId);
  });

export const resetDesignPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ pageKey: pageKeySchema }).parse(data))
  .handler(async ({ data, context }) => {
    await requireDesign(context.supabase, context.userId, "design.draft.write");
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
