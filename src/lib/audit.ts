import { supabase } from "@/integrations/supabase/client";

export type AuditAction =
  | "document.view"
  | "document.download"
  | "document.upload"
  | "document.delete"
  | "case.delete"
  | "client.delete"
  | "member.role_change"
  | "member.remove"
  | "share_link.create"
  | "share_link.revoke"
  | "data.export";

/**
 * Writes an immutable audit entry. The database trigger stamps the actor and
 * timestamp server-side, so a tampered payload cannot forge another user.
 * Never throws: auditing must not break the user's action.
 */
export async function audit(input: {
  organizationId: string | null | undefined;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  description?: string;
  metadata?: Record<string, unknown>;
}) {
  if (!input.organizationId) return;
  try {
    await supabase.from("activity_logs").insert({
      organization_id: input.organizationId,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      description: input.description ?? null,
      metadata: (input.metadata ?? {}) as never,
      user_agent: typeof navigator === "undefined" ? null : navigator.userAgent.slice(0, 300),
    });
  } catch {
    /* auditing is best-effort on the client; server-side events are logged separately */
  }
}
