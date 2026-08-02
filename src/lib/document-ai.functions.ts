import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Server functions for document intelligence. Every handler re-checks office
 * membership, the feature permission, plan entitlement and quota before any
 * external provider is contacted. No legal text is ever logged.
 */

const ocrSchema = z.object({
  organizationId: z.string().uuid(),
  documentId: z.string().uuid(),
  pageNumber: z.number().int().min(1).max(2000),
  mimeType: z.string().trim().regex(/^image\/(png|jpeg|webp)$/, "صيغة صورة غير مدعومة"),
  // ~8MB من base64 لكل صفحة كحد أقصى
  imageBase64: z.string().min(64).max(11_000_000),
  languageHint: z.enum(["ar", "en", "mixed"]).default("mixed"),
});

export const ocrDocumentPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ocrSchema.parse(input))
  .handler(async ({ data, context }) => {
    const [{ requireDocumentPermission, consumeOcrQuota }, { assertEntitlement }, { getOcrProvider }] =
      await Promise.all([
        import("@/lib/document-ai.server"),
        import("@/lib/subscription.server"),
        import("@/lib/ocr.server"),
      ]);

    await requireDocumentPermission(context.supabase, context.userId, data.organizationId, "documents.run_ocr");
    await assertEntitlement(context.supabase, data.organizationId, { feature: "pdf_search_enabled" });

    // المستند يجب أن يكون داخل المكتب نفسه (RLS + تحقق صريح).
    const { data: doc } = await context.supabase
      .from("documents")
      .select("id")
      .eq("id", data.documentId)
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (!doc) throw new Error("المستند غير موجود داخل هذا المكتب.");

    await consumeOcrQuota(context.supabase, data.organizationId, 1);

    const provider = getOcrProvider();
    const result = await provider.extractDocument({
      imageBase64: data.imageBase64,
      mimeType: data.mimeType,
      pageNumber: data.pageNumber,
      languageHint: data.languageHint,
    });

    return {
      pageNumber: data.pageNumber,
      text: result.text,
      confidence: result.confidence,
      language: result.language,
      isBlank: result.isBlank,
      provider: result.provider,
    };
  });

/** رابط تنزيل قصير الصلاحية لإعادة المعالجة أو فتح صفحة نتيجة البحث. */
export const signDocumentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ organizationId: z.string().uuid(), documentId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { requireDocumentPermission } = await import("@/lib/document-ai.server");
    await requireDocumentPermission(
      context.supabase,
      context.userId,
      data.organizationId,
      "documents.view_extracted_text",
    );

    const { data: doc, error } = await context.supabase
      .from("documents")
      .select("file_path, file_name, file_type")
      .eq("id", data.documentId)
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (error || !doc) throw new Error("المستند غير موجود داخل هذا المكتب.");

    const { data: signed, error: signError } = await context.supabase.storage
      .from("documents")
      .createSignedUrl(doc.file_path, 300);
    if (signError || !signed) throw new Error("تعذّر تجهيز رابط العرض.");

    // لا يُسجَّل الرابط الموقّع في أي سجل تدقيق.
    return { url: signed.signedUrl, fileName: doc.file_name, fileType: doc.file_type };
  });

/** حصة القراءة الضوئية المتبقية لهذا الشهر. */
export const getOcrQuota = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ organizationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { requireDocumentPermission } = await import("@/lib/document-ai.server");
    await requireDocumentPermission(
      context.supabase,
      context.userId,
      data.organizationId,
      "documents.view_extracted_text",
    );
    const { loadOverview } = await import("@/lib/subscription.server");
    const overview = await loadOverview(context.supabase, data.organizationId);
    return {
      limit: overview.plan.ocr_pages_monthly,
      used: overview.usage.ocr_pages ?? 0,
      searchEnabled: overview.plan.pdf_search_enabled,
    };
  });
