import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * استقبال الرسائل الواردة إلى صناديق المنصة.
 *
 * مسار عام بحكم البادئة، لذا يُتحقق من المُستدعي هنا عبر سر مشترك يُقارن
 * بطريقة ثابتة الزمن. الصندوق يجب أن يكون مُفعّلاً وميزة الاستقبال مُمكّنة،
 * وإلا تُرفض الرسالة (Fail-closed).
 */

const payloadSchema = z.object({
  to: z.string().email(),
  from: z.string().email(),
  fromName: z.string().max(120).nullish(),
  subject: z.string().max(500).nullish(),
  html: z.string().max(500_000).nullish(),
  text: z.string().max(500_000).nullish(),
  messageId: z.string().max(300).nullish(),
  inReplyTo: z.string().max(300).nullish(),
  references: z.array(z.string().max(300)).max(50).optional(),
  receivedAt: z.string().datetime().nullish(),
  attachments: z
    .array(
      z.object({
        file_name: z.string().max(260),
        mime_type: z.string().max(120),
        size_bytes: z.number().int().min(0).max(50 * 1024 * 1024),
        storage_path: z.string().max(500),
      }),
    )
    .max(20)
    .optional(),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function handle(request: Request) {
  const expected = process.env["EMAIL_INBOUND_SECRET"] ?? "";
  const provided = request.headers.get("x-mehla-inbound-secret") ?? "";
  if (!expected || !provided || !safeEqual(provided, expected)) {
    return json({ error: "unauthorized" }, 401);
  }

  let parsed: z.infer<typeof payloadSchema>;
  try {
    parsed = payloadSchema.parse(await request.json());
  } catch {
    return json({ error: "invalid_payload" }, 400);
  }

  try {
    const { ingestInbound } = await import("@/lib/email/workspace.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await ingestInbound(supabaseAdmin, {
      to: parsed.to,
      from: parsed.from,
      fromName: parsed.fromName ?? null,
      subject: parsed.subject ?? null,
      html: parsed.html ?? null,
      text: parsed.text ?? null,
      messageId: parsed.messageId ?? null,
      inReplyTo: parsed.inReplyTo ?? null,
      references: parsed.references ?? [],
      receivedAt: parsed.receivedAt ?? null,
      attachments: parsed.attachments ?? [],
    });
    return json({ success: true, thread_id: result.threadId });
  } catch (error) {
    console.error("[email-inbound]", error instanceof Error ? error.message : error);
    return json({ success: false, error: "ingest_failed" }, 422);
  }
}

export const Route = createFileRoute("/api/public/hooks/email-inbound")({
  server: { handlers: { POST: ({ request }) => handle(request) } },
});