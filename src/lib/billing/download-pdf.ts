/** تنزيل مستند PDF قادم من الخادم بصيغة base64 (حدود دوال الخادم تنقل JSON فقط). */
export type PdfPayload = { fileName: string; base64: string };

export function downloadPdfPayload(payload: PdfPayload): void {
  const bytes = Uint8Array.from(atob(payload.base64), (char) => char.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = payload.fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
