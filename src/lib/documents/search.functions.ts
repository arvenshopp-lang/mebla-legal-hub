import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * البحث داخل نصوص المستندات: يتم على الخادم حصراً بعد التحقق من عضوية المكتب
 * ومن استحقاق الميزة `pdf_search_enabled`. البوابة الواجهية للعرض فقط.
 */
const searchSchema = z.object({
  organizationId: z.string().uuid(),
  query: z.string().min(2).max(200),
  caseId: z.string().uuid().nullable().default(null),
  clientId: z.string().uuid().nullable().default(null),
  fileType: z.string().max(120).nullable().default(null),
  ocrOnly: z.boolean().default(false),
  from: z.string().max(20).nullable().default(null),
  to: z.string().max(20).nullable().default(null),
  limit: z.number().int().min(1).max(50).default(20),
  offset: z.number().int().min(0).max(10_000).default(0),
});

export const searchDocumentPages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => searchSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { assertEntitlement } = await import("@/lib/subscription.server");
    await assertEntitlement(context.supabase, data.organizationId, {
      feature: "pdf_search_enabled",
    });

    const { data: rows, error } = await context.supabase.rpc("search_document_pages", {
      _query: data.query.trim(),
      _case_id: data.caseId ?? undefined,
      _client_id: data.clientId ?? undefined,
      _file_type: data.fileType ?? undefined,
      _ocr_only: data.ocrOnly,
      _from: data.from ?? undefined,
      _to: data.to ?? undefined,
      _limit: data.limit,
      _offset: data.offset,
    });
    if (error) throw new Error("تعذّر تنفيذ البحث في المستندات. أعد المحاولة.");

    const hits = rows ?? [];
    return {
      rows: hits.map((row) => ({ ...row, total_count: Number(row.total_count ?? 0) })),
      count: hits.length > 0 ? Number(hits[0].total_count ?? 0) : 0,
    };
  });