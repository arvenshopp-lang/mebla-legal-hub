import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * تجهيز/إنهاء رفع المستندات على الخادم. لوحة المكتب لم تعد تكتب في المخزن ولا في
 * جدول documents مباشرة: ترفع البايتات إلى فتحة موقّعة، ثم يتحقق الخادم منها.
 */

export const prepareDocumentUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        fileName: z.string().min(1).max(200),
        fileSize: z.number().int().positive(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { MAX_UPLOAD_SIZE } = await import("@/lib/client-portal.shared");
    const { requireDocumentWriteRole, createUploadSlot } = await import("./intake.server");
    const { assertQuota } = await import("@/lib/subscription.server");
    if (data.fileSize > MAX_UPLOAD_SIZE) throw new Error("حجم الملف يتجاوز 20 ميجابايت.");
    await requireDocumentWriteRole(context.supabase, context.userId, data.organizationId);
    // فحص مسبق للحصص قبل بدء الرفع: عدد المستندات ثم مساحة التخزين بحجم الملف.
    const overview = await assertQuota(context.supabase, data.organizationId, "documents");
    await assertQuota(context.supabase, data.organizationId, "storage", {
      amount: data.fileSize,
      overview,
    });
    const slot = await createUploadSlot(`${data.organizationId}/`, data.fileName);
    return slot;
  });

export const finalizeDocumentUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        path: z.string().min(5).max(400),
        fileName: z.string().min(1).max(200),
        caseId: z.string().uuid().nullable().default(null),
        clientId: z.string().uuid().nullable().default(null),
        category: z.string().max(80).default(""),
        description: z.string().max(1000).default(""),
        isConfidential: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { sanitizeFileName } = await import("@/lib/client-portal.shared");
    const {
      requireDocumentWriteRole,
      verifyUploadedObject,
      removeOrphanObject,
      assertCaseAndClientInOrg,
      assertPathNotLinked,
      isDuplicatePathError,
    } = await import("./intake.server");
    await requireDocumentWriteRole(context.supabase, context.userId, data.organizationId);
    await assertCaseAndClientInOrg(
      context.supabase,
      data.organizationId,
      data.caseId,
      data.clientId,
    );

    const verified = await verifyUploadedObject({
      path: data.path,
      prefix: `${data.organizationId}/`,
      fileName: data.fileName,
    });
    await assertPathNotLinked(verified.path);

    // الإدراج بمفتاح الخدمة حصراً: جدول documents لا يقبل INSERT من المتصفح،
    // والصلاحية والملكية والبايتات تم التحقق منها أعلاه عبر عميل المستخدم.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inserted, error } = await supabaseAdmin
      .from("documents")
      .insert({
        organization_id: data.organizationId,
        case_id: data.caseId,
        client_id: data.clientId,
        file_name: sanitizeFileName(data.fileName),
        file_path: verified.path,
        file_type: verified.mime,
        file_size: verified.size,
        file_status: "AVAILABLE",
        storage_verified_at: new Date().toISOString(),
        document_category: data.category || null,
        description: data.description || null,
        is_confidential: data.isConfidential,
        uploaded_by: context.userId,
      })
      .select("id")
      .single();

    if (error || !inserted) {
      // مسار مرتبط مسبقاً: الكائن يملكه مستند قائم، فلا يُحذف أبداً.
      if (isDuplicatePathError(error)) {
        throw new Error("هذا الملف مرتبط بمستند مسجّل مسبقاً.");
      }
      await removeOrphanObject(verified.path);
      throw new Error("تعذّر حفظ المستند. أعد المحاولة.");
    }

    // الحجر ثم الفحص البنيوي ثم قرار الإفراج. أي فشل يُبقي الملف محجوزاً ولا
    // يُسلَّم لأي مسار عرض أو تنزيل.
    const { runIntakeReleasePipeline } = await import(
      "@/lib/file-security/security-state.server"
    );
    await runIntakeReleasePipeline({
      documentId: inserted.id,
      organizationId: data.organizationId,
      sha256: verified.sha256,
      bytes: verified.size,
      declaredMime: verified.mime,
      detectedMime: verified.mime,
      actorId: context.userId,
    });

    return { documentId: inserted.id, fileType: verified.mime, fileSize: verified.size };
  });

/**
 * حذف مستند: التحقق من الصلاحية بعميل المستخدم، ثم إزالة كائن التخزين ثم الصف
 * بمفتاح الخدمة. المتصفح لم يعد يملك DELETE على الجدول ولا على المخزن.
 */
export const deleteDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ documentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { requireDocumentDeletePermission, purgeDocument } = await import("./intake.server");
    const doc = await requireDocumentDeletePermission(
      context.supabase,
      context.userId,
      data.documentId,
    );
    await purgeDocument(doc);
    return { organizationId: doc.organization_id, fileName: doc.file_name };
  });
