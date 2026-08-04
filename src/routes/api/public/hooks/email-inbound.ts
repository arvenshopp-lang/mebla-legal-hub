import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * استقبال الرسائل الواردة إلى صناديق المنصة.
 *
 * المسار عام بحكم البادئة، فكل طبقات الحماية تُفرض هنا وبترتيب صريح:
 *  1) Rate Limiting على مستوى المشروع (نافذة دقيقة واحدة).
 *  2) التحقق من المُستدعي: توقيع HMAC-SHA256 إن كان مفتاح التوقيع مضبوطاً،
 *     وإلا سر مشترك — والمقارنة ثابتة الزمن في الحالتين (Fail-closed دائماً).
 *  3) Replay Protection عبر طابع زمني بنافذة 5 دقائق + بصمة الحمولة.
 *  4) Idempotency عبر معرّف الرسالة عند المزوّد: لا تُنشأ الرسالة نفسها مرتين.
 *  5) تنقية HTML وحجب الصور الخارجية داخل طبقة الاستيعاب.
 *  6) تسجيل كل استدعاء في `email_inbound_events` مع إخفاء البيانات الحساسة.
 *
 * ملاحظة معلنة: مزوّد البريد المُدار الحالي **صادر فقط**؛ هذا المسار جاهز تقنياً
 * ومُختبر بمحاكاة موقّعة، ولا يستقبل بريداً حقيقياً حتى ربط مزوّد وارد.
 */

const REPLAY_WINDOW_SECONDS = 300;
const RATE_LIMIT_PER_MINUTE = 60;
const MAX_BODY_BYTES = 30 * 1024 * 1024;

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
        file_name: z.string().min(1).max(260),
        content_base64: z
          .string()
          .min(4)
          .max(14 * 1024 * 1024),
      }),
    )
    .max(10)
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

async function hmacHex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function clientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    ""
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

async function logEvent(
  db: Db,
  entry: {
    providerMessageId?: string | null;
    payloadHash: string;
    recipient?: string | null;
    senderHint?: string | null;
    signatureMode: string;
    requestIp: string;
    outcome: string;
    rejectReason?: string | null;
    threadId?: string | null;
    messageRowId?: string | null;
    accepted?: number;
    rejected?: number;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await db.from("email_inbound_events").insert({
      provider: "webhook",
      provider_message_id: entry.outcome === "accepted" ? (entry.providerMessageId ?? null) : null,
      payload_hash: entry.payloadHash,
      recipient: entry.recipient ?? null,
      sender_hint: entry.senderHint ?? null,
      signature_mode: entry.signatureMode,
      request_ip: entry.requestIp,
      outcome: entry.outcome,
      reject_reason: entry.rejectReason ?? null,
      thread_id: entry.threadId ?? null,
      message_row_id: entry.messageRowId ?? null,
      attachments_accepted: entry.accepted ?? 0,
      attachments_rejected: entry.rejected ?? 0,
      metadata: entry.metadata ?? {},
    });
  } catch (error) {
    console.error("[email-inbound] audit", error instanceof Error ? error.message : error);
  }
}

