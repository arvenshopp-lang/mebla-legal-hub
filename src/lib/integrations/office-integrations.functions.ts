import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** حالة قنوات التكامل المتاحة للمكتب — تُفرض العضوية على الخادم. */
export const getOfficeIntegrationsStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ organizationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const engine = await import("./office-integrations.server");
    await engine.requireOrgMembership(context.supabase, data.organizationId, context.userId);
    const whatsapp = await engine.readWhatsAppChannelStatus();
    return { whatsapp };
  });
