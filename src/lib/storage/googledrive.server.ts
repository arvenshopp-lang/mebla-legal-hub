/**
 * محرك سحابة جوجل درايف للمكتب (Google Drive Cloud Storage Engine)
 */
import { storageFetch } from "./http.server";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_DRIVE_API = "https://www.googleapis.com/drive/v3";
const GOOGLE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";

export interface GoogleDriveConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function getGoogleDriveConfig(): GoogleDriveConfig {
  const clientId =
    process.env.GOOGLE_DRIVE_CLIENT_ID ||
    process.env.GOOGLE_CALENDAR_CLIENT_ID ||
    "433102357816-ciupjtacejjl4no0btu77dqbc8bn8fvt.apps.googleusercontent.com";
  const clientSecret =
    process.env.GOOGLE_DRIVE_CLIENT_SECRET ||
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET ||
    "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";
  const redirectUri =
    process.env.GOOGLE_DRIVE_REDIRECT_URI || "https://mehlalex.com/api/integrations/googledrive/callback";

  return { clientId, clientSecret, redirectUri };
}

/** توليد رابط تفويض OAuth لجوجل درايف */
export function getGoogleDriveAuthUrl(state: string): string {
  const config = getGoogleDriveConfig();
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email",
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/** رفع ملف إلى Google Drive */
export async function uploadFileToGoogleDrive(
  accessToken: string,
  options: {
    folderName: string;
    fileName: string;
    fileContent: ArrayBuffer | Uint8Array;
    contentType?: string;
  },
): Promise<{ success: boolean; fileId?: string; webViewLink?: string; error?: string }> {
  try {
    const boundary = "-------314159265358979323846";
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadata = {
      name: options.fileName,
      mimeType: options.contentType || "application/octet-stream",
      description: `مستند تم رفعه من منصة مِهلة القانونية - ${options.folderName}`,
    };

    const multipartRequestBody = Buffer.concat([
      Buffer.from(
        delimiter +
          "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
          JSON.stringify(metadata) +
          delimiter +
          `Content-Type: ${options.contentType || "application/octet-stream"}\r\n\r\n`,
      ),
      Buffer.from(options.fileContent),
      Buffer.from(closeDelimiter),
    ]);

    const res = await storageFetch(GOOGLE_UPLOAD_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: multipartRequestBody,
    });

    if (!res.ok) {
      const errText = res.text();
      return { success: false, error: `فشل الرفع إلى Google Drive: ${errText}` };
    }

    const data = (res.json()) as { id: string; name: string };
    return {
      success: true,
      fileId: data.id,
      webViewLink: `https://drive.google.com/file/d/${data.id}/view`,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "تعذر الرفع إلى Google Drive",
    };
  }
}
