import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import {
  MAX_FILES_PER_REQUEST,
  MAX_UPLOAD_SIZE,
  validateClientFile,
  sanitizeFileName,
  fileExtension,
} from "./client-portal.shared";

/* ------------------------------------------------------------------ *
 * Public (unauthenticated) endpoints for the client-facing portal.
 * They never accept ids — only opaque secrets — and never leak PII.
 * ------------------------------------------------------------------ */

const tokenSchema = z.object({ token: z.string().min(20).max(200) });

const fileMetaSchema = z.object({
  name: z.string().min(1).max(200),
  size: z.number().int().positive().max(MAX_UPLOAD_SIZE),
  type: z.string().max(150).default(""),
  label: z.string().max(200).optional(),
});

export const getUploadRequest = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => tokenSchema.parse(d))
  .handler(async ({ data }) => {
    const { loadRequestByToken, logEvent, clientIp, guardUploadToken } = await import("./client-portal.server");
    const ipAddress = clientIp();
    const guard = await guardUploadToken(ipAddress);
    if (guard.limited) return { state: "rate_limited" as const };

    const found = await loadRequestByToken(data.token);
    await guard.record(!!found);
    if (!found) return { state: "invalid" as const };

    const { request, org } = found;
    const state = found.effectiveStatus;
    if (state === "active") {
      await logEvent(request, "opened", {}, ipAddress);
    }
    return {
      state,
      title: request.title as string,
      message: (request.message ?? null) as string | null,
      items: (request.requested_items ?? []) as string[],
      expiresAt: (request.expires_at ?? null) as string | null,
      completedAt: (request.completed_at ?? null) as string | null,
      orgName: (org?.name ?? "") as string,
      orgLogo: (org?.logo_url ?? null) as string | null,
      maxFiles: MAX_FILES_PER_REQUEST,
      maxSize: MAX_UPLOAD_SIZE,
    };
  });

export const createUploadSlots = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    tokenSchema.extend({ files: z.array(fileMetaSchema).min(1).max(MAX_FILES_PER_REQUEST) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { loadRequestByToken, clientIp, guardUploadToken } = await import("./client-portal.server");
    const guard = await guardUploadToken(clientIp());
    if (guard.limited) throw new Error("تم تجاوز عدد المحاولات المسموح بها، حاول لاحقاً.");
    const found = await loadRequestByToken(data.token);
    await guard.record(!!found && found.effectiveStatus === "active");
    if (!found || found.effectiveStatus !== "active") {
      throw new Error("هذا الرابط لم يعد صالحاً للاستخدام.");
    }
    for (const f of data.files) {
      const err = validateClientFile(f);
      if (err) throw new Error(`${f.name}: ${err}`);
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const req = found.request;
    const slots: Array<{ path: string; uploadToken: string; name: string }> = [];
    for (const f of data.files) {
      const ext = fileExtension(f.name) || "bin";
      const path = `${req.organization_id}/client-uploads/${req.id}/${crypto.randomUUID()}.${ext}`;
      const { data: signed, error } = await supabaseAdmin.storage
        .from("documents")
        .createSignedUploadUrl(path);
      if (error || !signed) throw new Error("تعذّر تجهيز الرفع، حاول مرة أخرى.");
      slots.push({ path, uploadToken: signed.token, name: f.name });
    }
    return { slots };
  });

export const submitUploadRequest = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    tokenSchema
      .extend({ files: z.array(fileMetaSchema.extend({ path: z.string().min(5).max(400) })).min(1).max(MAX_FILES_PER_REQUEST) })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { loadRequestByToken, logEvent, clientIp, guardUploadToken } = await import("./client-portal.server");
    const guard = await guardUploadToken(clientIp());
    if (guard.limited) throw new Error("تم تجاوز عدد المحاولات المسموح بها، حاول لاحقاً.");
    const found = await loadRequestByToken(data.token);
    await guard.record(!!found && found.effectiveStatus === "active");
    if (!found || found.effectiveStatus !== "active") {
      throw new Error("هذا الرابط لم يعد صالحاً للاستخدام.");
    }
    const req = found.request;
    const prefix = `${req.organization_id}/client-uploads/${req.id}/`;
    for (const f of data.files) {
      const err = validateClientFile(f);
      if (err) throw new Error(`${f.name}: ${err}`);
      if (!f.path.startsWith(prefix) || f.path.includes("..")) throw new Error("مسار ملف غير صالح.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ip = clientIp();

    const rows = data.files.map((f) => ({
      organization_id: req.organization_id,
      case_id: req.case_id,
      client_id: found.clientId,
      file_name: sanitizeFileName(f.name),
      file_path: f.path,
      file_type: f.type || null,
      file_size: f.size,
      document_category: f.label ? f.label.slice(0, 80) : "مستند من العميل",
      description: `مرفوع من العميل عبر طلب: ${req.title}`,
      is_confidential: false,
      uploaded_by: null,
      source: "client_upload",
      document_request_id: req.id,
      client_ip: ip,
    }));

    const { error: insErr } = await supabaseAdmin.from("documents").insert(rows);
    if (insErr) throw new Error("تعذّر حفظ المستندات، حاول مرة أخرى.");

    await supabaseAdmin
      .from("document_requests")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        file_count: data.files.length,
        submitted_ip: ip,
        submitted_user_agent: (getRequestHeader("user-agent") ?? "").slice(0, 300),
      })
      .eq("id", req.id)
      .eq("status", "active");

    await logEvent(req, "submitted", { files: data.files.length }, ip);

    await supabaseAdmin.from("case_updates").insert({
      organization_id: req.organization_id,
      case_id: req.case_id,
      update_type: "document",
      title: "استلام مستندات من العميل",
      description: `تم استلام ${data.files.length} مستند عبر طلب "${req.title}".`,
      event_date: new Date().toISOString(),
      is_client_visible: true,
      created_by: req.created_by,
    });

    return { ok: true, count: data.files.length };
  });

