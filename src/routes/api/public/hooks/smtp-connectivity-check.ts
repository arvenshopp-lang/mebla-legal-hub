/**
 * فحص اتصال SMTP مؤقت — يشغّل `smtpVerify` من داخل عامل الإنتاج نفسه.
 *
 * لا يُرسل أي رسالة: المسار يستدعي مُتحقق الاتصال القائم فقط (مقبس → banner →
 * EHLO → AUTH → QUIT) بلا MAIL FROM أو RCPT TO أو DATA، وبلا أي كتابة في قاعدة
 * التطبيق. الإعداد كامله خادمي: لا مضيف ولا منفذ ولا بيانات دخول من المتصل.
 * التوثيق بسر التشغيل الدوري وحده، والاستجابة معادن تشخيصية آمنة فقط.
 */
import { createFileRoute } from "@tanstack/react-router";
import { guardCronRequest } from "@/lib/security/cron-auth.server";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/** مرحلة الوصول المستنتجة من رمز الفشل المصنّف — دون نص المزوّد الخام. */
function stageOf(code: string): {
  stage: string;
  socket_opened: boolean;
  tls_reached: boolean;
  banner_reached: boolean;
  auth_reached: boolean;
} {
  switch (code) {
    case "smtp_not_configured":
      return {
        stage: "config",
        socket_opened: false,
        tls_reached: false,
        banner_reached: false,
        auth_reached: false,
      };
    case "smtp_connect_failed":
      return {
        stage: "socket_open",
        socket_opened: false,
        tls_reached: false,
        banner_reached: false,
        auth_reached: false,
      };
    case "smtp_timeout":
      return {
        stage: "socket_read",
        socket_opened: true,
        tls_reached: true,
        banner_reached: false,
        auth_reached: false,
      };
    case "smtp_protocol_error":
      return {
        stage: "banner_or_ehlo",
        socket_opened: true,
        tls_reached: true,
        banner_reached: true,
        auth_reached: false,
      };
    case "smtp_auth_failed":
      return {
        stage: "auth",
        socket_opened: true,
        tls_reached: true,
        banner_reached: true,
        auth_reached: true,
      };
    default:
      return {
        stage: "unknown",
        socket_opened: false,
        tls_reached: false,
        banner_reached: false,
        auth_reached: false,
      };
  }
}

export const Route = createFileRoute("/api/public/hooks/smtp-connectivity-check")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await guardCronRequest(request);
        if (denied) return denied;

        try {
          const { smtpVerify } = await import("@/lib/email/transport/smtp.server");
          // بلا وسيط: يُستخدم الصندوق القانوني المعرّف خادمياً فقط.
          const result = await smtpVerify();
          if (result.ok) {
            return json({
              ok: true,
              stage: "auth",
              latency_ms: result.latencyMs,
              socket_opened: true,
              tls_reached: true,
              banner_reached: true,
              auth_reached: true,
            });
          }
          return json({
            ok: false,
            error_code: result.code,
            safe_error_class: result.code,
            latency_ms: result.latencyMs,
            ...stageOf(result.code),
          });
        } catch {
          console.error("[smtp-connectivity-check] verification unavailable");
          return json({ ok: false, error_code: "verify_unavailable" }, 500);
        }
      },
    },
  },
});
