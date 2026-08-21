import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { fetchWatermarkedPdf } from "@/lib/secure-view/fetch-watermarked";
import { NOINDEX_META } from "@/config/indexing";

/**
 * Public share surface. The recipient only ever sees the watermarked copy that
 * is streamed from the ticket endpoint; the original file, its storage path and
 * its internal id are never part of the page.
 */

export const Route = createFileRoute("/share/$token")({
  head: () => ({
    meta: [
      { title: "مستند مشترك — مِهلة | MehlaLex" },
      {
        name: "description",
        content:
          "نسخة عرض مؤقتة تحمل علامة مائية باسم المكتب والمستخدم الذي أنشأ المشاركة، عبر منصة مِهلة لإدارة أعمال المحاماة.",
      },
      NOINDEX_META,
      { property: "og:title", content: "مستند مشترك — مِهلة | MehlaLex" },
      {
        property: "og:description",
        content: "نسخة عرض مؤقتة بعلامة مائية من منصة مِهلة لإدارة أعمال المحاماة.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SharePage,
});

function SharePage() {
  const { token } = Route.useParams();
  const [source, setSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    void (async () => {
      try {
        const nextObjectUrl = await fetchWatermarkedPdf(
          `/api/public/doc/${encodeURIComponent(token)}`,
        );
        if (cancelled) return;
        objectUrl = nextObjectUrl;
        setSource(objectUrl);
      } catch (cause) {
        if (!cancelled)
          setError(
            cause instanceof Error
              ? cause.message
              : "تعذر تحميل المستند. الرابط غير صالح أو الملف غير متاح.",
          );
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [token]);

  return (
    <main className="min-h-screen bg-background px-4 py-8" dir="rtl">
      <div className="mx-auto w-full max-w-4xl space-y-4">
        <header className="space-y-1 text-center">
          <h1 className="text-xl font-semibold text-primary">مِهلة | MehlaLex</h1>
          <p className="text-sm text-muted-foreground">
            نسخة عرض مؤقتة بعلامة مائية. الرابط محدود المدة وقابل للإلغاء في أي وقت.
          </p>
        </header>
        {error ? (
          <div
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive"
          >
            {error}
          </div>
        ) : !source ? (
          <div className="flex h-[78vh] w-full items-center justify-center rounded-xl border border-border bg-surface-muted/50 text-sm text-muted-foreground">
            جاري تجهيز النسخة المائية…
          </div>
        ) : (
          <iframe
            title="المستند المشترك"
            src={source}
            sandbox="allow-same-origin allow-downloads"
            className="h-[78vh] w-full rounded-xl border border-border bg-surface shadow-sm"
          />
        )}
        <p className="text-center text-xs text-muted-foreground">
          يُسجَّل كل فتح لهذا الرابط داخل سجل التدقيق الخاص بالمكتب.
        </p>
      </div>
    </main>
  );
}
