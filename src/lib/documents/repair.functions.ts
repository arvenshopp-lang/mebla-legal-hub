import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  organizationId: z.string().uuid(),
  scope: z.enum(["broken", "all"]).default("broken"),
  documentIds: z.array(z.string().uuid()).max(60).optional(),
});

/**
 * مهمة إصلاح المستندات داخل مكتب واحد: إعادة الربط والتحقق الفعلي من العرض
 * والتنزيل. تُنفَّذ بصلاحية «إعادة محاولة المعالجة» ويُسجَّل تشغيلها في سجل نشاط
 * المكتب.
 */
export const repairOfficeDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ data, context }) => {
    const [{ requireDocumentPermission }, { runDocumentRepair }] = await Promise.all([
      import("@/lib/document-ai.server"),
      import("./repair.server"),
    ]);

    await requireDocumentPermission(
      context.supabase,
      context.userId,
      data.organizationId,
      "documents.retry_ocr",
    );

    const report = await runDocumentRepair({
      organizationId: data.organizationId,
      scope: data.scope,
      ...(data.documentIds?.length ? { documentIds: data.documentIds } : {}),
    });

    await context.supabase.from("activity_logs").insert({
      organization_id: data.organizationId,
      action: "documents.repair",
      entity_type: "document",
      description: `فحص وإصلاح المستندات: ${report.scanned} مستنداً`,
      metadata: {
        scanned: report.scanned,
        relinked: report.relinked,
        requeued: report.requeued,
        missing: report.missing,
        invalid: report.invalid,
      },
    });

    return report;
  });