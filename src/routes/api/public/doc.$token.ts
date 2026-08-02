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

function failure(message: string, status = 403) {
  return new Response(message, {
    status,
    headers: { ...NO_STORE, "content-type": "text/plain; charset=utf-8" },
  });
}

export const Route = createFileRoute("/api/public/doc/$token")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const token = String(params.token ?? "");
        if (token.length < 20) return failure("رابط غير صالح.", 400);

        const [secure, shared, stamp] = await Promise.all([
          import("@/lib/secure-view/secure-view.server"),
          import("@/lib/secure-view/secure-view.shared"),
          import("@/lib/secure-view/stamp.server"),
        ]);

        let resolved: Awaited<ReturnType<typeof secure.consumeAccessToken>>;
        try {
          resolved = await secure.consumeAccessToken(token);
        } catch (error) {
          return failure((error as Error).message, 403);
        }

        try {
          const doc = await secure.loadDocumentForStamp(resolved.documentId);
          if (doc.organization_id !== resolved.organizationId) return failure("رابط غير صالح.", 403);
          const original = await secure.readOriginal(doc.file_path);

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
          const fallbackText =
            kind === "text" ? await secure.loadExtractedText(resolved.documentId) : null;

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
          return new Response(pdf as unknown as BodyInit, {
            headers: {
              ...NO_STORE,
              "content-type": "application/pdf",
              "content-length": String(pdf.byteLength),
              "accept-ranges": "none",
              "content-disposition": `${download ? "attachment" : "inline"}; filename="${encodeURIComponent(fileName)}"`,
            },
          });
        } catch (error) {
          return failure((error as Error).message || "تعذّر تجهيز نسخة العرض.", 500);
        }
      },
    },
  },
});
