import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

import { isIndexablePath, normalizePathname } from "@/config/indexing";

const BASE_URL = "https://mehlalex.com";

interface SitemapEntry {
  path: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        // الصفحات الرسمية فقط. أي مسار غير مسموح بفهرسته في `src/config/indexing.ts`
        // يُستبعد آلياً هنا، فلا يمكن أن تتعارض خريطة الموقع مع سياسة الفهرسة.
        const candidates: SitemapEntry[] = [
          { path: "/", changefreq: "weekly", priority: "1.0" },
          { path: "/pricing", changefreq: "weekly", priority: "0.9" },
          { path: "/about", changefreq: "monthly", priority: "0.8" },
          { path: "/how-it-works", changefreq: "monthly", priority: "0.8" },
          { path: "/faq", changefreq: "monthly", priority: "0.7" },
          { path: "/security", changefreq: "monthly", priority: "0.7" },
          { path: "/contact", changefreq: "monthly", priority: "0.7" },
          { path: "/docs", changefreq: "monthly", priority: "0.7" },
          { path: "/privacy", changefreq: "yearly", priority: "0.5" },
          { path: "/terms", changefreq: "yearly", priority: "0.5" },
        ];

        const entries = candidates.filter((entry) => isIndexablePath(entry.path));

        const urls = entries.map((e) =>
          [
            `  <url>`,
            `    <loc>${BASE_URL}${normalizePathname(e.path) === "/" ? "/" : normalizePathname(e.path)}</loc>`,

            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `  </url>`,
          ]
            .filter(Boolean)
            .join("\n"),
        );

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
