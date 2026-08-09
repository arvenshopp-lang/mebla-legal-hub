/**
 * دوال خادم صفحة جاهزية المزوّدين — كل عملية تتحقق من الصلاحية على الخادم.
 * لا تُعيد أي دالة هنا قيمة سرّية؛ فقط حضور الحقول وتلميحات مقنّعة ونتائج فحص آمنة.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const verifySchema = z.object({
  domain: z.enum(["payment", "otp", "whatsapp"]),
  key: z.string().trim().min(1).max(120),
});

export const getProvidersReadiness = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const guard = await import("@/lib/admin-guard.server");
    const staff = await guard.requireActiveStaff(context.supabase, context.userId);
    const engine = await import("./readiness.server");
    return engine.buildReadinessOverview(context.supabase, staff);
  });

export const verifyProviderConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => verifySchema.parse(data))
  .handler(async ({ data, context }) => {
    const guard = await import("@/lib/admin-guard.server");
    const staff = await guard.requireActiveStaff(context.supabase, context.userId);
    const engine = await import("./readiness.server");
    try {
      return await engine.verifyProviderConnection(context.supabase, staff, data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      throw new Error(
        /[\u0600-\u06FF]/.test(message) ? message : "تعذّر تنفيذ فحص الاتصال بالمزوّد.",
      );
    }
  });
