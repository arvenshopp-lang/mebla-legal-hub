/**
 * حالة تكاملات المكتب — قراءة فقط، ولا تُعيد أي أسرار أو بيانات مزوّد حساسة.
 * كل استدعاء يتحقق أولاً من عضوية المستخدم في المكتب المطلوب على الخادم.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Db = SupabaseClient<Database>;

export type WhatsAppChannelStatus = {
  /** جاهز فعلياً للإرسال: مفعّل + متصل + جهاز معتمد + قالب واحد على الأقل. */
  ready: boolean;
  statusLabel: string;
  reason: string | null;
  devicesCount: number;
  templatesCount: number;
  lastCheckedAt: string | null;
};

export async function requireOrgMembership(db: Db, organizationId: string, userId: string) {
  const { data, error } = await db
    .from("organization_members")
    .select("role, status")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("تعذّر التحقق من صلاحيتك على هذا المكتب.");
  if (!data || (data.status && data.status !== "active")) {
    throw new Error("لا تملك صلاحية الوصول إلى تكاملات هذا المكتب.");
  }
  return data;
}

export async function readWhatsAppChannelStatus(): Promise<WhatsAppChannelStatus> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { WHATSAPP_PROVIDER } = await import("@/lib/notifications/notifications.shared");
  const { data } = await supabaseAdmin
    .from("whatsapp_provider_state")
    .select("is_enabled, status, devices_count, templates_count, default_device_id, last_checked_at")
    .eq("provider", WHATSAPP_PROVIDER)
    .maybeSingle();

  const devicesCount = data?.devices_count ?? 0;
  const templatesCount = data?.templates_count ?? 0;
  const connected = data?.status === "connected";
  const enabled = Boolean(data?.is_enabled);
  const hasDevice = Boolean(data?.default_device_id);
  const ready = enabled && connected && hasDevice && templatesCount > 0;

  let reason: string | null = null;
  if (!data) reason = "قناة الواتساب الرسمية غير مهيأة على مستوى المنصة بعد.";
  else if (!enabled) reason = "القناة معطّلة حالياً من إدارة المنصة.";
  else if (!connected)
    reason =
      data.status === "failed"
        ? "فحص الاتصال بمزوّد الواتساب فاشل حالياً."
        : "لم يكتمل التحقق من الاتصال بمزوّد الواتساب.";
  else if (!hasDevice) reason = "لا يوجد رقم إرسال معتمد للقناة.";
  else if (templatesCount === 0) reason = "لا يوجد قالب رسائل رسمي معتمد بعد.";

  const statusLabel = ready
    ? "متصلة وجاهزة"
    : !data || !enabled
      ? "غير مفعّلة"
      : data.status === "failed"
        ? "اتصال متعطّل"
        : "قيد التهيئة";

  return { ready, statusLabel, reason, devicesCount, templatesCount, lastCheckedAt: data?.last_checked_at ?? null };
}
