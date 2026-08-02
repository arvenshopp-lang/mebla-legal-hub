import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Client-facing entry points of the secure document pipeline. The browser can
 * only ask for a ticket; the server decides permissions, records the audit
 * entry and returns an opaque URL that resolves to a watermarked copy.
 */

const kindSchema = z.enum(["view", "preview", "download", "print", "export", "process"]);

const accessSchema = z.object({
  organizationId: z.string().uuid(),
  documentId: z.string().uuid(),
  kind: kindSchema,
  sourcePage: z.string().trim().max(120).optional(),
  sessionId: z.string().trim().max(80).optional(),
});

const KIND_PERMISSION = {
  view: "documents.view",
  preview: "documents.view",
  download: "documents.download",
  print: "documents.print",
  export: "documents.export",
  process: "documents.run_ocr",
} as const;

const KIND_ACTION = {
  view: "VIEW",
  preview: "PREVIEW",
  download: "DOWNLOAD",
  print: "PRINT",
  export: "EXPORT",
  process: "VIEW",
} as const;

/** يفتح عملية وصول مُصرَّحاً بها ويُعيد رابط النسخة المائية المؤقتة. */
export const requestDocumentAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => accessSchema.parse(input))
  .handler(async ({ data, context }) => {
    const [{ requireDocumentPermission }, secure, shared] = await Promise.all([
      import("@/lib/document-ai.server"),
      import("./secure-view.server"),
      import("./secure-view.shared"),
    ]);

    await requireDocumentPermission(
      context.supabase,
      context.userId,
      data.organizationId,
      KIND_PERMISSION[data.kind],
    );

    const { data: doc, error } = await context.supabase
      .from("documents")
      .select("id, file_name, file_type, is_confidential, document_category")
      .eq("id", data.documentId)
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (error || !doc) throw new Error("المستند غير موجود داخل هذا المكتب.");

    const classification = shared.classificationOf(doc.is_confidential, doc.document_category);
    if (classification !== "internal") {
      await requireDocumentPermission(
        context.supabase,
        context.userId,
        data.organizationId,
        "print.confidential",
      );
    }

    const [{ data: profile }, { data: org }] = await Promise.all([
      context.supabase.from("profiles").select("full_name, email").eq("id", context.userId).maybeSingle(),
      context.supabase
        .from("organizations")
        .select("name")
        .eq("id", data.organizationId)
        .maybeSingle(),
    ]);

    const lines = shared.watermarkLinesFor(
      org?.name ?? "",
      profile?.full_name ?? "",
      data.kind === "process" ? "view" : data.kind,
      {
        email: profile?.email ?? "",
        sessionId: data.sessionId ?? "",
        openedAt: new Date(),
      },
    );

    const ticket = await secure.issueAccessToken({
      organizationId: data.organizationId,
      documentId: doc.id,
      kind: data.kind,
      watermarkOffice: lines[0],
      watermarkUser: lines[1],
      watermarkNote: shared.CLASSIFICATION_NOTES[classification],
      classification,
      createdBy: context.userId,
    });

    await secure.logDocumentAccess({
      organizationId: data.organizationId,
      documentId: doc.id,
      documentName: doc.file_name,
      userId: context.userId,
      userName: profile?.full_name ?? null,
      officeName: org?.name ?? null,
      action: KIND_ACTION[data.kind],
      sessionId: data.sessionId ?? null,
      sourcePage: data.sourcePage ?? null,
    });

    return {
      url: `/api/public/doc/${ticket.token}${data.kind === "download" || data.kind === "export" ? "?dl=1" : ""}`,
      expiresAt: ticket.expiresAt,
      fileName: shared.safePdfName(doc.file_name),
      classification,
    };
  });

