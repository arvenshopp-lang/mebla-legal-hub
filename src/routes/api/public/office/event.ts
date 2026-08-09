import { createFileRoute } from "@tanstack/react-router";

/**
 * أحداث مجمّعة ومجهولة فقط (قائمة مغلقة). لا نخزّن IP ولا user agent ولا أي
 * بيانات زائر، والمكتب يُستنتج من الرابط العام. الفشل صامت حتى لا يتعطل الزائر.
 */
export const Route = createFileRoute("/api/public/office/event")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const noContent = new Response(null, {
          status: 204,
          headers: { "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" },
        });
        try {
          const raw = await request.text();
          if (raw.length > 512) return noContent;
          const body = JSON.parse(raw || "{}") as {
            slug?: string;
            kind?: string;
            channel?: string;
          };
          const slug = String(body.slug ?? "").slice(0, 40);
          if (!slug) return noContent;
          const { recordPublicEvent } = await import("@/lib/office-public.server");
          await recordPublicEvent(slug, String(body.kind ?? ""), String(body.channel ?? ""));
        } catch {
          // صامت بالتصميم؛ الأعطال الحقيقية تُرصد في سجل الأعطال داخل طبقة العدّاد.
        }
        return noContent;
      },
    },
  },
});
