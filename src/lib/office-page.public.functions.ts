/**
 * قراءة عامة للصفحة المنشورة — بلا مصادقة، وتُستخدم في محمّل المسار العام.
 * لا تُرجع إلا العرض المنشور (لقطة `published`) أو null.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getPublicOfficePage = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ slug: z.string().trim().max(40) }).parse(d))
  .handler(async ({ data }) => {
    const { readPublicOfficeView } = await import("@/lib/office-public.server");
    const view = await readPublicOfficeView(data.slug.toLowerCase());
    return { view };
  });
