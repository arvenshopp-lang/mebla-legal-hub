import type { Json } from "@/integrations/supabase/types";
/** إدارة مفاتيح تشغيل الميزات وقواعد الإشعارات — صلاحيات feature_flags.* و notification_rules.* لكل عملية. */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const guard = () => import("@/lib/admin-guard.server");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export type FeatureFlag = {
  id: string;
  key: string;
  label: string;
  description: string | null;
  is_enabled: boolean;
  audience: Json | null;
  updated_at: string;
};

export type NotificationRule = {
  id: string;
  topic: string;
  label: string;
  channel: string;
  target: string;
  template_key: string | null;
  is_enabled: boolean;
  updated_at: string;
};

export const listFeatureFlags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FeatureFlag[]> => {
    const g = await guard();
    await g.requireStaff(context.supabase, context.userId, "feature_flags.read");
    const { data, error } = await (context.supabase as AnyClient)
      .from("platform_feature_flags")
      .select("id, key, label, description, is_enabled, audience, updated_at")
      .order("key", { ascending: true });
    if (error) throw new Error("تعذّر قراءة مفاتيح التشغيل.");
    return (data ?? []) as FeatureFlag[];
  });

const flagSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  key: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9][a-z0-9_.]{2,59}$/,
      "المفتاح يقبل الحروف اللاتينية الصغيرة والأرقام والنقطة والشرطة السفلية فقط (٣-٦٠ حرفاً)",
    ),
  label: z.string().trim().min(2).max(160),
  description: z.string().trim().max(500).optional().nullable(),
  isEnabled: z.boolean().default(false),
});

export const saveFeatureFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => flagSchema.parse(input))
  .handler(async ({ data, context }) => {
    const g = await guard();
    const staff = await g.requireStaff(context.supabase, context.userId, "feature_flags.manage");
    const db = await g.admin();

    const { data: existing } = data.id
      ? await (db as AnyClient)
          .from("platform_feature_flags")
          .select("*")
          .eq("id", data.id)
          .maybeSingle()
      : { data: null };

    const payload = {
      key: data.key,
      label: data.label,
      description: data.description?.trim() || null,
      is_enabled: data.isEnabled,
      updated_by: staff.user_id,
    };
    const { data: saved, error } = existing
      ? await (db as AnyClient)
          .from("platform_feature_flags")
          .update(payload)
          .eq("id", existing.id)
          .select("id")
          .maybeSingle()
      : await (db as AnyClient)
          .from("platform_feature_flags")
          .insert(payload)
          .select("id")
          .maybeSingle();
    if (error) throw new Error("تعذّر حفظ مفتاح التشغيل — تأكد من عدم تكرار المفتاح.");

    await g.writeAudit(db, staff, {
      action: existing ? "feature_flag_updated" : "feature_flag_created",
      entity_type: "platform_feature_flags",
      entity_id: saved?.id ?? existing?.id ?? null,
      description: `${existing ? "تحديث" : "إنشاء"} مفتاح تشغيل «${data.key}».`,
      before: existing ?? null,
      after: payload,
    });
    return { id: (saved?.id ?? existing?.id) as string };
  });

export const deleteFeatureFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const g = await guard();
    const staff = await g.requireStaff(context.supabase, context.userId, "feature_flags.manage");
    const db = await g.admin();
    const { data: existing } = await (db as AnyClient)
      .from("platform_feature_flags")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!existing) throw new Error("هذا المفتاح غير موجود.");
    const { error } = await (db as AnyClient)
      .from("platform_feature_flags")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error("تعذّر حذف المفتاح.");
    await g.writeAudit(db, staff, {
      action: "feature_flag_deleted",
      entity_type: "platform_feature_flags",
      entity_id: data.id,
      description: `حذف مفتاح تشغيل «${existing.key}».`,
      before: existing,
    });
    return { ok: true };
  });

export const listNotificationRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<NotificationRule[]> => {
    const g = await guard();
    await g.requireStaff(context.supabase, context.userId, "notification_rules.read");
    const { data, error } = await (context.supabase as AnyClient)
      .from("platform_notification_rules")
      .select("id, topic, label, channel, target, template_key, is_enabled, updated_at")
      .order("topic", { ascending: true });
    if (error) throw new Error("تعذّر قراءة قواعد الإشعارات.");
    return (data ?? []) as NotificationRule[];
  });

const ruleSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  topic: z
    .string()
    .trim()
    .regex(
      /^[a-z0-9_.*]{3,80}$/,
      "الموضوع يجب أن يكون بحروف لاتينية صغيرة وأرقاماً ونقاطاً فقط (3-80 حرفاً).",
    ),
  label: z.string().trim().min(2).max(160),
  channel: z.enum(["email", "sms", "in_app"]),
  target: z.string().trim().min(2).max(200),
  templateKey: z.string().trim().max(120).optional().nullable(),
  isEnabled: z.boolean().default(true),
});

export const saveNotificationRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ruleSchema.parse(input))
  .handler(async ({ data, context }) => {
    const g = await guard();
    const staff = await g.requireStaff(
      context.supabase,
      context.userId,
      "notification_rules.manage",
    );
    const db = await g.admin();

    const { data: existing } = data.id
      ? await (db as AnyClient)
          .from("platform_notification_rules")
          .select("*")
          .eq("id", data.id)
          .maybeSingle()
      : { data: null };

    const payload = {
      topic: data.topic,
      label: data.label,
      channel: data.channel,
      target: data.target,
      template_key: data.templateKey?.trim() || null,
      is_enabled: data.isEnabled,
      created_by: staff.user_id,
    };
    const { data: saved, error } = existing
      ? await (db as AnyClient)
          .from("platform_notification_rules")
          .update(payload)
          .eq("id", existing.id)
          .select("id")
          .maybeSingle()
      : await (db as AnyClient)
          .from("platform_notification_rules")
          .insert(payload)
          .select("id")
          .maybeSingle();
    if (error) throw new Error("تعذّر حفظ قاعدة الإشعار.");

    await g.writeAudit(db, staff, {
      action: existing ? "notification_rule_updated" : "notification_rule_created",
      entity_type: "platform_notification_rules",
      entity_id: saved?.id ?? existing?.id ?? null,
      description: `${existing ? "تحديث" : "إنشاء"} قاعدة إشعار «${data.topic}».`,
      before: existing ?? null,
      after: payload,
    });
    return { id: (saved?.id ?? existing?.id) as string };
  });

export const deleteNotificationRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const g = await guard();
    const staff = await g.requireStaff(
      context.supabase,
      context.userId,
      "notification_rules.manage",
    );
    const db = await g.admin();
    const { data: existing } = await (db as AnyClient)
      .from("platform_notification_rules")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!existing) throw new Error("هذه القاعدة غير موجودة.");
    const { error } = await (db as AnyClient)
      .from("platform_notification_rules")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error("تعذّر حذف القاعدة.");
    await g.writeAudit(db, staff, {
      action: "notification_rule_deleted",
      entity_type: "platform_notification_rules",
      entity_id: data.id,
      description: `حذف قاعدة إشعار «${existing.topic}».`,
      before: existing,
    });
    return { ok: true };
  });
