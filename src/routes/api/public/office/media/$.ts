import { createFileRoute } from "@tanstack/react-router";

/**
 * تقديم وسائط الصفحة المنشورة فقط: المستودع خاص، والمسار يجب أن يكون مرجعياً
 * داخل اللقطة المنشورة الحالية للمكتب، وإلا 404 بلا أي تفاصيل.
 */
export const Route = createFileRoute("/api/public/office/media/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const splat = (params as { _splat?: string })._splat ?? "";
        const [slug, ...rest] = splat.split("/");
        if (!slug || rest.length === 0) return new Response("Not found", { status: 404 });

        const { readPublishedMedia } = await import("@/lib/office-public.server");
        const media = await readPublishedMedia(slug, rest.join("/"));
        if (!media) return new Response("Not found", { status: 404 });

        return new Response(media.bytes, {
          headers: {
            "content-type": media.contentType,
            "cache-control": "public, max-age=300",
            "x-content-type-options": "nosniff",
          },
        });
      },
    },
  },
});
