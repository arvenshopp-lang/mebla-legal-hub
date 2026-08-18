/**
 * محرك سحابة مايكروسوفت ون درايف وشيربوينت (Microsoft OneDrive Cloud Engine)
 */
import { storageFetch } from "./http.server";

const MS_AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const MS_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const MS_GRAPH_API = "https://graph.microsoft.com/v1.0";

export interface OneDriveConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function getOneDriveConfig(): OneDriveConfig | null {
  const clientId =
    process.env.ONEDRIVE_CLIENT_ID || process.env.MICROSOFT_CALENDAR_CLIENT_ID;
  const clientSecret =
    process.env.ONEDRIVE_CLIENT_SECRET || process.env.MICROSOFT_CALENDAR_CLIENT_SECRET;
  const redirectUri =
    process.env.ONEDRIVE_REDIRECT_URI || "https://mehlalex.com/api/integrations/onedrive/callback";

  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri };
}

/** توليد رابط تفويض OAuth لمايكروسوفت ون درايف */
export function getOneDriveAuthUrl(state: string): string | null {
  const config = getOneDriveConfig();
  if (!config) return null;

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "openid profile email offline_access Files.ReadWrite Files.ReadWrite.All",
    response_mode: "query",
    state,
  });

  return `${MS_AUTH_URL}?${params.toString()}`;
}

/** استبدال رمز التفويض بتوكنات ون درايف */
export async function exchangeOneDriveCode(
  code: string,
): Promise<{ accessToken: string; refreshToken?: string; expiresIn: number } | null> {
  const config = getOneDriveConfig();
  if (!config) return null;

  const res = await storageFetch(MS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }).toString(),
  });

  if (!res.ok) return null;
  const data = (res.json()) as { access_token: string; refresh_token?: string; expires_in: number };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

/** تجديد توكن الوصول */
export async function refreshOneDriveToken(refreshToken: string): Promise<string | null> {
  const config = getOneDriveConfig();
  if (!config) return null;

  const res = await storageFetch(MS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
      scope: "Files.ReadWrite Files.ReadWrite.All offline_access",
    }).toString(),
  });

  if (!res.ok) return null;
  const data = (res.json()) as { access_token: string };
  return data.access_token;
}

/** رفع ملف إلى مسار محدد في OneDrive */
export async function uploadFileToOneDrive(
  accessToken: string,
  options: {
    folderPath: string; // e.g. "MEHLA/القضايا/قضية 45109823/المستندات"
    fileName: string;
    fileContent: ArrayBuffer | Uint8Array | Buffer;
    contentType?: string;
  },
): Promise<{ success: boolean; fileId?: string; webUrl?: string; fullPath?: string; error?: string }> {
  try {
    // Sanitize path for OneDrive
    const cleanFolder = options.folderPath.replace(/^\/+|\/+$/g, "");
    const cleanFileName = options.fileName.replace(/[/\\?%*:|"<>]/g, "-");
    const fullItemPath = `${cleanFolder}/${cleanFileName}`;
    const encodedPath = encodeURIComponent(fullItemPath).replace(/%2F/g, "/");

    const uploadUrl = `${MS_GRAPH_API}/me/drive/root:/${encodedPath}:/content`;

    const res = await storageFetch(uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": options.contentType || "application/octet-stream",
      },
      body:
        options.fileContent instanceof Uint8Array
          ? options.fileContent
          : new Uint8Array(options.fileContent as ArrayBuffer),
    });

    if (!res.ok) {
      const errText = res.text();
      return { success: false, error: `فشل الرفع إلى OneDrive: ${errText}` };
    }

    const fileData = (res.json()) as { id: string; webUrl: string; name: string };
    return {
      success: true,
      fileId: fileData.id,
      webUrl: fileData.webUrl,
      fullPath: fullItemPath,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "تعذر الرفع إلى OneDrive",
    };
  }
}