/* ---------------------------- case tracking ---------------------------- */

const codeSchema = z.object({ code: z.string().trim().regex(/^[0-9]{10}$/, "الرمز يجب أن يتكون من 10 أرقام") });

export const lookupCaseStatus = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => codeSchema.parse(d))
  .handler(async ({ data }) => {
    const { hashText, checkLookupRateLimit, recordLookupAttempt, clientIp } = await import("./client-portal.server");
    const ip = clientIp();
    const ipHash = await hashText(`lookup:${ip}`);

    const limited = await checkLookupRateLimit(ipHash);
    if (limited) return { state: "rate_limited" as const };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("cases")
      .select("id, public_code, status, updated_at, last_activity_at, next_action_date, organization_id")
      .eq("public_code", data.code)
      .maybeSingle();

    await recordLookupAttempt(ipHash, data.code, !!row);
    if (!row) return { state: "not_found" as const };

    const [{ data: updates }, { data: hearings }, { data: deadlines }, { data: docs }] = await Promise.all([
      supabaseAdmin
        .from("case_updates")
        .select("title, description, event_date, update_type")
        .eq("case_id", row.id)
        .eq("is_client_visible", true)
        .order("event_date", { ascending: false })
        .limit(5),
      supabaseAdmin
        .from("hearings")
        .select("hearing_date")
        .eq("case_id", row.id)
        .in("status", ["scheduled", "postponed"])
        .gte("hearing_date", new Date().toISOString())
        .order("hearing_date")
        .limit(1),
      supabaseAdmin
        .from("deadlines")
        .select("due_date")
        .eq("case_id", row.id)
        .eq("status", "active")
        .gte("due_date", new Date().toISOString())
        .order("due_date")
        .limit(1),
      supabaseAdmin
        .from("documents")
        .select("created_at")
        .eq("case_id", row.id)
        .order("created_at", { ascending: false })
        .limit(1),
    ]);

    return {
      state: "found" as const,
      code: row.public_code as string,
      status: row.status as string,
      lastActivityAt: (row.last_activity_at ?? row.updated_at) as string,
      updatedAt: row.updated_at as string,
      nextHearingAt: (hearings?.[0]?.hearing_date ?? null) as string | null,
      nextActionAt: (deadlines?.[0]?.due_date ?? row.next_action_date ?? null) as string | null,
      lastDocumentAt: (docs?.[0]?.created_at ?? null) as string | null,
      updates: (updates ?? []).map((u) => ({
        title: u.title as string,
        description: (u.description ?? null) as string | null,
        date: u.event_date as string,
        type: u.update_type as string,
      })),
    };
  });

