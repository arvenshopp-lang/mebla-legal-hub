import { createFileRoute } from "@tanstack/react-router";

/**
 * The only route that ever touches a stored document. It accepts an opaque,
 * expiring, use-limited ticket, reads the original with the service role and
 * streams back a freshly watermarked PDF. The storage path, the bucket and any
 * signed storage URL stay on the server.
 */

const NO_STORE = {
  "cache-control": "no-store, no-cache, must-revalidate, private",
  "x-robots-tag": "noindex, nofollow",
  "x-content-type-options": "nosniff",
};

const PUBLIC_LOAD_ERROR = "تعذر تحميل المستند. الرابط غير صالح أو الملف غير متاح.";

/**
 * لا يُعاد للمستخدم إلا نص عام + معرّف تعرّف آمن؛ التفاصيل التقنية تُحفظ في
 * سجل الأعطال الداخلي القابل للبحث.
 */
async function failure(
  publicMessage: string,
  status: number,
  detail: {
    action: string;
    error: unknown;
    documentId?: string | null;
    organizationId?: string | null;
    path: string;
    metadata?: Record<string, unknown>;
  },
) {
  const { logFailure } = await import("@/lib/observability/failure-log.server");
  const ref = await logFailure({
    surface: "secure_view",
    action: detail.action,
    error: detail.error,
    httpStatus: status,
    documentId: detail.documentId ?? null,
    organizationId: detail.organizationId ?? null,
    path: detail.path,
    metadata: detail.metadata,
  });
  return Response.json(
    { error: "document_unavailable", message: publicMessage, ref },
    {
      status,
      headers: {
        ...NO_STORE,
        "content-type": "application/json; charset=utf-8",
        "x-failure-ref": ref,
      },
    },
  );
}

/**
 * عملاء البريد وتطبيقات المحادثة يُلحقون أحرف ترقيم أو قوساً أو نقاطاً بنهاية
 * الرابط عند اكتشافه تلقائياً. الرمز نفسه محدود بالحروف والأرقام و`-_`، لذلك
 * نُنظّف اللواحق غير المطابقة قبل الحكم على الرابط بأنه غير صالح — بدل رفض
 * رابط صحيح بسبب حرف أضافه بريد المستخدم.
 */
