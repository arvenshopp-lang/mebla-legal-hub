/**
 * بوابة توثيق موحّدة للمهام المجدولة (pg_cron → pg_net).
 *
 * لا تُقبل مفاتيح المشروع العامة (publishable/anon) لأنها موجودة في حزمة المتصفح.
 * التوثيق يعتمد سراً عشوائياً مولّداً داخل قاعدة التشغيل ومخزناً في مخزن خاص غير
 * ظاهر عبر واجهة البيانات، ويُتحقق منه بدالة مقيّدة لدور الخدمة فقط بمقارنة
 * ثابتة الزمن داخل قاعدة البيانات. رسالة الرفض موحّدة ولا تكشف سبب الفشل.
 */

export const CRON_SECRET_HEADER = "x-mehla-cron-secret";

const MAX_SECRET_LENGTH = 512;

export function cronUnauthorizedResponse(): Response {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/** يتحقق من ترويسة السر. يعيد true فقط عند تطابق السر المخزّن. */
export async function isAuthorizedCronRequest(request: Request): Promise<boolean> {
  const provided = (request.headers.get(CRON_SECRET_HEADER) ?? "").trim();
  if (!provided || provided.length > MAX_SECRET_LENGTH) return false;

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("verify_cron_secret", {
      candidate: provided,
    });
    if (error) {
      console.error("[cron-auth] verification unavailable");
      return false;
    }
    return data === true;
  } catch {
    console.error("[cron-auth] verification failed");
    return false;
  }
}

/** حراسة جاهزة: تعيد Response عند الرفض، أو null عند القبول. */
export async function guardCronRequest(request: Request): Promise<Response | null> {
  return (await isAuthorizedCronRequest(request)) ? null : cronUnauthorizedResponse();
}
