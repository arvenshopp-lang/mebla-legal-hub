/**
 * دوال بيانات التواصل والظهور العام.
 * القراءة عامة (بيانات معدّة للنشر فقط)، والتعديل محصور بمدير المنصة عبر تحقق خادمي.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicSiteSchema, PUBLIC_SITE_SETTINGS_KEY } from "@/lib/public-site.shared";

export const getPublicSiteInfo = createServerFn({ method: "GET" }).handler(async () => {
  const { readPublicSiteInfo } = await import("@/lib/public-site.server");
  return await readPublicSiteInfo();
});

export const savePublicSiteInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => publicSiteSchema.parse(input))
  .handler(async ({ data, context }) => {
    const g = await import("@/lib/admin-guard.server");
    const staff = await g.requireStaff(context.supabase, context.userId, "platform_settings.manage");
    const db = await g.admin();

    const { data: beforeRow } = await db
      .from("platform_settings")
      .select("value")
      .eq("key", PUBLIC_SITE_SETTINGS_KEY)
      .maybeSingle();

    const { error } = await db.from("platform_settings").upsert(
      {
        key: PUBLIC_SITE_SETTINGS_KEY,
        value: data as never,
        is_public: true,
        updated_by: staff.user_id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
    if (error) throw new Error("تعذّر حفظ بيانات التواصل والظهور العام.");

    await g.writeAudit(db, staff, {
      action: "settings.public_site.update",
      entity_type: "platform_settings",
      entity_id: PUBLIC_SITE_SETTINGS_KEY,
      description: "تحديث بيانات التواصل والظهور العام",
      before: (beforeRow as { value?: unknown } | null)?.value ?? null,
      after: data,
    });

    return { ok: true as const };
  });