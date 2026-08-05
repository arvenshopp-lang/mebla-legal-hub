const LOAD_ERROR = "تعذر تحميل المستند. الرابط غير صالح أو الملف غير متاح.";

function looksLikeHtml(bytes: Uint8Array): boolean {
  const prefix = new TextDecoder().decode(bytes.slice(0, 256)).trimStart().toLowerCase();
  return prefix.startsWith("<!doctype html") || prefix.startsWith("<html");
}

function isPdf(bytes: Uint8Array): boolean {
  return bytes.length >= 5 && new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
}

/** يجلب نسخة PDF المائية فقط، ويرفض صفحات HTML حتى لو أعادها المسار بحالة نجاح. */
export async function fetchWatermarkedPdf(endpoint: string): Promise<string> {
  const response = await fetch(new URL(endpoint, window.location.origin), {
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/pdf, application/json" },
    redirect: "follow",
  });
  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();

  if (!response.ok) {
    if (contentType.includes("application/json")) {
      const payload = (await response.json().catch(() => null)) as {
        message?: unknown;
        ref?: unknown;
      } | null;
      const message = typeof payload?.message === "string" ? payload.message : LOAD_ERROR;
      const ref = typeof payload?.ref === "string" ? `\nمعرّف التعرّف: ${payload.ref}` : "";
      throw new Error(`${message}${ref}`);
    }
    throw new Error(LOAD_ERROR);
  }

  if (!contentType.startsWith("application/pdf") || contentType.includes("text/html")) {
    throw new Error(LOAD_ERROR);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length || looksLikeHtml(bytes) || !isPdf(bytes)) throw new Error(LOAD_ERROR);

  return URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
}
