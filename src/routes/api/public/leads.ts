import { createFileRoute } from "@tanstack/react-router";

const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-robots-tag": "noindex, nofollow",
};

const MAX_BODY = 8 * 1024;

/** استقبال بيانات عميل محتمل من الموقع التسويقي العام (المحامية بيان). */
export const Route = createFileRoute("/api/public/leads")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        if (raw.length > MAX_BODY) {
          return new Response(
            JSON.stringify({ ok: false, message: "حجم الطلب أكبر من المسموح." }),
            { status: 413, headers: HEADERS },
          );
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

        const { submitMarketingLead, MarketingLeadError } = await import(
          "@/lib/marketing-lead.server"
        );
        try {
          const outcome = await submitMarketingLead(payload);
          return new Response(JSON.stringify(outcome), { status: 200, headers: HEADERS });
        } catch (error) {
          const message =
            error instanceof MarketingLeadError
              ? error.message
              : "تعذّر إرسال بياناتك حالياً، حاول مرة أخرى.";
          return new Response(JSON.stringify({ ok: false, message }), {
            status: 400,
            headers: HEADERS,
          });
        }
      },
    },
  },
});