/** ينشئ رابط مشاركة مؤقتاً وقابلاً للإلغاء يفتح نسخة مائية فقط. */
export const createDocumentShareLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        documentId: z.string().uuid(),
        recipientLabel: z.string().trim().max(120).optional(),
        expiresInDays: z.number().int().min(1).max(30).default(7),
        maxUses: z.number().int().min(1).max(100).default(20),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const [{ requireDocumentPermission }, secure, shared] = await Promise.all([
      import("@/lib/document-ai.server"),
      import("./secure-view.server"),
      import("./secure-view.shared"),
    ]);

    await requireDocumentPermission(
      context.supabase,
      context.userId,
      data.organizationId,
      "documents.share",
    );

    const { data: doc, error } = await context.supabase
      .from("documents")
      .select("id, file_name, is_confidential, document_category")
      .eq("id", data.documentId)
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (error || !doc) throw new Error("المستند غير موجود داخل هذا المكتب.");

    const classification = shared.classificationOf(doc.is_confidential, doc.document_category);
    if (classification !== "internal") {
      await requireDocumentPermission(
        context.supabase,
        context.userId,
        data.organizationId,
        "print.confidential",
      );
    }

    const [{ data: profile }, { data: org }] = await Promise.all([
      context.supabase.from("profiles").select("full_name, email").eq("id", context.userId).maybeSingle(),
      context.supabase
        .from("organizations")
        .select("name")
        .eq("id", data.organizationId)
        .maybeSingle(),
    ]);

    const lines = shared.watermarkLinesFor(org?.name ?? "", profile?.full_name ?? "", "share", {
      email: profile?.email ?? "",
      openedAt: new Date(),
    });
    const ticket = await secure.issueAccessToken({
      organizationId: data.organizationId,
      documentId: doc.id,
      kind: "share",
      watermarkOffice: lines[0],
      watermarkUser: lines[1],
      watermarkNote: shared.CLASSIFICATION_NOTES[classification],
      classification,
      createdBy: context.userId,
      recipientLabel: data.recipientLabel ?? null,
      ttlSeconds: data.expiresInDays * 24 * 60 * 60,
      maxUses: data.maxUses,
    });

    await secure.logDocumentAccess({
      organizationId: data.organizationId,
      documentId: doc.id,
      documentName: doc.file_name,
      shareTokenId: ticket.id,
      userId: context.userId,
      userName: profile?.full_name ?? null,
      officeName: org?.name ?? null,
      action: "SHARE",
      sourcePage: "documents",
    });

    return { path: `/share/${ticket.token}`, expiresAt: ticket.expiresAt };
  });

/** روابط المشاركة الحالية لمستند واحد. */
export const listDocumentShareLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ organizationId: z.string().uuid(), documentId: z.string().uuid() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("document_access_tokens")
      .select(
        "id, recipient_label, expires_at, max_uses, used_count, revoked_at, created_at, watermark_user",
      )
      .eq("organization_id", data.organizationId)
      .eq("document_id", data.documentId)
      .eq("kind", "share")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error("تعذّر تحميل روابط المشاركة.");
    return rows ?? [];
  });

/** إلغاء فوري لرابط مشاركة — تصبح النسخة غير قابلة للفتح. */
export const revokeDocumentShareLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ organizationId: z.string().uuid(), tokenId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { requireDocumentPermission } = await import("@/lib/document-ai.server");
    await requireDocumentPermission(
      context.supabase,
      context.userId,
      data.organizationId,
      "documents.share",
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("document_access_tokens")
      .update({ revoked_at: new Date().toISOString(), revoked_by: context.userId })
      .eq("id", data.tokenId)
      .eq("organization_id", data.organizationId)
      .eq("kind", "share");
    if (error) throw new Error("تعذّر إلغاء الرابط.");
    return { ok: true };
  });

/** سجل الوصول لمستند — لمالك المكتب والمدير فقط (تفرضه سياسات القاعدة). */
export const listDocumentAccessLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        documentId: z.string().uuid().nullable().optional(),
        limit: z.number().int().min(1).max(100).default(50),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("document_access_logs")
      .select(
        "id, action_type, user_name, office_name, document_name, ip, browser, os, device, source_page, created_at",
        { count: "exact" },
      )
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.documentId) query = query.eq("document_id", data.documentId);
    const { data: rows, count, error } = await query;
    if (error) throw new Error("تعذّر تحميل سجل الوصول.");
    return { rows: rows ?? [], count: count ?? 0 };
  });
