import * as React from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { InviteEmail } from "@/lib/email-templates/invite";
import { SITE_NAME, SITE_URL, sendAppEmail } from "@/lib/email/app-email.server";
import {
  maskEmail,
  normalizeEmail,
  type InviteAcceptResult,
  type InvitePreview,
  type InvitePreviewState,
  type InviteRole,
} from "./invitations.shared";
import { INVITE_VALID_DAYS } from "./invitations.shared";

type UserClient = SupabaseClient<Database>;

const ROLE_LABEL: Record<InviteRole, string> = {
  admin: "مدير المكتب",
  lawyer: "محامٍ",
  legal_assistant: "مساعد قانوني",
  viewer: "مطالع",
};

/** رمز دعوة عشوائي 64 حرفاً (base64url) لا يُشتق منه أي معرف. */
function generateInviteToken(): string {
  const bytes = new Uint8Array(48);
  crypto.getRandomValues(bytes);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** يمنع تسريب روابط الدعوة إلى نطاق خارجي عبر أصل مزوّر من العميل. */
function safeOrigin(origin: string): string {
  try {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();
    const allowed =
      host === "mehlalex.com" ||
      host.endsWith(".mehlalex.com") ||
      host === "localhost" ||
      host.endsWith(".lovable.app");
    if (!allowed) return SITE_URL;
    return `${url.protocol}//${url.host}`;
  } catch {
    return SITE_URL;
  }
}

/**
 * ينشئ دعوة فريق جديدة بصلاحيات المستخدم نفسه (RLS تفرض أن يكون مديراً)،
 * يُلغي أي دعوة معلّقة لنفس البريد، ثم يرسل رسالة الدعوة بهوية مِهلة.
 */
export async function createTeamInvitation(input: {
  supabase: UserClient;
  userId: string;
  organizationId: string;
  email: string;
  role: InviteRole;
  origin: string;
}): Promise<{
  token: string;
  inviteUrl: string;
  emailSent: boolean;
  emailReason?: string;
  emailRef?: string;
}> {
  const email = normalizeEmail(input.email);

  const { data: membership, error: membershipError } = await input.supabase
    .from("organization_members")
    .select("role, status")
    .eq("organization_id", input.organizationId)
    .eq("user_id", input.userId)
    .maybeSingle();

  if (membershipError) throw new Error("INVITE_LOOKUP_FAILED");
  if (!membership || membership.status !== "active" || !["owner", "admin"].includes(membership.role)) {
    throw new Error("FORBIDDEN");
  }

  await input.supabase
    .from("organization_invitations")
    .update({ status: "revoked" })
    .eq("organization_id", input.organizationId)
    .eq("email", email)
    .eq("status", "pending");

  const token = generateInviteToken();
  const expiresAt = new Date(Date.now() + INVITE_VALID_DAYS * 86_400_000).toISOString();

  const { data: created, error } = await input.supabase
    .from("organization_invitations")
    .insert({
      organization_id: input.organizationId,
      email,
      role: input.role,
      token,
      status: "pending",
      expires_at: expiresAt,
      invited_by: input.userId,
    })
    .select("id, token")
    .single();

  if (error || !created) throw new Error(error?.message ?? "INVITE_CREATE_FAILED");

  const { data: org } = await input.supabase
    .from("organizations")
    .select("name")
    .eq("id", input.organizationId)
    .maybeSingle();

  const { data: inviter } = await input.supabase
    .from("profiles")
    .select("full_name")
    .eq("id", input.userId)
    .maybeSingle();

  const inviteUrl = `${safeOrigin(input.origin)}/invite/${created.token}`;
  const result = await sendAppEmail({
    to: email,
    subject: `دعوة للانضمام إلى ${org?.name ?? "مكتب المحاماة"} — مِهلة`,
    label: "team-invite",
    idempotencyKey: `team-invite-${created.id}`,
    organizationId: input.organizationId,
    userId: input.userId,
    element: React.createElement(InviteEmail, {
      siteName: SITE_NAME,
      siteUrl: SITE_URL,
      confirmationUrl: inviteUrl,
      orgName: org?.name ?? undefined,
      roleLabel: ROLE_LABEL[input.role],
      inviterName: inviter?.full_name ?? undefined,
    }),
  });

  return {
    token: created.token,
    inviteUrl,
    emailSent: result.sent,
    ...(result.reason ? { emailReason: result.reason } : {}),
    ...(result.ref ? { emailRef: result.ref } : {}),
  };
}

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

  // سجل تدقيق غير قابل للتعديل: قبول الدعوة وإبطال الرابط نهائياً.
  await supabaseAdmin.from("activity_logs").insert({
    organization_id: row.organization_id,
    user_id: userId,
    action: "member.invite_accepted",
    entity_type: "organization_invitation",
    entity_id: row.id,
    description: `قبول دعوة الانضمام بصفة ${ROLE_LABEL[row.role]}`,
    metadata: {
      role: row.role,
      invited_email: maskEmail(row.email),
      already_member: !!existing && existing.status === "active",
    } as never,
  });

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
