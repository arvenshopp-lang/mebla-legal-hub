import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { surfaceGuard } from "./lib/surface-guard.server";
import { applySecurityHeaders } from "./lib/security-headers.server";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return applySecurityHeaders(
      new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    );
  }
});

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
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

// حارس بنية النطاقات الفرعية (app / client / upload / status / api / docs / www)
const surfaceMiddleware = createMiddleware().server(async ({ next }) => {
  const blocked = surfaceGuard();
  if (blocked) return blocked as any;
  return next();
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [errorMiddleware, securityHeadersMiddleware, csrfMiddleware, surfaceMiddleware],
}));
