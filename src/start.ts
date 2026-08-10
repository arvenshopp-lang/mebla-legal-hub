import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { surfaceGuard } from "./lib/surface-guard.server";
import { applySecurityHeaders } from "./lib/security-headers.server";
import { getRequest } from "@tanstack/react-start/server";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    let isApi = false;
    let isServerFn = false;
    try {
      const pathname = new URL(getRequest().url).pathname;
      isApi = pathname.startsWith("/api/");
      const base = process.env["TSS_SERVER_FN_BASE"];
      isServerFn =
        (base ? pathname.startsWith(base) : false) || pathname.startsWith("/_serverFn/");
    } catch {
      isApi = false;
    }
    // أخطاء دوال الخادم يجب أن تعود للمتصفح مُسلسلة كخطأ حتى تُعرض كرسالة عربية
    // داخل الصفحة، لا كصفحة خطأ HTML تُسقط الواجهة بالكامل.
    if (isServerFn) throw error;
    console.error(error);
    if (isApi) {
      return applySecurityHeaders(
        Response.json(
          {
            error: "internal_error",
            message: "تعذر تحميل المستند. الرابط غير صالح أو الملف غير متاح.",
          },
          { status: 500, headers: { "cache-control": "no-store" } },
        ),
      );
    }
    return applySecurityHeaders(
      new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    );
  }
});

// مسارات /lovable/* (ويبهوك البريد والمعاينة) تُوثّق نفسها بمفتاح/توقيع،
// ويجب ألا تمر على حارس النطاقات أو CSRF أو أي تحويل.
const isLovableInternalRequest = () => {
  try {
    return new URL(getRequest().url).pathname.startsWith("/lovable/");
  } catch {
    return false;
  }
};

// رؤوس الحماية (CSP / HSTS / anti-sniffing / anti-clickjacking) على كل استجابة
const securityHeadersMiddleware = createMiddleware().server(async ({ next }) => {
  const result = await next();
  const response = (result as { response?: Response }).response;
  if (response instanceof Response) applySecurityHeaders(response);
  else if (result instanceof Response) applySecurityHeaders(result);
  return result;
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
// ملاحظة: مسارات /lovable/* هي مسارات خادم (server routes) وليست server functions،
// لذا لا تمر على حرس CSRF أصلاً. تجنّب استدعاء getRequest() داخل الـ filter لأنه
// يُنفَّذ في حزمة المتصفح أيضاً (وهو ما يمنعه حرس الاستيراد في البناء).
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

// حارس بنية النطاقات الفرعية (app / client / upload / status / api / docs / www)
const surfaceMiddleware = createMiddleware().server(async ({ next }) => {
  if (isLovableInternalRequest()) return next();
  const blocked = surfaceGuard();
  if (blocked) return blocked;
  return next();
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [
    errorMiddleware,
    securityHeadersMiddleware,
    csrfMiddleware,
    surfaceMiddleware,
  ],
}));
