/**
 * وصول مضبوط النوع إلى مساحة OAuth في عميل المصادقة.
 * يقع في وحدة مستقلة لأن مسار الموافقة يستخدمه في خيارات المسار وفي المكوّن معاً،
 * وتقسيم الحزمة يفصل المكوّن عن وحدة المسار.
 */
import { supabase } from "@/integrations/supabase/client";

type OAuthClient = { name?: string; client_name?: string; logo_uri?: string };

export type AuthorizationDetails = {
  client?: OAuthClient | null;
  scope?: string | null;
  redirect_url?: string | null;
  redirect_to?: string | null;
};

type OAuthResponse<T> = Promise<{ data: T | null; error: { message: string } | null }>;

type OAuthNamespace = {
  getAuthorizationDetails: (id: string) => OAuthResponse<AuthorizationDetails>;
  approveAuthorization: (id: string) => OAuthResponse<AuthorizationDetails>;
  denyAuthorization: (id: string) => OAuthResponse<AuthorizationDetails>;
};

export function oauth(): OAuthNamespace {
  return (supabase.auth as unknown as { oauth: OAuthNamespace }).oauth;
}
