import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Immutable print/export audit trail. The client asks the server to open a
 * print event; the server alone decides identity, IP, country and copy number,
 * so the paper trail cannot be forged from the browser.
 */

const openSchema = z.object({
  organizationId: z.string().uuid(),
  action: z.enum(["print", "export_pdf", "download"]),
  documentType: z.string().trim().min(2).max(40),
  documentId: z.string().uuid().nullable().optional(),
  documentRef: z.string().trim().max(80).nullable().optional(),
  documentTitle: z.string().trim().max(300),
  documentVersion: z.string().trim().max(20).default("v1"),
  classification: z
    .enum(["internal", "confidential", "secret", "highly_confidential"])
    .default("internal"),
  pagesCount: z.number().int().min(1).max(5000).default(1),
  browser: z.string().trim().max(40),
  os: z.string().trim().max(40),
  device: z.string().trim().max(40),
  sessionId: z.string().trim().max(80),
  metadata: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .default({}),
});

export const openPrintEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => openSchema.parse(input))
  .handler(async ({ data, context }) => {
    const [{ requireDocumentPermission }, { resolveRequestOrigin, buildPrintRef }] =
      await Promise.all([
        import("@/lib/document-ai.server"),
        import("@/lib/print/print-audit.server"),
      ]);

    const permission =
      data.action === "print"
        ? "print.print"
        : data.action === "export_pdf"
          ? "print.export_pdf"
          : "print.download";
    const role = await requireDocumentPermission(
      context.supabase,
      context.userId,
      data.organizationId,
      permission,
    );
    if (data.classification !== "internal") {
      await requireDocumentPermission(
        context.supabase,
        context.userId,
        data.organizationId,
        "print.confidential",
      );
    }

    const { ip, country, userAgent } = resolveRequestOrigin();

    const [{ data: profile }, { data: org }, { data: copyNumber }] = await Promise.all([
      context.supabase.rpc("my_profile").maybeSingle(),
      context.supabase
        .from("organizations")
        .select("name")
        .eq("id", data.organizationId)
        .maybeSingle(),
      // الوسيطان اختياريان في قاعدة البيانات (nullable)، والأنواع المولّدة لا تعبّر عن ذلك.
      context.supabase.rpc("print_copy_number", {
        _organization_id: data.organizationId,
        _document_id: data.documentId ?? null,
        _document_ref: data.documentRef ?? null,
      } as never),
    ]);

    const printRef = buildPrintRef();
    const copy = typeof copyNumber === "number" ? copyNumber : 1;
    const { error } = await context.supabase.from("print_audit_logs").insert({
      print_ref: printRef,
      organization_id: data.organizationId,
      user_name: profile?.full_name ?? null,
      user_email: profile?.email ?? null,
      user_role: role,
      action: data.action,
      document_id: data.documentId ?? null,
      document_type: data.documentType,
      document_ref: data.documentRef ?? null,
      document_title: data.documentTitle,
      document_version: data.documentVersion,
      classification: data.classification,
      pages_count: data.pagesCount,
      copy_number: copy,
      ip,
      country,
      browser: data.browser,
      os: data.os,
      device: data.device,
      session_id: data.sessionId,
      user_agent: userAgent,
      metadata: data.metadata as never,
    });
    if (error) throw new Error("تعذّر تسجيل عملية الطباعة، ولم تُنفَّذ العملية.");

    return {
      printRef,
      copyNumber: copy,
      ip,
      country,
      userName: profile?.full_name ?? "",
      userEmail: profile?.email ?? "",
      officeName: org?.name ?? "",
      role,
      serverTime: new Date().toISOString(),
    };
  });

/** سجل الطباعة لمكتب واحد — للمراجعة والتحقيق. */
export const listPrintAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        documentId: z.string().uuid().nullable().optional(),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).max(10_000).default(0),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("print_audit_logs")
      .select(
        "id, print_ref, action, user_name, user_email, user_role, document_type, document_ref, document_title, document_version, classification, pages_count, copy_number, ip, country, browser, os, device, created_at",
        { count: "exact" },
      )
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);
    if (data.documentId) query = query.eq("document_id", data.documentId);
    const { data: rows, count, error } = await query;
    if (error) throw new Error("تعذّر تحميل سجل الطباعة.");
    return { rows: rows ?? [], count: count ?? 0 };
  });
