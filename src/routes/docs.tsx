import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, FileText, HelpCircle, ScrollText, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/docs")({
  head: () => ({
    meta: [
      { title: "مركز المساعدة — مِهلة" },
      { name: "description", content: "دليل استخدام منصة مِهلة، الأسئلة الشائعة، توثيق API، الشروط وسياسة الخصوصية." },
      { property: "og:title", content: "مركز المساعدة — مِهلة" },
      { property: "og:description", content: "كل ما تحتاجه لاستخدام منصة مِهلة القانونية." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

const SECTIONS = [
  { icon: BookOpen, title: "دليل الاستخدام", body: "خطوات إنشاء المكتب، إضافة العملاء والقضايا، وإدارة الجلسات والمهل." },
  { icon: HelpCircle, title: "الأسئلة الشائعة", body: "إجابات عن الاشتراك، الصلاحيات، عزل بيانات المكاتب، واستعادة الحساب." },
  { icon: FileText, title: "توثيق API", body: "واجهة مِهلة الرسمية على api.mehlalex.com عبر REST وWebhooks." },
  { icon: ScrollText, title: "الشروط والأحكام", body: "شروط استخدام المنصة والتزامات المكتب والمستخدمين." },
  { icon: ShieldCheck, title: "سياسة الخصوصية", body: "كيفية حفظ البيانات وحمايتها ومشاركتها داخل المنصة." },
];

function Page() {
  return (
    <main dir="rtl" className="min-h-dvh bg-[#F5F3EE] px-4 py-10 text-[#123C32] sm:py-16">
      <div className="mx-auto w-full max-w-3xl">
        <div className="text-center">
          <div className="text-xl font-extrabold tracking-tight">مِهلة</div>
          <h1 className="mt-4 text-3xl font-bold">مركز المساعدة</h1>
          <p className="mt-2 text-sm text-[#123C32]/65">
            نعمل على إثراء هذا المركز بالمحتوى الكامل. تجد أدناه أقسام الدعم الرسمية للمنصة.
          </p>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {SECTIONS.map((s) => (
            <section key={s.title} className="rounded-3xl border border-[#123C32]/10 bg-white p-6">
              <s.icon className="h-5 w-5 text-[#C9A961]" />
              <h2 className="mt-3 text-sm font-bold">{s.title}</h2>
              <p className="mt-1.5 text-xs leading-6 text-[#123C32]/70">{s.body}</p>
              <span className="mt-3 inline-block rounded-full bg-[#F5F3EE] px-2.5 py-1 text-[10px] text-[#123C32]/60">قريباً</span>
            </section>
          ))}
        </div>

        <div className="mt-8 text-center">
          <Link to="/" className="text-xs text-[#123C32]/60 hover:text-[#123C32]">العودة للموقع الرئيسي</Link>
        </div>
      </div>
    </main>
  );
}
