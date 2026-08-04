import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { INVITE_TOKEN_MAX, INVITE_TOKEN_MIN } from "./invitations.shared";

const tokenSchema = z.object({
  token: z
    .string()
    .min(INVITE_TOKEN_MIN)
    .max(INVITE_TOKEN_MAX)
    .regex(/^[A-Za-z0-9_-]+$/),
});

/** معاينة عامة: لا تكشف البريد كاملاً ولا أي معرفات داخلية. */
export const getInvitation = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => tokenSchema.parse(d))
  .handler(async ({ data }) => {
    const { previewInvitation } = await import("./invitations.server");
    return previewInvitation(data.token);
  });

/** قبول الدعوة: الهوية تُشتق من التوكن الموثّق وليس من بيانات الطلب. */
export const joinOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => tokenSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { acceptInvitation } = await import("./invitations.server");
    const email = (context.claims as { email?: string } | null)?.email ?? null;
    return acceptInvitation(data.token, context.userId, email);
  });
