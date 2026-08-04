import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  maskEmail,
  normalizeEmail,
  type InviteAcceptResult,
  type InvitePreview,
  type InvitePreviewState,
  type InviteRole,
} from "./invitations.shared";

type InvitationRow = {
  id: string;
  organization_id: string;
  email: string;
  role: InviteRole;
  status: "pending" | "accepted" | "revoked" | "expired";
  expires_at: string;
  invited_by: string | null;
  organization: { id: string; name: string; is_active: boolean } | null;
};

/**
 * يقرأ الدعوة عبر رمزها السري بصلاحيات الخادم فقط، ويحدّث حالتها إلى
 * "expired" عند انقضاء المدة حتى لا تبقى قابلة للاستخدام.
 */
async function loadInvitation(token: string): Promise<{ row: InvitationRow; state: InvitePreviewState } | null> {
  const { data } = await supabaseAdmin
    .from("organization_invitations")
    .select("id, organization_id, email, role, status, expires_at, invited_by, organization:organizations(id, name, is_active)")
    .eq("token", token)
    .maybeSingle();

  const row = data as InvitationRow | null;
  if (!row) return null;

  let state: InvitePreviewState = "valid";
  if (row.status === "revoked") state = "revoked";
  else if (row.status === "accepted") state = "accepted";
  else if (row.status === "expired") state = "expired";
  else if (new Date(row.expires_at).getTime() <= Date.now()) {
    state = "expired";
    await supabaseAdmin
      .from("organization_invitations")
      .update({ status: "expired" })
      .eq("id", row.id)
      .eq("status", "pending");
  } else if (!row.organization?.is_active) {
    state = "org_inactive";
  }

  return { row, state };
}

export async function previewInvitation(token: string): Promise<InvitePreview> {
  const found = await loadInvitation(token);
  if (!found) return { state: "invalid", orgName: null, role: null, maskedEmail: null, expiresAt: null };
  return {
    state: found.state,
    orgName: found.row.organization?.name ?? null,
    role: found.row.role,
    maskedEmail: maskEmail(found.row.email),
    expiresAt: found.row.expires_at,
  };
}

export async function acceptInvitation(
  token: string,
  userId: string,
  userEmail: string | null,
): Promise<InviteAcceptResult> {
  const found = await loadInvitation(token);
  if (!found) return { state: "invalid" };
  if (found.state !== "valid") return { state: found.state };

  const { row } = found;
  const orgName = row.organization?.name ?? "";

  if (normalizeEmail(userEmail) !== normalizeEmail(row.email)) {
    return { state: "email_mismatch", maskedEmail: maskEmail(row.email) };
  }

  const { data: existing } = await supabaseAdmin
    .from("organization_members")
    .select("id, status, role")
    .eq("organization_id", row.organization_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    if (existing.status !== "active") {
      const { error } = await supabaseAdmin
        .from("organization_members")
        .update({ status: "active", role: row.role })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    }
  } else {
    const { error } = await supabaseAdmin.from("organization_members").insert({
      organization_id: row.organization_id,
      user_id: userId,
      role: row.role,
      status: "active",
    });
    if (error) throw new Error(error.message);
  }

  await supabaseAdmin
    .from("organization_invitations")
    .update({ status: "accepted" })
    .eq("id", row.id)
    .eq("status", "pending");

  if (row.invited_by) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .maybeSingle();
    await supabaseAdmin.from("notifications").insert({
      organization_id: row.organization_id,
      user_id: row.invited_by,
      type: "team_member_joined",
      title: "انضمام عضو جديد للفريق",
      message: `${profile?.full_name ?? row.email} قبل الدعوة وانضم إلى المكتب.`,
    });
  }

  return {
    state: "joined",
    organizationId: row.organization_id,
    orgName,
    role: row.role,
    alreadyMember: !!existing && existing.status === "active",
  };
}
