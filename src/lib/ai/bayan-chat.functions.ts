/**
 * ==============================================================================
 * MEHLA — BAYAN AI CHAT SERVER FUNCTIONS
 * دوال خادمية مصادَقة للمحامية بيان: هوية المستخدم من التوكن، عضوية المكتب من
 * قاعدة البيانات، بوابة استحقاق الباقة (ai_enabled)، ثم مصفوفة صلاحيات القضية.
 * ==============================================================================
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const caseScope = z
  .union([z.literal("global"), z.string().uuid()])
  .nullish()
  .transform((v) => (v && v !== "global" ? v : null));

const conversationInput = z.object({
  organizationId: z.string().uuid(),
  caseId: caseScope,
});

const messageInput = z.object({
  organizationId: z.string().uuid(),
  caseId: caseScope,
  conversationId: z.string().uuid().nullish(),
  message: z.string().trim().min(2, "الاستفسار قصير جداً.").max(4000, "الاستفسار طويل جداً."),
});

export type BayanCitation = {
  sourceType: "statute" | "document" | "hearing" | "precedent";
  title: string;
  reference?: string;
};

export type BayanMessage = {
  id?: string;
  sender: "user" | "assistant";
  content: string;
  citations?: BayanCitation[];
  created_at?: string;
};

export const getBayanConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => conversationInput.parse(input))
  .handler(async ({ data, context }) => {
    const { requireBayanAccess, loadConversation } = await import("./bayan-chat.server");
    await requireBayanAccess(context.supabase, context.userId, data.organizationId, data.caseId);
    return loadConversation(data.organizationId, data.caseId);
  });

export const sendBayanMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => messageInput.parse(input))
  .handler(async ({ data, context }) => {
    const { requireBayanAccess, runBayanTurn } = await import("./bayan-chat.server");
    await requireBayanAccess(context.supabase, context.userId, data.organizationId, data.caseId);
    return runBayanTurn({
      organizationId: data.organizationId,
      caseId: data.caseId,
      conversationId: data.conversationId ?? null,
      message: data.message,
      userId: context.userId,
    });
  });