const TOKEN_CHARS = /^[A-Za-z0-9_-]+$/;
function normalizeToken(raw: string): string {
  let token = raw.trim();
  try {
    token = decodeURIComponent(token).trim();
  } catch {
    /* الرمز غير مُرمَّز — يُستخدم كما هو */
  }
  // إزالة اللواحق الشائعة: نقطة، فاصلة، قوس، علامة تعجّب، حرف حذف عربي/لاتيني.
  token = token.replace(/[\s.,;:!?)"'»<>\u2026\u060C\u061B\u061F]+$/u, "");
  return token;
}

export const Route = createFileRoute("/api/public/doc/$token")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const rawToken = String(params.token ?? "");
        const token = normalizeToken(rawToken);
        const path = new URL(request.url).pathname;
        if (token.length < 20 || !TOKEN_CHARS.test(token))
          return failure(PUBLIC_LOAD_ERROR, 400, {
            action: "token.malformed",
            error: token.length < 20 ? "رمز قصير" : "رمز يحتوي أحرفاً غير مسموحة",
            path,
            // لا يُحفظ الرمز نفسه أبداً؛ فقط ما يكفي لتشخيص سبب التلف.
            metadata: {
              raw_length: rawToken.length,
              normalized_length: token.length,
              trimmed_suffix: rawToken.length !== token.length,
              referer: request.headers.get("referer") ? "present" : "none",
            },
          });

        const [secure, shared, stamp] = await Promise.all([
          import("@/lib/secure-view/secure-view.server"),
          import("@/lib/secure-view/secure-view.shared"),
          import("@/lib/secure-view/stamp.server"),
        ]);

        let resolved: Awaited<ReturnType<typeof secure.consumeAccessToken>>;
        try {
          resolved = await secure.consumeAccessToken(token);
        } catch (error) {
          return failure(PUBLIC_LOAD_ERROR, 403, { action: "token.consume", error, path });
        }

        try {
          const doc = await secure.loadDocumentForStamp(resolved.documentId);
          if (doc.organization_id !== resolved.organizationId)
            return failure("رابط غير صالح.", 403, {
              action: "token.organization_mismatch",
              error: "عدم تطابق المكتب",
              documentId: resolved.documentId,
              organizationId: resolved.organizationId,
              path,
            });
          let storageRead: Awaited<ReturnType<typeof secure.readOriginal>>;
          try {
            storageRead = await secure.readOriginal(doc.file_path, {
              allowProcessingFormat: resolved.kind === "process",
              documentId: resolved.documentId,
              organizationId: doc.organization_id,
            });
          } catch (error) {
            const trace = error instanceof secure.StorageReadError ? error.trace : undefined;
            console.error("[secure-document-storage]", {
              document_id: resolved.documentId,
              temporary_link_id: resolved.id,
              bucket: trace?.bucket ?? "documents",
              storage_path: trace?.storagePath ?? doc.file_path,
              signed_url_host: trace?.signedUrlHost ?? null,
              response_status: trace?.status ?? null,
              content_type: trace?.contentType ?? null,
              final_response_host: trace?.finalUrl ?? null,
              error_code: trace?.errorCode ?? "STORAGE_READ_FAILED",
            });
            const { logFailure } = await import("@/lib/observability/failure-log.server");
            const ref = await logFailure({
              surface: "secure_view",
              action: "storage.read",
              error,
              errorCode: trace?.errorCode ?? "STORAGE_READ_FAILED",
              httpStatus: trace?.status ?? 502,
              documentId: resolved.documentId,
              organizationId: resolved.organizationId,
              path,
              metadata: {
                temporary_link_id: resolved.id,
                bucket: trace?.bucket ?? "documents",
                storage_path: trace?.storagePath ?? doc.file_path,
                signed_url_host: trace?.signedUrlHost ?? null,
                response_status: trace?.status ?? null,
                content_type: trace?.contentType ?? null,
                final_response_host: trace?.finalUrl ?? null,
              },
            });
            return Response.json(
              { error: "document_unavailable", message: PUBLIC_LOAD_ERROR, ref },
              {
                status: 502,
                headers: {
                  ...NO_STORE,
                  "content-type": "application/json; charset=utf-8",
                  "x-failure-ref": ref,
                },
              },
            );
          }
          const original = storageRead.bytes;

          // تذكرة المعالجة الداخلية تُعيد البايتات الأصلية لمحرك الاستخراج فقط،
          // ولا تُصدر إلا بعد التحقق من الصلاحية، وتُستهلك مرة واحدة.
          if (resolved.kind === "process") {
            return new Response(original as unknown as BodyInit, {
              headers: {
                ...NO_STORE,
                "content-type": doc.file_type || "application/octet-stream",
                "content-disposition": "inline",
              },
            });
          }

          const kind = shared.viewableKind(doc.file_name, doc.file_type);
          // النص المستخرج يُستخدم كنسخة عرض للصيغ غير القابلة للختم، وكذلك
          // كخطة بديلة إن كان الملف الأصلي تالفاً أو غير قابل للقراءة.
          const fallbackText = await secure.loadExtractedText(resolved.documentId);

          const pdf = await stamp.buildWatermarkedPdf({
            bytes: original,
            kind,
            mimeType: doc.file_type,
            fallbackText,
            lines: [resolved.watermarkOffice, resolved.watermarkUser],
            note: resolved.watermarkNote,
            title: doc.file_name,
          });

          if (resolved.kind === "share") {
            await secure.logDocumentAccess({
              organizationId: resolved.organizationId,
              documentId: doc.id,
              documentName: doc.file_name,
              shareTokenId: resolved.id,
              userId: resolved.createdBy,
              userName: resolved.watermarkUser,
              officeName: resolved.watermarkOffice,
              action: "VIEW",
              sourcePage: "share-link",
            });
          }

          const download = new URL(request.url).searchParams.get("dl") === "1";
          const fileName = shared.safePdfName(doc.file_name);
          const asciiFileName = "mehla-watermarked-document.pdf";
          return new Response(pdf as unknown as BodyInit, {
            headers: {
              ...NO_STORE,
              "content-type": "application/pdf",
              "content-length": String(pdf.byteLength),
              "accept-ranges": "none",
              "content-disposition": `${download ? "attachment" : "inline"}; filename="${asciiFileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
            },
          });
        } catch (error) {
          return failure(PUBLIC_LOAD_ERROR, 500, {
            action: "stamp.build",
            error,
            documentId: resolved.documentId,
            organizationId: resolved.organizationId,
            path,
          });
        }
      },
    },
  },
});
