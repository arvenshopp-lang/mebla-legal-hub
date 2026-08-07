import { createFileRoute, Link } from "@tanstack/react-router";
import { publicSiteQueryOptions } from "@/lib/public-site.query";
import { PageHeading, PublicShell } from "@/components/marketing/public-shell";
import { useSurfaceHref } from "@/hooks/use-surface-guard";

const TITLE = "كيف تستخدم مِهلة — دليل البدء";
const DESCRIPTION =
  "خطوات تشغيل مكتبك على منصة مِهلة: إنشاء الحساب، إضافة الفريق والعملاء، تسجيل القضايا والجلسات والمهل، ثم مشاركة المستندات ومتابعة العميل.";

export const Route = createFileRoute("/how-it-works")({
  loader: ({ context }) => context.queryClient.ensureQueryData(publicSiteQueryOptions()),
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://mehlalex.com/how-it-works" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://mehlalex.com/how-it-works" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "HowTo",
          name: "كيف تستخدم منصة مِهلة",
          inLanguage: "ar",
          step: [
            { "@type": "HowToStep", name: "أنشئ حساب المكتب" },
            { "@type": "HowToStep", name: "أضف الفريق وحدّد الصلاحيات" },
            { "@type": "HowToStep", name: "سجّل العملاء والقضايا" },
            { "@type": "HowToStep", name: "أدرج الجلسات والمهل" },
            { "@type": "HowToStep", name: "نظّم المستندات" },
            { "@type": "HowToStep", name: "شارك المتابعة مع العميل" },
          ],
        }),
      },
    ],
  }),
  component: HowItWorksRoute,
});

const STEPS = [
  {
    title: "أنشئ حساب المكتب",
    body: "سجّل بالبريد الإلكتروني الرسمي للمكتب، ثم أكمل بيانات الكيان النظامية. يصبح منشئ الحساب مالكاً له، وهو صاحب الصلاحية العليا على بيانات المكتب.",
    detail: "يدخل المكتب في نطاق بيانات مستقل تماماً منذ اللحظة الأولى.",
  },
  {
    title: "أضف الفريق وحدّد الصلاحيات",
    body: "ادعُ المحامين والمساعدين القانونيين عبر دعوة بريدية، وامنح كل عضو الدور المناسب: مالك، مدير، محام، مساعد قانوني، أو مطّلع.",
    detail: "تُطبَّق الصلاحيات على مستوى الخادم، لا على مستوى الواجهة فقط.",
  },
  {
    title: "سجّل العملاء والقضايا",
    body: "أضف العميل مرة واحدة (فرد، شركة، أو جهة)، ثم اربط به قضاياه. لكل قضية رقمها ومحكمتها ودائرتها وموضوعها وحالتها الحالية.",
    detail: "يمكن ربط أطراف القضية بصلاحيات محدودة لكل طرف على حدة.",
  },
  {
    title: "أدرج الجلسات والمهل",
    body: "سجّل مواعيد الجلسات والمهل النظامية مثل الاعتراض والاستئناف والردود. تظهر المواعيد القريبة في لوحة المكتب وتصل تنبيهاتها للمعنيين.",
    detail: "التنبيهات خدمة مساندة لتقليل احتمال السهو، ولا تُغني عن المتابعة المهنية.",
  },
  {
    title: "نظّم المستندات",
    body: "ارفع مستندات القضية وصنّفها، أو أرسل طلب مستند للعميل عبر رابط رفع مؤقت لا يحتاج حساباً. يمكن استخراج نص المستندات للبحث داخلها.",
    detail: "تُحفظ الملفات في تخزين خاص، والعرض والتحميل عبر روابط مؤقتة تنتهي صلاحيتها.",
  },
  {
    title: "شارك المتابعة مع العميل",
    body: "امنح العميل رمز متابعة من عشرة أرقام يعرض حالة قضيته والتحديثات التي صرّح المكتب بإظهارها فقط.",
    detail: "لا تُعرض للعميل مستندات ولا ملاحظات داخلية ولا بيانات أطراف أخرى.",
  },
] as const;

function HowItWorksRoute() {
  const registerHref = useSurfaceHref("/register");

  return (
    <PublicShell>
      <PageHeading
        eyebrow="دليل البدء"
        title="كيف تستخدم مِهلة"
        intro="ست خطوات لتشغيل المكتب على المنصة، من إنشاء الحساب إلى متابعة العميل. لا يحتاج التشغيل أي إعداد تقني."
      />
      <div className="container-page max-w-3xl py-10 md:py-14">
        <ol className="space-y-4">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className="rounded-[var(--radius-m)] border border-border bg-surface p-5"
            >
              <div className="flex items-start gap-4">
                <span
                  className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[13px] font-bold tabular-nums text-primary"
                  aria-hidden
                >
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <h2 className="text-[15px] font-bold">{step.title}</h2>
                  <p className="mt-2 text-body-sm leading-7 text-muted-foreground">{step.body}</p>
                  <p className="mt-2 text-caption">{step.detail}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-12 rounded-[var(--radius-m)] border border-border bg-surface p-6">
          <h2 className="text-h4">جاهز للبدء؟</h2>
          <p className="mt-2 text-body-sm leading-7 text-muted-foreground">
            أنشئ حساب مكتبك الآن، أو راجع{" "}
            <Link
              to="/faq"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              الأسئلة الشائعة
            </Link>{" "}
            و
            <Link
              to="/security"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              {" "}
              معايير الأمان
            </Link>{" "}
            قبل التسجيل.
          </p>
          <a
            href={registerHref}
            className="mt-5 inline-flex min-h-11 items-center justify-center rounded-[var(--radius-m)] bg-primary px-6 text-[14px] font-semibold text-primary-foreground transition hover:bg-primary-hover"
          >
            إنشاء حساب المكتب
          </a>
        </div>
      </div>
    </PublicShell>
  );
}
