/**
 * ==============================================================================
 * MEHLA — BAYAN AI CHAT SERVER LOGIC
 * كل الفحوص الأمنية تُنفَّذ هنا قبل أي وصول للبيانات أو أي نداء لمزود الذكاء:
 * 1) عضوية نشطة في المكتب (كهوية المستخدم عبر RLS)
 * 2) استحقاق ميزة المساعد الذكي في الباقة
 * 3) مصفوفة صلاحيات القضية
 * ==============================================================================
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { assertEntitlement } from "@/lib/subscription.server";
import { buildCaseContext, checkCaseAccess, generateBayanResponse } from "./bayan-copilot.server";

type Client = SupabaseClient<Database>;

export type BayanCitationRecord = {
  sourceType: "statute" | "document" | "hearing" | "precedent";
  title: string;
  reference?: string;
};

export type BayanStoredMessage = {
  id: string;
  sender: "user" | "assistant";
  content: string;
  citations: BayanCitationRecord[];
  created_at: string;
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/**
 * بوابة الوصول الموحدة. ترمي خطأً عربياً واضحاً عند أي إخلال، ولا تكشف
 * وجود أو غياب بيانات مكتب لا ينتمي إليه المستخدم.
 */
export async function requireBayanAccess(
  supabase: Client,
  userId: string,
  organizationId: string,
  caseId: string | null,
): Promise<void> {
  const { data: membership, error } = await supabase
    .from("organization_members")
    .select("role, status")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error("تعذّر التحقق من صلاحيتك على هذا المكتب.");
  if (!membership || membership.status !== "active") {
    throw new Error("لا تملك صلاحية الوصول إلى بيانات هذا المكتب.");
  }

  await assertEntitlement(supabase, organizationId, {
    feature: "ai_enabled",
    requireLive: true,
  });

  const access = await checkCaseAccess(userId, organizationId, caseId);
  if (!access.allowed) {
    throw new Error(access.reason ?? "لا تملك صلاحية الاطلاع على بيانات هذه القضية.");
  }
}

/** يُستدعى فقط بعد اجتياز requireBayanAccess. */
export async function loadConversation(
  organizationId: string,
  caseId: string | null,
): Promise<{ conversationId: string | null; messages: BayanStoredMessage[] }> {
  if (!caseId) return { conversationId: null, messages: [] };

  const db = await admin();
  const conversationId = await ensureConversation(organizationId, caseId, null);
  if (!conversationId) return { conversationId: null, messages: [] };

  const { data: messages } = await db
    .from("case_ai_messages")
    .select("id, sender, content, citations, created_at")
    .eq("conversation_id", conversationId)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  const rows = (messages ?? []).map((m) => ({
    id: m.id,
    sender: m.sender as "user" | "assistant",
    content: m.content,
    citations: (Array.isArray(m.citations) ? m.citations : []) as unknown as BayanCitationRecord[],
    created_at: m.created_at,
  }));

  return { conversationId, messages: rows };
}

async function ensureConversation(
  organizationId: string,
  caseId: string,
  title: string | null,
): Promise<string | null> {
  const db = await admin();
  const { data: existing } = await db
    .from("case_ai_conversations")
    .select("id")
    .eq("case_id", caseId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: created } = await db
    .from("case_ai_conversations")
    .insert({
      case_id: caseId,
      organization_id: organizationId,
      title: title ?? "استشارة مع المحامية بيان",
    })
    .select("id")
    .single();
  return created?.id ?? null;
}

/** يُستدعى فقط بعد اجتياز requireBayanAccess. */
export async function runBayanTurn(input: {
  organizationId: string;
  caseId: string | null;
  conversationId: string | null;
  message: string;
  userId: string;
}): Promise<{
  conversationId: string | null;
  reply: string;
  citations: BayanCitationRecord[];
}> {
  const { organizationId, caseId, message, userId } = input;
  const db = await admin();

  let conversationId: string | null = null;
  if (caseId) {
    conversationId =
      input.conversationId ??
      (await ensureConversation(organizationId, caseId, `استشارة: ${message.slice(0, 40)}`));
  }

  if (conversationId && caseId) {
    await db.from("case_ai_messages").insert({
      conversation_id: conversationId,
      case_id: caseId,
      organization_id: organizationId,
      sender: "user",
      content: message,
    });
  }

  const caseContext = await buildCaseContext(caseId ?? "global", organizationId, userId);

  let previousMessages: Array<{ sender: "user" | "assistant"; content: string }> = [];
  if (conversationId && caseId) {
    const { data: prev } = await db
      .from("case_ai_messages")
      .select("sender, content")
      .eq("conversation_id", conversationId)
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true })
      .limit(8);
    previousMessages = (prev ?? []) as Array<{ sender: "user" | "assistant"; content: string }>;
  }

  const response = await generateBayanResponse(message, previousMessages, caseContext);
  const citations = (response.citations ?? []) as BayanCitationRecord[];

  if (conversationId && caseId) {
    await db.from("case_ai_messages").insert({
      conversation_id: conversationId,
      case_id: caseId,
      organization_id: organizationId,
      sender: "assistant",
      content: response.text,
      citations: JSON.parse(JSON.stringify(citations)),
    });
  }

  return { conversationId, reply: response.text, citations };
}
