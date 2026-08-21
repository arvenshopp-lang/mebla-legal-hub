import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { NOINDEX_META } from "@/config/indexing";
import { MehlaLogo } from "@/components/brand/mehla-logo";

export const Route = createFileRoute("/upload/")({
  head: () => ({
    meta: [
      { title: "رفع المستندات — مِهلة" },
      {
        name: "description",
        content: "خدمة رفع المستندات الآمنة لعملاء مكاتب المحاماة عبر رابط خاص.",
      },
      NOINDEX_META,
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <main
      dir="rtl"
      className="grid min-h-dvh place-items-center bg-surface-muted px-4 text-foreground"
    >
      <div className="w-full max-w-md rounded-[var(--radius-l)] border border-border bg-surface p-8 text-center">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-[var(--radius-l)] bg-surface-muted">
          <ShieldCheck className="h-6 w-6 text-muted-foreground" />
        </div>
        <MehlaLogo size="md" className="mx-auto text-primary" />
        <h1 className="mt-3 text-base font-bold">هذه الصفحة تعمل عبر رابط خاص</h1>
        <p className="mt-2 text-sm leading-7 text-muted-foreground">
          لرفع مستنداتك، استخدم الرابط الذي أرسله لك مكتب المحاماة. كل رابط صالح لمرة واحدة وتنتهي
          صلاحيته بعد الاستخدام.
        </p>
      </div>
    </main>
  );
}
