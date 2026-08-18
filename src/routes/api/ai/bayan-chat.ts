/**
 * ==============================================================================
 * MEHLA LEGAL PLATFORM — BAYAN AI CHAT API ROUTE
 * مسار المحادثة الذكية مع المحامية بيان مع مصفوفة الصلاحيات (RBAC) وعزل القضايا
 * ==============================================================================
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  buildCaseContext,
  generateBayanResponse,
  checkCaseAccess,
} from "@/lib/ai/bayan-copilot.server";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/ai/bayan-chat")({
  server: {
    handlers: {
      // 1. جلب سجل محادثة القضية أو المحادثة العامة للمكتب
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const caseId = url.searchParams.get("caseId");
        const orgId = url.searchParams.get("orgId");
        const userId = url.searchParams.get("userId") || undefined;

        if (!orgId) {
          return json({ error: "معرف المنظمة مطلوب." }, 400);
        }

        try {
          // في حال كانت محادثة لقضية محددة
          if (caseId && caseId !== "global") {
            let { data: conversation } = await supabaseAdmin
              .from("case_ai_conversations")
              .select("id")
              .eq("case_id", caseId)
              .eq("organization_id", orgId)
              .maybeSingle();

            if (!conversation) {
              const { data: newConv } = await supabaseAdmin
                .from("case_ai_conversations")
                .insert({
                  case_id: caseId,
                  organization_id: orgId,
                  title: "استشارة مع المحامية بيان",
                })
                .select("id")
                .single();
              conversation = newConv;
            }

            if (!conversation) {
              return json({ messages: [] });
            }

            const { data: messages } = await supabaseAdmin
              .from("case_ai_messages")
              .select("id, sender, content, citations, created_at")
              .eq("conversation_id", conversation.id)
              .order("created_at", { ascending: true });

            return json({
              conversationId: conversation.id,
              messages: messages ?? [],
            });
          }

          // محادثة عامة على مستوى المكتب
          return json({
            conversationId: "global-session",
            messages: [],
          });
        } catch (err) {
          console.error("[Bayan Chat GET] Error:", err);
          return json({ error: "فشل استرجاع المحادثة" }, 500);
        }
      },

      // 2. إرسال استفسار للمحامية بيان واستلام الرد
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const { caseId, orgId, userId, message, conversationId } = body;

          if (!orgId || !message?.trim()) {
            return json({ error: "بيانات الاستفسار غير مكتملة." }, 400);
          }

          const isSpecificCase = Boolean(caseId && caseId !== "global");

          // 1. التحقق من مصفوفة الصلاحيات (RBAC)
          if (userId && isSpecificCase) {
            const access = await checkCaseAccess(userId, orgId, caseId);
            if (!access.allowed) {
              return json({
                ok: true,
                reply: access.reason || "عذراً زميلي الكريم، لستَ مخولاً بالاطلاع على بيانات هذه القضية وفق مصفوفة صلاحيات المكتب؛ حيث إن صلاحياتك مقتصرة على القضايا المسندة إليك فقط. يرجى مراجعة إدارة المكتب لمنحك الصلاحية.",
                citations: [],
              });
            }
          }

          // 2. التأكد من وجود جلسة المحادثة للقضية المحددة
          let activeConvId = conversationId;
          if (isSpecificCase && !activeConvId) {
            const { data: conv } = await supabaseAdmin
              .from("case_ai_conversations")
              .select("id")
              .eq("case_id", caseId)
              .eq("organization_id", orgId)
              .maybeSingle();

            if (conv) {
              activeConvId = conv.id;
            } else {
              const { data: newConv } = await supabaseAdmin
                .from("case_ai_conversations")
                .insert({
                  case_id: caseId,
                  organization_id: orgId,
                  title: `استشارة: ${message.slice(0, 40)}`,
                })
                .select("id")
                .single();
              activeConvId = newConv?.id;
            }
          }

          // 3. حفظ رسالة المستخدم في السجل للقضايا المحددة
          if (activeConvId && isSpecificCase) {
            await supabaseAdmin.from("case_ai_messages").insert({
              conversation_id: activeConvId,
              case_id: caseId,
              organization_id: orgId,
              sender: "user",
              content: message.trim(),
            });
          }

          // 4. جلب سياق القضية أو سياق المكتب الشامل
          const caseContext = await buildCaseContext(caseId, orgId, userId);

          // 5. جلب الرسائل السابقة لتغذية الذاكرة
          let previousMessages: Array<{ sender: "user" | "assistant"; content: string }> = [];
          if (activeConvId && isSpecificCase) {
            const { data: prev } = await supabaseAdmin
              .from("case_ai_messages")
              .select("sender, content")
              .eq("conversation_id", activeConvId)
              .order("created_at", { ascending: true })
              .limit(8);
            previousMessages = (prev ?? []) as Array<{ sender: "user" | "assistant"; content: string }>;
          }

          // 6. توليد استجابة المحامية بيان
          const response = await generateBayanResponse(message, previousMessages, caseContext);

          // 7. حفظ رد المحامية بيان في السجل
          if (activeConvId && isSpecificCase) {
            await supabaseAdmin.from("case_ai_messages").insert({
              conversation_id: activeConvId,
              case_id: caseId,
              organization_id: orgId,
              sender: "assistant",
              content: response.text,
              citations: JSON.parse(JSON.stringify(response.citations ?? [])),
            });
          }

          return json({
            ok: true,
            conversationId: activeConvId,
            reply: response.text,
            citations: response.citations,
          });
        } catch (err) {
          console.error("[Bayan Chat POST] Error:", err);
          return json(
            { error: err instanceof Error ? err.message : "فشل معالجة الاستشارة" },
            500,
          );
        }
      },
    },
  },
});
