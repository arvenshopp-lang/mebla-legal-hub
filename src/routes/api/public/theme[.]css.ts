/**
 * حزمة CSS الخاصة بتصميم المنصة المنشور.
 * تُقرأ من ذاكرة الخادم بمفتاح الإصدار (theme_version) ولا تستعلم قاعدة البيانات لكل طلب.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/theme.css")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const requested = url.searchParams.get("v");
        try {
          const svc = await import("@/lib/design/theme.server");
          const { css, cacheVersion } = await svc.generateCssBundle();
          const immutable = requested === String(cacheVersion);
          return new Response(css, {
            headers: {
              "content-type": "text/css; charset=utf-8",
              "cache-control": immutable
                ? "public, max-age=31536000, immutable"
                : "public, max-age=0, must-revalidate",
              "x-theme-version": String(cacheVersion),
            },
          });
        } catch {
          return new Response("/* mehla: theme unavailable, default design applied */", {
            status: 200,
            headers: { "content-type": "text/css; charset=utf-8", "cache-control": "no-store" },
          });
        }
      },
    },
  },
});