/**
 * مسار اختبار مؤقت لإرسال رسالة نظام واحدة عبر نقل Resend HTTP القائم.
 *
 * كل محتوى الرسالة ثابت خادمياً: المستلم والمُرسل وعنوان الرد والموضوع والنص
 * لا يمكن تجاوزها من المتصل، والجسم/الاستعلام يُهمل تماماً. لا قاعدة بيانات،
 * ولا طابور، ولا سجل، ولا إعادة محاولة: طلب واحد = محاولة إرسال واحدة كحد أقصى.
 * التوثيق بسر التشغيل الدوري وحده، والاستجابة معادن آمنة فقط.
 */
import { createFileRoute } from "@tanstack/react-router";
import { guardCronRequest } from "@/lib/security/cron-auth.server";

/** الحمولة المعتمدة الثابتة — لا بيانات عمل ولا بيانات عملاء. */
const FIXED_RECIPIENT = "ziad.emb@gmail.com";
const FIXED_SUBJECT = "MEHLA — Resend Transport Verification";
const FIXED_TEXT =
  "اختبار تقني لإرسال البريد النظامي عبر مهلة.\nلا يلزم اتخاذ أي إجراء.";
const FIXED_HTML =
  '<div dir="rtl" style="font-family:system-ui,sans-serif;line-height:1.9">' +
  "<p>اختبار تقني لإرسال البريد النظامي عبر مهلة.</p>" +
  "<p>لا يلزم اتخاذ أي إجراء.</p></div>";
const FIXED_MESSAGE_ID = "<transport-verification@notify.mehlalex.com>";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/public/hooks/resend-system-test")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await guardCronRequest(request);
        if (denied) return denied;

        try {
          const { sendMehlaEmail, MEHLA_TRANSPORT_PROVIDER } = await import(
            "@/lib/email/transport/mehla-mailer.server"
          );

          const result = await sendMehlaEmail({
            to: FIXED_RECIPIENT,
            identity: "system",
            subject: FIXED_SUBJECT,
            html: FIXED_HTML,
            text: FIXED_TEXT,
            messageId: FIXED_MESSAGE_ID,
          });

          if (result.ok) {
            return json({
              ok: true,
              provider: MEHLA_TRANSPORT_PROVIDER,
              provider_status: result.smtpCode,
              provider_message_id: result.messageId,
              latency_ms: result.latencyMs,
            });
          }

          return json({
            ok: false,
            provider: MEHLA_TRANSPORT_PROVIDER,
            provider_status: result.smtpCode,
            provider_message_id: result.messageId,
            error_code: result.errorCode,
            safe_error_class: result.errorClass,
            latency_ms: result.latencyMs,
          });
        } catch {
          console.error("[resend-system-test] transport verification unavailable");
          return json({ ok: false, error_code: "transport_unavailable" }, 500);
        }
      },
    },
  },
});