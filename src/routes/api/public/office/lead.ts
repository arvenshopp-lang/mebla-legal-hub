import { createFileRoute } from "@tanstack/react-router";

const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-robots-tag": "noindex, nofollow",
};

const MAX_BODY = 8 * 1024;

/** استقبال طلب استشارة من الصفحة العامة — لا يقبل أي معرّف مكتب من الزائر. */
export const Route = createFileRoute("/api/public/office/lead")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        if (raw.length > MAX_BODY) {
          return new Response(JSON.stringify({ ok: false, message: "حجم الطلب أكبر من المسموح." }), {
            status: 413,
            headers: HEADERS,
          });
        }
        let payload: unknown;
        try {
          payload = JSON.parse(raw || "{}");
        } catch {
          return new Response(JSON.stringify({ ok: false, message: "تحقق من الحقول المدخلة." }), {
            status: 400,
            headers: HEADERS,
          });
        }
        if (payload && typeof payload === "object") {
          delete (payload as Record<string, unknown>)["organization_id"];
          delete (payload as Record<string, unknown>)["organizationId"];
        }

        const { submitPublicLead, LeadError } = await import("@/lib/office-public.server");
        try {
          const outcome = await submitPublicLead(payload, {
            ip:
              request.headers.get("cf-connecting-ip") ??
              request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
              null,
            referer: request.headers.get("referer"),
          });
          return new Response(JSON.stringify(outcome), { status: 200, headers: HEADERS });
        } catch (error) {
          const message =
            error instanceof LeadError ? error.message : "تعذّر إرسال الطلب حالياً، حاول مرة أخرى.";
          return new Response(JSON.stringify({ ok: false, message }), { status: 400, headers: HEADERS });
        }
      },
    },
  },
});
