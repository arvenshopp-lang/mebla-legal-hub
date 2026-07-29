import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/upload/")({
  head: () => ({
    meta: [
      { title: "رفع المستندات — مِهلة" },
      { name: "description", content: "خدمة رفع المستندات الآمنة لعملاء مكاتب المحاماة عبر رابط خاص." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <main dir="rtl" className="grid min-h-dvh place-items-center bg-[#F5F3EE] px-4 text-[#123C32]">
      <div className="w-full max-w-md rounded-3xl border border-[#123C32]/10 bg-white p-8 text-center">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-[#F5F3EE]">
          <ShieldCheck className="h-6 w-6 text-[#123C32]/60" />
        </div>
        <div className="text-lg font-extrabold tracking-tight">مِهلة</div>
        <h1 className="mt-3 text-base font-bold">هذه الصفحة تعمل عبر رابط خاص</h1>
        <p className="mt-2 text-sm leading-7 text-[#123C32]/70">
          لرفع مستنداتك، استخدم الرابط الذي أرسله لك مكتب المحاماة. كل رابط صالح لمرة واحدة وتنتهي صلاحيته بعد الاستخدام.
        </p>
      </div>
    </main>
  );
}
