/**
 * صفحة عامة: منهجية مؤشر الإنجاز التشغيلي وبيان الخصوصية.
 * محتوى شرحي فقط — لا تقرأ أي بيانات مكتب، وكل رقم فيها مشتق من ثوابت المحرك.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { publicSiteQueryOptions } from "@/lib/public-site.query";
import { PageHeading, PublicShell } from "@/components/marketing/public-shell";
import { socialPreviewMeta } from "@/config/brand-assets";
import {
  MIN_DEADLINES_OR_HEARINGS,
  MIN_ELIGIBLE_ITEMS,
  MIN_ORGANIZATION_AGE_DAYS,
  MIN_TRACKING_DAYS,
  PUBLIC_EXCLUDED_DATA,
  PUBLIC_PRIVACY_NOTE,
  PUBLIC_RANKING_DISCLAIMER,
  PUBLIC_RESULTS_COUNT,
  PUBLIC_VISIBLE_FIELDS,
  SCORE_DIMENSION_HINTS,
  SCORE_DIMENSION_LABELS,
  SCORE_WEIGHTS,
  SCORE_WINDOW_DAYS,
  type ScoreDimensionKey,
} from "@/lib/operational-score/score.shared";

const TITLE = "كيف يُحسب مؤشر الإنجاز التشغيلي | مِهلة";
const DESCRIPTION =
  "شرح واضح لطريقة احتساب مؤشر الإنجاز التشغيلي في مِهلة: الأوزان، نافذة القياس، شروط الأهلية، وبيان الخصوصية الذي يؤكد أن الحساب لا يمس مستندات المكتب أو بيانات عملائه.";
const CANONICAL = "https://mehlalex.com/operational-score";

const DIMENSION_ORDER: ScoreDimensionKey[] = ["deadlines", "tasks", "hearings"];

const FAQ = [
  {
    q: "هل تطّلع مِهلة على مستنداتي أو بيانات عملائي لاحتساب المؤشر؟",
    a: "لا. الحساب يقرأ مواعيد الأعمال وحالات إنجازها فقط (مستحق/منجز، في الموعد/متأخر). لا يقرأ محتوى المستندات ولا عناوين القضايا ولا أسماء العملاء ولا أي بيان مالي.",
  },
  {
    q: "هل يظهر مكتبي للعامة تلقائياً؟",
    a: "لا. الظهور العام اختياري ويحتاج موافقة صريحة من مالك المكتب أو مديره من إعدادات المكتب، ويمكن إيقافه في أي وقت فيختفي المكتب من القائمة.",
  },
  {
    q: "ما الذي يظهر للعامة عند الموافقة؟",
    a: "اسم المكتب المعتمد وشعاره ونسبة المؤشر وترتيبه فقط. لا تظهر أي أعداد قضايا أو عملاء أو موظفين ولا أي تفاصيل تشغيلية أخرى.",
  },
  {
    q: "هل المؤشر تقييم لجودة العمل القانوني؟",
    a: PUBLIC_RANKING_DISCLAIMER,
  },
  {
    q: "كل متى يتم التحديث؟",
    a: "تُحدَّث نتائج المكاتب دورياً كل ست ساعات، ويرى المشترك نتيجة مكتبه محسوبة لحظياً داخل لوحة التحكم.",
  },
];

export const Route = createFileRoute("/operational-score")({
  loader: ({ context }) => context.queryClient.ensureQueryData(publicSiteQueryOptions()),
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "article" },
      { property: "og:url", content: CANONICAL },
      ...socialPreviewMeta({ title: TITLE, description: DESCRIPTION }),
    ],
    links: [{ rel: "canonical", href: CANONICAL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          inLanguage: "ar",
          name: TITLE,
          mainEntity: FAQ.map((item) => ({
            "@type": "Question",
            name: item.q,
            acceptedAnswer: { "@type": "Answer", text: item.a },
          })),
        }),
      },
    ],
  }),
  component: OperationalScoreRoute,
});

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[var(--radius-m)] border border-border bg-surface p-5 md:p-6">
      <h2 className="text-[16px] font-bold">{title}</h2>
      <div className="mt-3 space-y-3 text-body-sm leading-7 text-muted-foreground">{children}</div>
    </section>
  );
}

function OperationalScoreRoute() {
  return (
    <PublicShell>
      <PageHeading
        eyebrow="الشفافية"
        title="كيف يُحسب مؤشر الإنجاز التشغيلي"
        intro={PUBLIC_PRIVACY_NOTE}
      />
      <div className="container-page max-w-3xl space-y-4 py-10 md:py-14">
        <Card title="ماذا يقيس المؤشر">
          <p>
            المؤشر نسبة من 100 تصف مدى إنجاز أعمال المكتب في مواعيدها داخل مِهلة خلال آخر{" "}
            {SCORE_WINDOW_DAYS} يوماً، بتوقيت الرياض. يتكوّن من ثلاثة أبعاد بأوزان ثابتة لا تُعدَّل
            إدارياً ولا يمكن تجاوزها يدوياً:
          </p>
          <ul className="space-y-3">
            {DIMENSION_ORDER.map((key) => (
              <li key={key} className="rounded-[var(--radius-s)] border border-border p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[14px] font-semibold text-foreground">
                    {SCORE_DIMENSION_LABELS[key]}
                  </span>
                  <span className="text-[14px] font-bold tabular-nums text-primary">
                    {Math.round(SCORE_WEIGHTS[key] * 100)}%
                  </span>
                </div>
                <p className="mt-2 text-[13px] leading-6">{SCORE_DIMENSION_HINTS[key]}</p>
              </li>
            ))}
          </ul>
          <p>
            مثال مبسّط: مكتب أنجز 90% من مهله في موعدها، و80% من مهامه، وسجّل نتائج 100% من جلساته
            المنقضية، تكون نتيجته: (90×0.45) + (80×0.35) + (100×0.20) = 88.5%.
          </p>
        </Card>

        <Card title="متى يصبح المكتب مؤهلاً للاحتساب">
          <ul className="list-inside list-disc space-y-2">
            <li>مرور {MIN_ORGANIZATION_AGE_DAYS} يوماً على إنشاء المكتب.</li>
            <li>{MIN_TRACKING_DAYS} يوماً على الأقل من المتابعة الفعلية داخل المنصة.</li>
            <li>{MIN_ELIGIBLE_ITEMS} عملاً مؤهلاً على الأقل داخل نافذة القياس.</li>
            <li>{MIN_DEADLINES_OR_HEARINGS} مهل أو جلسات مستحقة على الأقل داخل النافذة.</li>
          </ul>
          <p>
            قبل استيفاء هذه الشروط تظهر النتيجة للمكتب بحالة «بيانات غير كافية»، ولا يدخل أي ترتيب
            عام. المهام التي تُنشأ وتُنجز خلال أقل من ساعة تُستبعد من الحساب لمنع تحسين النتيجة
            صناعياً.
          </p>
        </Card>

        <Card title="بيان الخصوصية — ما لا نطّلع عليه">
          <p>
            الحساب يعتمد على حالات ومواعيد فقط: هل العمل مستحق؟ هل أُنجز؟ هل أُنجز في موعده؟ ولا
            يدخل فيه أي محتوى قانوني. لا يُدخل ما يلي في الحساب ولا يظهر للعامة:
          </p>
          <ul className="list-inside list-disc space-y-2">
            {PUBLIC_EXCLUDED_DATA.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p>
            بيانات كل مكتب معزولة تماماً عن غيره، والمستندات مشفّرة ولا تُقرأ ضمن هذا المؤشر. تفاصيل
            أوسع في{" "}
            <Link
              to="/security"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              صفحة الأمان
            </Link>{" "}
            و
            <Link
              to="/privacy"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              {" "}
              سياسة الخصوصية
            </Link>
            .
          </p>
        </Card>

        <Card title="الظهور العام اختياري">
          <p>
            لا يظهر أي مكتب في قائمة «الأكثر إنجازاً» (أعلى {PUBLIC_RESULTS_COUNT} مكاتب) إلا بموافقة
            صريحة من مالك المكتب أو مديره، وتُسجَّل الموافقة وسحبها في سجل التدقيق. عند الموافقة يظهر
            للعامة فقط:
          </p>
          <ul className="list-inside list-disc space-y-2">
            {PUBLIC_VISIBLE_FIELDS.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p>{PUBLIC_RANKING_DISCLAIMER}</p>
        </Card>

        <Card title="أسئلة شائعة">
          <dl className="space-y-4">
            {FAQ.map((item) => (
              <div key={item.q}>
                <dt className="text-[14px] font-semibold text-foreground">{item.q}</dt>
                <dd className="mt-1.5 leading-7">{item.a}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
    </PublicShell>
  );
}