async function handle(request: Request) {
  const ip = clientIp(request);
  const signingKey = process.env["EMAIL_INBOUND_SIGNING_KEY"] ?? "";
  const sharedSecret = process.env["EMAIL_INBOUND_SECRET"] ?? "";
  const mode = signingKey ? "hmac_sha256" : "shared_secret";

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: "payload_too_large" }, 413);
  const payloadHash = await sha256Hex(raw);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as Db;

  /* 1) Rate Limiting */
  const windowStart = new Date(Date.now() - 60_000).toISOString();
  const { count: recent } = await db
    .from("email_inbound_events")
    .select("id", { count: "exact", head: true })
    .gte("created_at", windowStart);
  if ((recent ?? 0) >= RATE_LIMIT_PER_MINUTE) {
    await logEvent(db, {
      payloadHash,
      signatureMode: mode,
      requestIp: ip,
      outcome: "rate_limited",
      rejectReason: "تجاوز حد الاستدعاءات",
    });
    return json({ error: "rate_limited" }, 429);
  }

  /* 2) التحقق من المُستدعي */
  const timestampHeader = request.headers.get("x-mehla-timestamp") ?? "";
  if (signingKey) {
    const signature = (request.headers.get("x-mehla-signature") ?? "")
      .replace(/^sha256=/i, "")
      .toLowerCase();
    const ts = Number(timestampHeader);
    if (!signature || !Number.isFinite(ts)) {
      await logEvent(db, {
        payloadHash,
        signatureMode: mode,
        requestIp: ip,
        outcome: "unauthorized",
        rejectReason: "توقيع أو طابع زمني مفقود",
      });
      return json({ error: "unauthorized" }, 401);
    }
    /* 3) Replay Protection */
    if (Math.abs(Date.now() / 1000 - ts) > REPLAY_WINDOW_SECONDS) {
      await logEvent(db, {
        payloadHash,
        signatureMode: mode,
        requestIp: ip,
        outcome: "replayed",
        rejectReason: "طابع زمني خارج النافذة",
      });
      return json({ error: "stale_timestamp" }, 401);
    }
    const expected = await hmacHex(signingKey, `${timestampHeader}.${raw}`);
    if (!safeEqual(signature, expected)) {
      await logEvent(db, {
        payloadHash,
        signatureMode: mode,
        requestIp: ip,
        outcome: "unauthorized",
        rejectReason: "توقيع غير مطابق",
      });
      return json({ error: "unauthorized" }, 401);
    }
  } else {
    const provided = request.headers.get("x-mehla-inbound-secret") ?? "";
    if (!sharedSecret || !provided || !safeEqual(provided, sharedSecret)) {
      await logEvent(db, {
        payloadHash,
        signatureMode: mode,
        requestIp: ip,
        outcome: "unauthorized",
        rejectReason: "سر مشترك غير مطابق",
      });
      return json({ error: "unauthorized" }, 401);
    }
  }

  /* 3-ب) إعادة إرسال نفس الحمولة الحرفية خلال نافذة قصيرة */
  const { data: replayRows } = await db
    .from("email_inbound_events")
    .select("id")
    .eq("payload_hash", payloadHash)
    .eq("outcome", "accepted")
    .gte("created_at", new Date(Date.now() - REPLAY_WINDOW_SECONDS * 1000).toISOString())
    .limit(1);
  if (((replayRows ?? []) as unknown[]).length > 0) {
    await logEvent(db, {
      payloadHash,
      signatureMode: mode,
      requestIp: ip,
      outcome: "duplicate",
      rejectReason: "حمولة مكررة داخل نافذة الحماية",
    });
    return json({ success: true, duplicate: true });
  }

  let parsed: z.infer<typeof payloadSchema>;
  try {
    parsed = payloadSchema.parse(JSON.parse(raw));
  } catch {
    await logEvent(db, {
      payloadHash,
      signatureMode: mode,
      requestIp: ip,
      outcome: "rejected",
      rejectReason: "حمولة غير صحيحة",
    });
    return json({ error: "invalid_payload" }, 400);
  }

  const { maskAddress, redactPayload } = await import("@/lib/email/sanitize.shared");

  try {
    const { ingestInbound } = await import("@/lib/email/workspace.server");
    const result = await ingestInbound(db, {
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

    await logEvent(db, {
      providerMessageId: parsed.messageId ?? null,
      payloadHash,
      recipient: parsed.to,
      senderHint: maskAddress(parsed.from),
      signatureMode: mode,
      requestIp: ip,
      outcome: result.duplicate ? "duplicate" : "accepted",
      threadId: result.threadId,
      messageRowId: result.messageId,
      accepted: result.attachmentsAccepted,
      rejected: result.attachmentsRejected,
      metadata: {
        blocked_remote_images: result.blockedImages,
        had_active_content: result.hadActiveContent,
        rejected_attachments: result.rejectedAttachments,
      },
    });

    // ربط مركز الدعم: صناديق الدعم تُولّد تذكرة أو تُضيف رداً إلى تذكرة قائمة.
    // فشل الربط لا يُبطل استيعاب البريد — يُسجَّل ويُعاد للمزوّد نجاح الاستقبال.
    let ticket: { outcome: string; ticket_number: string | null } | null = null;
    try {
      const { linkInboundToTicket } = await import("@/lib/support/ingest.server");
      const linked = await linkInboundToTicket(db, {
        mailboxId: result.mailboxId,
        threadId: result.threadId,
        emailMessageId: result.messageId,
        recipient: parsed.to,
        from: parsed.from,
        fromName: parsed.fromName ?? null,
        subject: parsed.subject ?? null,
        body: (parsed.text ?? parsed.html ?? "").slice(0, 20_000),
        providerMessageId: parsed.messageId ?? null,
        duplicate: result.duplicate,
      });
      ticket = { outcome: linked.outcome, ticket_number: linked.ticketNumber };
    } catch (error) {
      console.error("[email-inbound] support-link", error instanceof Error ? error.message : error);
    }

    return json({
      success: true,
      duplicate: result.duplicate,
      thread_id: result.threadId,
      attachments_accepted: result.attachmentsAccepted,
      attachments_rejected: result.attachmentsRejected,
      ticket,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "تعذّر الاستيعاب";
    await logEvent(db, {
      payloadHash,
      recipient: parsed.to,
      senderHint: maskAddress(parsed.from),
      signatureMode: mode,
      requestIp: ip,
      outcome: "rejected",
      rejectReason: reason,
      metadata: {
        payload: redactPayload({ subject: parsed.subject, references: parsed.references }),
      },
    });
    console.error("[email-inbound]", reason);
    return json({ success: false, error: "ingest_failed", reason }, 422);
  }
}

export const Route = createFileRoute("/api/public/hooks/email-inbound")({
  server: { handlers: { POST: ({ request }) => handle(request) } },
});
